// Inventory & stock — managed by BOTH admin and the accountant/staff login.
// Manual quantity changes and invoice deductions are journaled as movements.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { authRequired, adminRequired } from '../lib/auth.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res, next) => {
  try {
    res.json(await prisma.inventoryItem.findMany({ orderBy: { name: 'asc' } }));
  } catch (e) { next(e); }
});

router.get('/movements', async (req, res, next) => {
  try {
    const movements = await prisma.stockMovement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { item: { select: { name: true, unit: true } } },
    });
    res.json(movements);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!(b.name || '').trim()) return res.status(400).json({ error: 'Item name is required' });
    const qty = Number(b.quantity) || 0;
    const item = await prisma.inventoryItem.create({
      data: {
        name: b.name.trim(),
        sku: b.sku ?? '',
        hsnCode: b.hsnCode ?? '',
        quantity: qty,
        unit: (b.unit || 'Nos').trim(),
        location: b.location ?? '',
        notes: b.notes ?? '',
      },
    });
    if (qty !== 0) {
      await prisma.stockMovement.create({ data: { itemId: item.id, delta: qty, reason: 'Opening stock', byUsername: req.user.username } });
    }
    res.status(201).json(item);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const existing = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Item not found' });
    const data = {};
    for (const k of ['name', 'sku', 'hsnCode', 'unit', 'location', 'notes']) if (b[k] !== undefined) data[k] = b[k];
    if (b.quantity !== undefined) data.quantity = Number(b.quantity) || 0;
    const item = await prisma.inventoryItem.update({ where: { id }, data });
    if (b.quantity !== undefined && item.quantity !== existing.quantity) {
      await prisma.stockMovement.create({
        data: { itemId: id, delta: item.quantity - existing.quantity, reason: b.reason || 'Manual stock update', byUsername: req.user.username },
      });
    }
    res.json(item);
  } catch (e) { next(e); }
});

router.delete('/:id', adminRequired, async (req, res, next) => {
  try {
    await prisma.inventoryItem.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Item not found' });
    next(e);
  }
});

export default router;
