import { Router } from 'express';
import { prisma } from '../lib/db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({ orderBy: { name: 'asc' } });
    res.json(customers);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const customer = await prisma.customer.create({
      data: {
        name: (b.name || '').trim(),
        addressLines: Array.isArray(b.addressLines) ? b.addressLines : [],
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

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.customer.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
