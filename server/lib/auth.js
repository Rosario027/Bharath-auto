// Lightweight, zero-dependency auth: HMAC-signed tokens + role guards.
// Two fixed accounts (overridable via env). Roles: 'admin' (full) and
// 'user' (invoicing only — no client data, no settings).
import crypto from 'node:crypto';
import { prisma } from './db.js';

const SECRET = process.env.AUTH_SECRET || 'bharath-automation-secret-change-in-railway-env';
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// ── Password hashing (scrypt, zero-dep) ──
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return safeEqual(hash, test);
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

export async function changePassword(username, currentPassword, newPassword) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !verifyPassword(currentPassword, user.passHash)) return { error: 'Current password is incorrect.' };
  if (!newPassword || String(newPassword).length < 4) return { error: 'New password must be at least 4 characters.' };
  await prisma.user.update({ where: { id: user.id }, data: { passHash: hashPassword(newPassword) } });
  return { ok: true };
}

export const IDLE_MS = 60 * 60 * 1000; // auto-logout after 60 min of inactivity

// ── Module permissions ──────────────────────────────────────────
// Each non-admin user carries perms JSON {module: 'none'|'user'|'full'}.
// 'user'  = restricted: only their own data (where the module supports it).
// 'full'  = admin-like visibility & actions inside that module.
export const MODULES = ['invoice', 'accounting', 'clients', 'siteVisits', 'inventory', 'reports'];
export const DEFAULT_PERMS = {
  user:  { invoice: 'full', accounting: 'full', clients: 'none', siteVisits: 'user', inventory: 'full', reports: 'full' },  // accountant
  staff: { invoice: 'none', accounting: 'none', clients: 'none', siteVisits: 'user', inventory: 'none', reports: 'none' },
};

export function resolvePerms(user) {
  if (!user) return {};
  if (user.role === 'admin') return Object.fromEntries(MODULES.map((m) => [m, 'full']));
  let stored = {};
  try { stored = user.perms ? JSON.parse(user.perms) : {}; } catch { /* ignore */ }
  return { ...(DEFAULT_PERMS[user.role] || DEFAULT_PERMS.user), ...stored };
}

// Gate a router: blocks users whose access to `mod` is 'none'
// (or below `min` — pass 'full' for admin-like sections).
export function requireMod(mod, min = 'user') {
  return (req, res, next) => {
    const level = req.user?.perms?.[mod] || 'none';
    const ok = min === 'full' ? level === 'full' : level !== 'none';
    if (!ok) return res.status(403).json({ error: 'You do not have access to this module.' });
    next();
  };
}

export async function authenticate(username, password, meta = {}) {
  const user = await prisma.user.findUnique({
    where: { username: (username || '').trim() },
    include: { employee: { select: { id: true, name: true } } },
  });
  if (!user || !verifyPassword(password, user.passHash)) return null;

  const sid = crypto.randomUUID();
  await prisma.session.create({
    data: { sid, username: user.username, role: user.role, ip: meta.ip || '', userAgent: meta.userAgent || '' },
  });

  const payload = { u: user.username, role: user.role, sid, exp: Date.now() + TTL_MS };
  return {
    token: sign(payload),
    user: {
      username: user.username,
      role: user.role,
      perms: resolvePerms(user),
      employeeId: user.employee?.id ?? null,
      employeeName: user.employee?.name ?? null,
    },
  };
}

export async function endSession(sid) {
  if (!sid) return;
  try { await prisma.session.update({ where: { sid }, data: { loggedOutAt: new Date() } }); } catch { /* already gone */ }
}

function readToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

export function authRequired(req, res, next) {
  const payload = verifyToken(readToken(req));
  if (!payload) return res.status(401).json({ error: 'Please sign in again.' });

  // Enforce the 60-minute inactivity timeout via the session record.
  (async () => {
    if (!payload.sid) return res.status(401).json({ error: 'Session expired — please sign in again.' });
    const session = await prisma.session.findUnique({ where: { sid: payload.sid } });
    if (!session || session.loggedOutAt) return res.status(401).json({ error: 'Session ended — please sign in again.' });
    if (Date.now() - new Date(session.lastSeen).getTime() > IDLE_MS) {
      await endSession(payload.sid);
      return res.status(401).json({ error: 'Session expired after inactivity — please sign in again.' });
    }
    // Sliding window: refresh lastSeen (throttled to one write per minute).
    if (Date.now() - new Date(session.lastSeen).getTime() > 60 * 1000) {
      await prisma.session.update({ where: { sid: payload.sid }, data: { lastSeen: new Date() } });
    }
    const dbUser = await prisma.user.findUnique({ where: { username: payload.u }, select: { role: true, perms: true } });
    if (!dbUser) return res.status(401).json({ error: 'Account no longer exists.' });
    req.user = { username: payload.u, role: dbUser.role, perms: resolvePerms({ role: dbUser.role, perms: dbUser.perms }) };
    req.sid = payload.sid;
    next();
  })().catch(next);
}

export function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });
    next();
  });
}

export default { authenticate, verifyToken, authRequired, adminRequired };
