import { Router } from 'express';
import nodemailer from 'nodemailer';
import { prisma } from '../lib/db.js';
import { getSettings } from './settings.js';
import { generateInvoicePdf } from '../lib/pdf.js';
import { generateInvoiceDocx } from '../lib/docx.js';
import { formatINR } from '../lib/money.js';

const router = Router();

function emailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

router.get('/status', (req, res) => {
  res.json({ emailConfigured: emailConfigured() });
});

// Send an invoice by email with PDF (and optionally Word) attached.
router.post('/:id/email', async (req, res, next) => {
  try {
    if (!emailConfigured()) {
      return res.status(400).json({
        error: 'Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in the environment.',
      });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: Number(req.params.id) },
      include: { items: { orderBy: { slNo: 'asc' } } },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const settings = await getSettings();
    const to = (req.body.to || invoice.buyerEmail || '').trim();
    if (!to) return res.status(400).json({ error: 'No recipient email address.' });

    const includeWord = !!req.body.includeWord;
    const pdfBuf = await generateInvoicePdf(invoice, settings);
    const attachments = [{ filename: `${invoice.invoiceNo}.pdf`, content: pdfBuf }];
    if (includeWord) {
      const docBuf = await generateInvoiceDocx(invoice, settings);
      attachments.push({ filename: `${invoice.invoiceNo}.docx`, content: docBuf });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE) === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const subject = req.body.subject || `Invoice ${invoice.invoiceNo} from ${settings.companyName}`;
    const bodyText =
      req.body.message ||
      `Dear ${invoice.buyerName || 'Customer'},\n\nPlease find attached invoice ${invoice.invoiceNo} for Rs. ${formatINR(invoice.grandTotal)}.\n\nThank you for your business.\n\nRegards,\n${settings.companyName}\n${(settings.phones || []).join(', ')}`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: bodyText,
      attachments,
    });

    res.json({ ok: true, to });
  } catch (e) {
    next(e);
  }
});

export default router;
