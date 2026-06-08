// Admin CRUD for login-screen quotes + the daily schedule preview.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { adminRequired } from '../lib/auth.js';
import { ensureLoginQuotes } from '../lib/seed.js';

const router = Router();

router.use(adminRequired);

router.get('/', async (req, res, next) => {
  try {
    await ensureLoginQuotes();
    const quotes = await prisma.loginQuote.findMany({ orderBy: { sortOrder: 'asc' } });

    // 7-day schedule preview based on the active set + daily rotation
    const active = quotes.filter((q) => q.active);
    const baseDay = Math.floor(Date.now() / 86400000);
    const schedule = [];
    for (let i = 0; i < 7; i++) {
      const idx = active.length ? (((baseDay + i) % active.length) + active.length) % active.length : -1;
      schedule.push({ dayOffset: i, dateMs: (baseDay + i) * 86400000, quoteId: idx >= 0 ? active[idx].id : null });
    }
    res.json({ quotes, schedule });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!(b.text || '').trim()) return res.status(400).json({ error: 'Quote text is required' });
    const max = await prisma.loginQuote.aggregate({ _max: { sortOrder: true } });
    const q = await prisma.loginQuote.create({
      data: {
        text: b.text.trim(),
        meaning: (b.meaning || '').trim(),
        active: b.active !== false,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    res.status(201).json(q);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const data = {};
    if (b.text !== undefined) data.text = b.text;
    if (b.meaning !== undefined) data.meaning = b.meaning;
    if (b.active !== undefined) data.active = !!b.active;
    if (b.sortOrder !== undefined) data.sortOrder = Number(b.sortOrder) || 0;
    const q = await prisma.loginQuote.update({ where: { id: Number(req.params.id) }, data });
    res.json(q);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Quote not found' });
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.loginQuote.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Quote not found' });
    next(e);
  }
});

export default router;
