import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { computeTotals } from '../lib/calc.js';
import { getSettings } from './settings.js';

const router = Router();

function pad(n, width = 4) {
  return String(n).padStart(width, '0');
}

// Build a preview invoice number without consuming the sequence.
router.get('/next-number', async (req, res, next) => {
  try {
    const s = await getSettings();
    res.json({ invoiceNo: `${s.invoicePrefix}${pad(s.nextInvoiceSeq)}` });
  } catch (e) {
    next(e);
  }
});

// List (lightweight)
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const where = q
      ? {
          OR: [
            { invoiceNo: { contains: q, mode: 'insensitive' } },
            { buyerName: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};
    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { slNo: 'asc' } } },
    });
    res.json(invoices);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: Number(req.params.id) },
      include: { items: { orderBy: { slNo: 'asc' } } },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
  } catch (e) {
    next(e);
  }
});

function normalizeItems(items = [], defaultGstRate = 18) {
  return items
    .filter((it) => (it.description && it.description.trim()) || Number(it.qty) || Number(it.price))
    .map((it, idx) => ({
      slNo: idx + 1,
      description: (it.description || '').trim(),
      hsnCode: (it.hsnCode || '').toString().trim(),
      qty: Number(it.qty) || 0,
      unit: (it.unit || 'Nos').trim(),
      price: Number(it.price) || 0,
      gstRate: it.gstRate === undefined || it.gstRate === null || it.gstRate === ''
        ? Number(defaultGstRate) || 0
        : Number(it.gstRate) || 0,
      gstInclusive: !!it.gstInclusive,
      total: (Number(it.qty) || 0) * (Number(it.price) || 0),
    }));
}

// Find an existing customer by name (case-insensitive) or create one from the
// invoice's buyer snapshot, so every invoice's client lives in the Client module.
async function resolveCustomerId(tx, body) {
  if (body.customerId) return Number(body.customerId);
  const name = (body.buyerName || '').trim();
  if (!name) return null;
  const existing = await tx.customer.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  if (existing) return existing.id;
  const created = await tx.customer.create({
    data: {
      name,
      addressLines: Array.isArray(body.buyerAddressLines) ? body.buyerAddressLines.filter(Boolean) : [],
      contactPerson: body.buyerContactPerson || '',
      contactPhone: body.buyerContactPhone || '',
      email: body.buyerEmail || '',
      gstn: body.buyerGstn || '',
      stateCode: body.buyerStateCode || '',
    },
  });
  return created.id;
}

function buildScalarData(body, totals, settings) {
  return {
    invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : new Date(),
    title: body.title ?? settings.invoiceTitle,
    copyType: body.copyType ?? settings.invoiceCopy,
    transportMode: body.transportMode ?? 'By Road',
    poRefNo: body.poRefNo ?? '',
    paymentTerms: body.paymentTerms ?? settings.paymentTerms,
    customerId: body.customerId ? Number(body.customerId) : null,
    buyerName: (body.buyerName || '').trim(),
    buyerAddressLines: Array.isArray(body.buyerAddressLines) ? body.buyerAddressLines : [],
    buyerContactPerson: body.buyerContactPerson ?? '',
    buyerContactPhone: body.buyerContactPhone ?? '',
    buyerEmail: body.buyerEmail ?? '',
    buyerGstn: body.buyerGstn ?? '',
    buyerStateCode: body.buyerStateCode ?? '',
    taxMode: body.taxMode === 'inter' ? 'inter' : 'intra',
    cgstRate: Number(body.cgstRate ?? settings.defaultCgst),
    sgstRate: Number(body.sgstRate ?? settings.defaultSgst),
    igstRate: Number(body.igstRate ?? settings.defaultIgst),
    subTotal: totals.subTotal,
    cgstAmount: totals.cgstAmount,
    sgstAmount: totals.sgstAmount,
    igstAmount: totals.igstAmount,
    roundOff: totals.roundOff,
    grandTotal: totals.grandTotal,
    amountWords: totals.amountWords,
    theme: body.theme ?? settings.defaultTheme,
    notes: body.notes ?? '',
    status: body.status ?? 'draft',
  };
}

// Create
router.post('/', async (req, res, next) => {
  try {
    const settings = await getSettings();
    const body = req.body || {};
    const items = normalizeItems(body.items, settings.defaultGstRate);
    const totals = computeTotals({ ...body, items });

    // Generate invoice number if not supplied; consume the sequence.
    let invoiceNo = (body.invoiceNo || '').trim();
    let consume = false;
    if (!invoiceNo) {
      invoiceNo = `${settings.invoicePrefix}${pad(settings.nextInvoiceSeq)}`;
      consume = true;
    }

    const created = await prisma.$transaction(async (tx) => {
      const customerId = await resolveCustomerId(tx, body);
      const inv = await tx.invoice.create({
        data: {
          invoiceNo,
          ...buildScalarData(body, totals, settings),
          customerId,
          items: { create: items },
        },
        include: { items: { orderBy: { slNo: 'asc' } } },
      });
      if (consume) {
        await tx.companySettings.update({
          where: { id: 1 },
          data: { nextInvoiceSeq: settings.nextInvoiceSeq + 1 },
        });
      }
      return inv;
    });

    res.status(201).json(created);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Invoice number already exists' });
    next(e);
  }
});

// Update
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const settings = await getSettings();
    const body = req.body || {};
    const items = normalizeItems(body.items, settings.defaultGstRate);
    const totals = computeTotals({ ...body, items });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      const customerId = await resolveCustomerId(tx, body);
      return tx.invoice.update({
        where: { id },
        data: {
          ...(body.invoiceNo ? { invoiceNo: body.invoiceNo.trim() } : {}),
          ...buildScalarData(body, totals, settings),
          customerId,
          items: { create: items },
        },
        include: { items: { orderBy: { slNo: 'asc' } } },
      });
    });

    res.json(updated);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Invoice number already exists' });
    if (e.code === 'P2025') return res.status(404).json({ error: 'Invoice not found' });
    next(e);
  }
});

// Delete
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.invoice.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Invoice not found' });
    next(e);
  }
});

export default router;
