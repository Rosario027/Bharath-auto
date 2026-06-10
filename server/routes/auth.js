import { Router } from 'express';
import { authenticate, authRequired, changePassword, endSession } from '../lib/auth.js';

const router = Router();

function clientMeta(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  return { ip, userAgent: (req.headers['user-agent'] || '').slice(0, 250) };
}

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const result = await authenticate((username || '').trim(), password || '', clientMeta(req));
    if (!result) return res.status(401).json({ error: 'Invalid user ID or password.' });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/me', authRequired, (req, res) => res.json({ user: req.user }));

// Keep-alive: refreshes the session's lastSeen (extends the 60-min window).
router.post('/ping', authRequired, (req, res) => res.json({ ok: true }));

router.post('/logout', authRequired, async (req, res, next) => {
  try { await endSession(req.sid); res.json({ ok: true }); } catch (e) { next(e); }
});

// Self-service password change (any logged-in user)
router.put('/change-password', authRequired, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const r = await changePassword(req.user.username, currentPassword, newPassword);
    if (r.error) return res.status(400).json({ error: r.error });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
