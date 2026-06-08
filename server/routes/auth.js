import { Router } from 'express';
import { authenticate, authRequired } from '../lib/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const result = authenticate((username || '').trim(), password || '');
  if (!result) return res.status(401).json({ error: 'Invalid user ID or password.' });
  res.json(result);
});

router.get('/me', authRequired, (req, res) => res.json({ user: req.user }));

export default router;
