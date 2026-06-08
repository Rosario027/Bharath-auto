import { Router } from 'express';
import { authenticate, authRequired, changePassword } from '../lib/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const result = await authenticate((username || '').trim(), password || '');
    if (!result) return res.status(401).json({ error: 'Invalid user ID or password.' });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/me', authRequired, (req, res) => res.json({ user: req.user }));

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
