// Full data backup (admin): one ZIP containing Excel dumps of every dataset
// + PDF copies of all invoices / credit notes / debit notes.
import { Router } from 'express';
import archiver from 'archiver';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/db.js';
import { adminRequired } from '../lib/auth.js';
import { generateInvoicePdf } from '../lib/pdf.js';
import { getSettings } from './settings.js';

const router = Router();
router.use(adminRequired);

const OMIT = new Set(['passHash', 'aadharDoc', 'panDoc', 'licenseDoc', 'rcDoc', 'insuranceDoc', 'receipt', 'logoDataUrl', 'signatureDataUrl']);
const flat = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v);
  return v;
};

async function sheetBuffer(name, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name.slice(0, 31));
  if (rows.length) {
    const keys = Object.keys(rows[0]).filter((k) => !OMIT.has(k));
    ws.columns = keys.map((k) => ({ header: k, key: k, width: Math.min(34, Math.max(12, k.length + 4)) }));
    ws.getRow(1).font = { bold: true };
    rows.forEach((r) => ws.addRow(Object.fromEntries(keys.map((k) => [k, flat(r[k])]))));
  } else {
    ws.addRow(['(no data)']);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

router.get('/', async (req, res, next) => {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="Bharath-Backup-${stamp}.zip"`);
    const ar = archiver('zip', { zlib: { level: 6 } });
    ar.on('error', next);
    ar.pipe(res);

    const dumps = [
      ['invoices', () => prisma.invoice.findMany({ include: { items: true } })],
      ['invoice-items', () => prisma.invoiceItem.findMany()],
      ['clients', () => prisma.customer.findMany()],
      ['employees', () => prisma.employee.findMany()],
      ['attendance', () => prisma.attendance.findMany()],
      ['attendance-requests', () => prisma.attendanceRequest.findMany()],
      ['leave-requests', () => prisma.leaveRequest.findMany()],
      ['expense-claims', () => prisma.expenseClaim.findMany()],
      ['tasks', () => prisma.staffTask.findMany({ include: { employee: { select: { name: true } } } })],
      ['site-visits', () => prisma.siteVisit.findMany()],
      ['site-visit-updates', () => prisma.siteVisitUpdate.findMany()],
      ['inventory', () => prisma.inventoryItem.findMany()],
      ['stock-movements', () => prisma.stockMovement.findMany({ include: { item: { select: { name: true } } } })],
      ['acc-groups', () => prisma.accGroup.findMany()],
      ['acc-ledgers', () => prisma.accLedger.findMany({ include: { group: { select: { name: true } } } })],
      ['acc-vouchers-journal', () => prisma.accVoucher.findMany()],
      ['acc-voucher-lines', () => prisma.accVoucherLine.findMany({ include: { ledger: { select: { name: true } } } })],
      ['acc-voucher-edit-log', () => prisma.accVoucherEdit.findMany()],
      ['bank-transactions', () => prisma.bankTxn.findMany()],
      ['suppliers', () => prisma.supplier.findMany()],
      ['purchase-bills', () => prisma.purchaseBill.findMany({ include: { items: true } })],
      ['purchase-items', () => prisma.purchaseItem.findMany()],
      ['fixed-assets', () => prisma.fixedAsset.findMany()],
      ['invoice-series', () => prisma.invoiceSeries.findMany()],
      ['users', () => prisma.user.findMany({ select: { id: true, username: true, role: true, perms: true, createdAt: true } })],
      ['sessions', () => prisma.session.findMany({ orderBy: { lastSeen: 'desc' }, take: 200 })],
      ['company-settings', () => prisma.companySettings.findMany()],
    ];

    for (const [name, fetch] of dumps) {
      const rows = await fetch();
      // flatten nested includes lightly
      const flatRows = rows.map((r) => {
        const o = { ...r };
        if (o.items) { o.itemCount = o.items.length; delete o.items; }
        if (o.employee) { o.employeeName = o.employee.name; delete o.employee; }
        if (o.item) { o.itemName = o.item.name; delete o.item; }
        if (o.group) { o.groupName = o.group.name; delete o.group; }
        if (o.ledger) { o.ledgerName = o.ledger.name; delete o.ledger; }
        return o;
      });
      ar.append(await sheetBuffer(name, flatRows), { name: `excel/${name}.xlsx` });
    }

    // PDFs for every billing document
    const settings = await getSettings();
    const docs = await prisma.invoice.findMany({ where: { status: { not: 'deleted' } }, include: { items: true } });
    for (const inv of docs) {
      try {
        const buf = await generateInvoicePdf(inv, settings);
        const folder = inv.docType === 'credit-note' ? 'credit-notes' : inv.docType === 'debit-note' ? 'debit-notes' : 'invoices';
        ar.append(buf, { name: `pdf/${folder}/${inv.invoiceNo.replace(/[^\w.-]+/g, '-')}.pdf` });
      } catch { /* skip a broken doc rather than failing the whole backup */ }
    }

    ar.append(Buffer.from(`Bharath Automation — full data backup\nGenerated: ${new Date().toISOString()}\nContents: excel/*.xlsx (all datasets incl. journal entries & edit logs) and pdf/* (all invoices, credit notes, debit notes).\n`), { name: 'README.txt' });
    await ar.finalize();
  } catch (e) { next(e); }
});

export default router;
