import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { adminRequired, authRequired } from '../lib/auth.js';

const router = Router();

// All authenticated users can list active payment terms (for the invoice dropdown)
router.get('/', authRequired, async (req, res, next) => {
  try {
    const terms = await prisma.paymentTerm.findMany({
      where: req.query.all === 'true' ? {} : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    res.json(terms);
  } catch (e) { next(e); }
});

// Admin: create custom payment term
router.post('/', adminRequired, async (req, res, next) => {
  try {
    const { label, sortOrder } = req.body || {};
    if (!(label || '').trim()) return res.status(400).json({ error: 'Label is required' });
    const term = await prisma.paymentTerm.create({
      data: { label: label.trim(), sortOrder: Number(sortOrder) || 0, active: true },
    });
    res.status(201).json(term);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Payment term with this label already exists' });
    next(e);
  }
});

// Admin: edit / deactivate payment term
router.put('/:id', adminRequired, async (req, res, next) => {
  try {
    const { label, active, sortOrder } = req.body || {};
    const data = {};
    if (label !== undefined) data.label = label.trim();
    if (active !== undefined) data.active = Boolean(active);
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);
    const term = await prisma.paymentTerm.update({ where: { id: Number(req.params.id) }, data });
    res.json(term);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Payment term not found' });
    next(e);
  }
});

// Admin: delete payment term
router.delete('/:id', adminRequired, async (req, res, next) => {
  try {
    await prisma.paymentTerm.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Payment term not found' });
    next(e);
  }
});

export default router;
