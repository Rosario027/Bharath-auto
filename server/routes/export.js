import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { getSettings } from './settings.js';
import { generateInvoicePdf } from '../lib/pdf.js';
import { generateInvoiceDocx } from '../lib/docx.js';

const router = Router();

function safeName(invoice, ext) {
  const no = (invoice.invoiceNo || 'invoice').replace(/[^\w.-]+/g, '-');
  const buyer = (invoice.buyerName || '').replace(/[^\w.-]+/g, '-').slice(0, 24);
  return `${no}${buyer ? '-' + buyer : ''}.${ext}`;
}

async function loadInvoice(id) {
  return prisma.invoice.findUnique({
    where: { id: Number(id) },
    include: { items: { orderBy: { slNo: 'asc' } } },
  });
}

// ── By saved id ──
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const invoice = await loadInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const settings = await getSettings();
    const buf = await generateInvoicePdf(invoice, settings);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename="${safeName(invoice, 'pdf')}"`);
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

router.get('/:id/docx', async (req, res, next) => {
  try {
    const invoice = await loadInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const settings = await getSettings();
    const buf = await generateInvoiceDocx(invoice, settings);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName(invoice, 'docx')}"`);
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

// ── Ad-hoc (unsaved preview) ──
router.post('/pdf', async (req, res, next) => {
  try {
    const settings = await getSettings();
    const invoice = req.body || {};
    const buf = await generateInvoicePdf(invoice, settings);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName(invoice, 'pdf')}"`);
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

router.post('/docx', async (req, res, next) => {
  try {
    const settings = await getSettings();
    const invoice = req.body || {};
    const buf = await generateInvoiceDocx(invoice, settings);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName(invoice, 'docx')}"`);
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

export default router;
