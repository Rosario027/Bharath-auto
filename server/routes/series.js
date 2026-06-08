import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { getSettings } from './settings.js';
import { ensureDefaultSeries } from '../lib/seed.js';
import { adminRequired } from '../lib/auth.js';

const router = Router();

async function listSeries() {
  await ensureDefaultSeries(await getSettings());
  return prisma.invoiceSeries.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
}

router.get('/', async (req, res, next) => {
  try {
    res.json(await listSeries());
  } catch (e) { next(e); }
});

router.post('/', adminRequired, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!(b.prefix || '').trim()) return res.status(400).json({ error: 'Series prefix is required' });
    const makeDefault = !!b.isDefault;
    if (makeDefault) await prisma.invoiceSeries.updateMany({ data: { isDefault: false } });
    const series = await prisma.invoiceSeries.create({
      data: {
        name: (b.name || 'Series').trim(),
        prefix: b.prefix.trim(),
        nextSeq: Number(b.nextSeq) > 0 ? Math.floor(Number(b.nextSeq)) : 1,
        padWidth: Number(b.padWidth) > 0 ? Math.floor(Number(b.padWidth)) : 4,
        isDefault: makeDefault,
      },
    });
    res.status(201).json(series);
  } catch (e) { next(e); }
});

router.put('/:id', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    if (b.isDefault) await prisma.invoiceSeries.updateMany({ data: { isDefault: false } });
    const data = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.prefix !== undefined) data.prefix = b.prefix;
    if (b.nextSeq !== undefined) data.nextSeq = Math.max(1, Math.floor(Number(b.nextSeq) || 1));
    if (b.padWidth !== undefined) data.padWidth = Math.max(1, Math.floor(Number(b.padWidth) || 4));
    if (b.isDefault !== undefined) data.isDefault = !!b.isDefault;
    const series = await prisma.invoiceSeries.update({ where: { id }, data });
    res.json(series);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Series not found' });
    next(e);
  }
});

router.delete('/:id', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const all = await prisma.invoiceSeries.findMany();
    if (all.length <= 1) return res.status(400).json({ error: 'At least one series is required' });
    const target = all.find((s) => s.id === id);
    await prisma.invoiceSeries.delete({ where: { id } });
    // keep one default
    if (target?.isDefault) {
      const remaining = await prisma.invoiceSeries.findFirst();
      if (remaining) await prisma.invoiceSeries.update({ where: { id: remaining.id }, data: { isDefault: true } });
    }
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Series not found' });
    next(e);
  }
});

export default router;
export { listSeries };
