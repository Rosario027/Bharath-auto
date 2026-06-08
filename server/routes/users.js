// Admin user management — list, create, reset password, delete.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { adminRequired, hashPassword } from '../lib/auth.js';
import { ensureUsers } from '../lib/seed.js';

const router = Router();
router.use(adminRequired);

router.get('/', async (req, res, next) => {
  try {
    await ensureUsers();
    const users = await prisma.user.findMany({ orderBy: { id: 'asc' }, select: { id: true, username: true, role: true, createdAt: true } });
    res.json(users);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { username, password, role } = req.body || {};
    if (!(username || '').trim() || !(password || '').trim()) return res.status(400).json({ error: 'Username and password are required' });
    const user = await prisma.user.create({
      data: { username: username.trim(), role: role === 'admin' ? 'admin' : 'user', passHash: hashPassword(password) },
      select: { id: true, username: true, role: true },
    });
    res.status(201).json(user);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'That user ID already exists' });
    next(e);
  }
});

router.put('/:id/password', async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!(password || '').trim() || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    await prisma.user.update({ where: { id: Number(req.params.id) }, data: { passHash: hashPassword(password) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'admin') {
      const admins = await prisma.user.count({ where: { role: 'admin' } });
      if (admins <= 1) return res.status(400).json({ error: 'Cannot delete the only admin' });
    }
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
