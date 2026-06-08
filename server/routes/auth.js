import { Router } from 'express';
import { authenticate, authRequired } from '../lib/auth.js';

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

export default router;
