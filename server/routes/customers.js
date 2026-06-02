import { Router } from 'express';
import { prisma } from '../lib/db.js';

const router = Router();

// List with invoice counts & totals (for sorting/filtering on the client)
router.get('/', async (req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { name: 'asc' },
      include: { invoices: { select: { grandTotal: true } } },
    });
    const out = customers.map((c) => ({
      ...c,
      invoiceCount: c.invoices.length,
      totalBilled: c.invoices.reduce((s, i) => s + (i.grandTotal || 0), 0),
      invoices: undefined,
    }));
    res.json(out);
  } catch (e) {
    next(e);
  }
});

// Single customer with their invoices
router.get('/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: Number(req.params.id) },
      include: { invoices: { orderBy: { createdAt: 'desc' } } },
    });
    if (!customer) return res.status(404).json({ error: 'Client not found' });
    res.json(customer);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!(b.name || '').trim()) return res.status(400).json({ error: 'Client name is required' });
    const customer = await prisma.customer.create({
      data: {
        name: b.name.trim(),
        addressLines: Array.isArray(b.addressLines) ? b.addressLines.filter(Boolean) : [],
        contactPerson: b.contactPerson || '',
        contactPhone: b.contactPhone || '',
        email: b.email || '',
        gstn: b.gstn || '',
        stateCode: b.stateCode || '',
      },
    });
    res.status(201).json(customer);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const data = {};
    for (const k of ['name', 'contactPerson', 'contactPhone', 'email', 'gstn', 'stateCode']) {
      if (b[k] !== undefined) data[k] = b[k];
    }
    if (Array.isArray(b.addressLines)) data.addressLines = b.addressLines.filter(Boolean);
    const customer = await prisma.customer.update({ where: { id: Number(req.params.id) }, data });
    res.json(customer);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Client not found' });
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.customer.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
