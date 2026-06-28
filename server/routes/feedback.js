import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { adminRequired, authRequired } from '../lib/auth.js';

const router = Router();

// Staff: submit anonymous feedback
router.post('/', authRequired, async (req, res, next) => {
  try {
    const { category, message } = req.body || {};
    if (!(message || '').trim()) return res.status(400).json({ error: 'Message is required' });
    const VALID_CATS = ['suggestion', 'feedback', 'complaint', 'general'];
    const feedback = await prisma.staffFeedback.create({
      data: {
        category: VALID_CATS.includes(category) ? category : 'general',
        message: message.trim(),
      },
    });
    // Return without any identifying info
    res.status(201).json({ id: feedback.id, category: feedback.category, createdAt: feedback.createdAt });
  } catch (e) { next(e); }
});

// Admin: view all submissions (unread count + list)
router.get('/', adminRequired, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.read === 'false') where.read = false;
    if (req.query.category) where.category = req.query.category;
    const [items, unreadCount] = await Promise.all([
      prisma.staffFeedback.findMany({ where, orderBy: { createdAt: 'desc' } }),
      prisma.staffFeedback.count({ where: { read: false } }),
    ]);
    res.json({ unreadCount, items });
  } catch (e) { next(e); }
});

// Admin: mark as read
router.put('/:id/read', adminRequired, async (req, res, next) => {
  try {
    await prisma.staffFeedback.update({ where: { id: Number(req.params.id) }, data: { read: true } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Feedback not found' });
    next(e);
  }
});

// Admin: mark all as read
router.put('/mark-all-read', adminRequired, async (req, res, next) => {
  try {
    await prisma.staffFeedback.updateMany({ where: { read: false }, data: { read: true } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
