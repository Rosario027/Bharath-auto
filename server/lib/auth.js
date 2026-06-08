// Lightweight, zero-dependency auth: HMAC-signed tokens + role guards.
// Two fixed accounts (overridable via env). Roles: 'admin' (full) and
// 'user' (invoicing only — no client data, no settings).
import crypto from 'node:crypto';

const SECRET = process.env.AUTH_SECRET || 'bharath-automation-secret-change-in-railway-env';
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const ACCOUNTS = {
  [process.env.ADMIN_USER || 'Admin']: { password: process.env.ADMIN_PASS || 'Admin123', role: 'admin' },
  [process.env.USER_USER || 'User']: { password: process.env.USER_PASS || 'User123', role: 'user' },
};

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

export function authenticate(username, password) {
  const acc = ACCOUNTS[username];
  if (!acc || !safeEqual(acc.password, password)) return null;
  const payload = { u: username, role: acc.role, exp: Date.now() + TTL_MS };
  return { token: sign(payload), user: { username, role: acc.role } };
}

function readToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

export function authRequired(req, res, next) {
  const payload = verifyToken(readToken(req));
  if (!payload) return res.status(401).json({ error: 'Please sign in again.' });
  req.user = { username: payload.u, role: payload.role };
  next();
}

export function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });
    next();
  });
}

export default { authenticate, verifyToken, authRequired, adminRequired };
