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

// Financial health preview — outstanding invoices for a customer
router.get('/:id/outstanding', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: Number(req.params.id) },
      select: { id: true, name: true },
    });
    if (!customer) return res.status(404).json({ error: 'Client not found' });

    const invoices = await prisma.invoice.findMany({
      where: {
        customerId: customer.id,
        status: 'issued',
        grandTotal: { gt: 0 },
      },
      orderBy: { invoiceDate: 'asc' },
      select: {
        id: true, invoiceNo: true, invoiceDate: true, paymentTerms: true,
        grandTotal: true, amountPaid: true,
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue = invoices
      .map((inv) => {
        const balanceDue = inv.grandTotal - (inv.amountPaid || 0);
        if (balanceDue <= 0.01) return null;

        // Compute due date from paymentTerms string
        const invDate = new Date(inv.invoiceDate);
        let dueDate = new Date(invDate);
        const terms = (inv.paymentTerms || '').toLowerCase();
        if (terms.includes('net 15')) dueDate.setDate(dueDate.getDate() + 15);
        else if (terms.includes('net 30')) dueDate.setDate(dueDate.getDate() + 30);
        else if (terms.includes('net 60')) dueDate.setDate(dueDate.getDate() + 60);
        // COD / Immediate => due on invoice date

        const daysOverdue = Math.max(0, Math.floor((today - dueDate) / (1000 * 60 * 60 * 24)));

        return {
          id: inv.id,
          invoiceNo: inv.invoiceNo,
          invoiceDate: inv.invoiceDate,
          dueDate: dueDate.toISOString().slice(0, 10),
          daysOverdue,
          balanceDue: Math.round(balanceDue * 100) / 100,
        };
      })
      .filter(Boolean);

    const totalOutstanding = overdue.reduce((s, r) => s + r.balanceDue, 0);

    res.json({ customerId: customer.id, name: customer.name, totalOutstanding, invoices: overdue });
  } catch (e) { next(e); }
});

// Indexed customer search (for fast autocomplete)
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const customers = await prisma.customer.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
      take: 15,
      select: { id: true, name: true, contactPerson: true, contactPhone: true, gstn: true, addressLines: true },
    });
    res.json(customers);
  } catch (e) { next(e); }
});

export default router;
