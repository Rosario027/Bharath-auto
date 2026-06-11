// Excel reports (GSTR-1 sales, employee attendance, stock) — available to
// both admin and the accountant login. Built with exceljs.
import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';
import { computeTotals } from '../lib/calc.js';

const router = Router();
router.use(authRequired);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const d10 = (d) => new Date(d).toISOString().slice(0, 10);

function range(req) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : '1900-01-01';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : '2999-12-31';
  return { from, to };
}

function headStyle(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8732B' } }; });
}

async function send(res, wb, name) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  await wb.xlsx.write(res);
  res.end();
}

// ── GST / Sales report (GSTR-1 style) ──
// Cancelled (deleted) invoices appear ONLY in the summary / documents-issued
// section — counted for the numbering record, never valued, and excluded
// from B2B / B2C / CN-DN / HSN sheets.
router.get('/sales', async (req, res, next) => {
  try {
    const { from, to } = range(req);
    const allDocs = await prisma.invoice.findMany({
      where: { invoiceDate: { gte: new Date(from), lte: new Date(`${to}T23:59:59`) } },
      include: { items: true },
      orderBy: { invoiceDate: 'asc' },
    });
    const invoices = allDocs.filter((i) => i.status !== 'deleted');
    const cancelled = allDocs.filter((i) => i.status === 'deleted');

    const sales = invoices.filter((i) => i.docType === 'invoice');
    const cns = invoices.filter((i) => i.docType === 'credit-note');
    const dns = invoices.filter((i) => i.docType === 'debit-note');
    const b2b = sales.filter((i) => (i.buyerGstn || '').trim());
    const b2c = sales.filter((i) => !(i.buyerGstn || '').trim());
    const cancelledSales = cancelled.filter((i) => i.docType === 'invoice');
    const sum = (list, f = (i) => i.grandTotal) => r2(list.reduce((s, i) => s + (f(i) || 0), 0));

    const wb = new ExcelJS.Workbook();

    // Summary
    const s = wb.addWorksheet('Summary');
    s.columns = [{ width: 36 }, { width: 18 }, { width: 16 }];
    s.addRow(['GST Sales Summary', '', '']).font = { bold: true, size: 14 };
    s.addRow([`Period: ${from} to ${to}`]);
    s.addRow([]);
    headStyle(s.addRow(['Particulars', 'Count', 'Value (₹)']));
    s.addRow(['Total Sales (invoices)', sales.length, sum(sales)]);
    s.addRow(['B2B Sales (with GSTIN)', b2b.length, sum(b2b)]);
    s.addRow(['B2C Sales (without GSTIN)', b2c.length, sum(b2c)]);
    s.addRow(['Credit Notes issued', cns.length, sum(cns)]);
    s.addRow(['Debit Notes issued', dns.length, sum(dns)]);
    const cancRow = s.addRow(['Cancelled Invoices (reporting only — no value)', cancelledSales.length, '']);
    cancRow.getCell(1).font = { italic: true, color: { argb: 'FF98A2B3' } };
    s.addRow(['Net Sales (Sales − CN + DN)', '', r2(sum(sales) - sum(cns) + sum(dns))]).font = { bold: true };
    s.addRow(['Taxable Value (sales)', '', sum(sales, (i) => i.subTotal)]);
    s.addRow(['CGST', '', sum(sales, (i) => i.cgstAmount)]);
    s.addRow(['SGST', '', sum(sales, (i) => i.sgstAmount)]);
    s.addRow(['IGST', '', sum(sales, (i) => i.igstAmount)]);

    // ── Documents issued (GSTR-1 Table 13 style) ──
    // Per series: numbering range, total raised, cancelled count & numbers.
    s.addRow([]);
    s.addRow(['DOCUMENTS ISSUED DURING THE PERIOD']).font = { bold: true, size: 12 };
    headStyle(s.addRow(['Series (by prefix)', 'From — To', 'Total Issued', 'Cancelled', 'Net Issued']));
    const allSalesDocs = allDocs.filter((i) => i.docType === 'invoice');
    const seriesOf = (no) => { const m = (no || '').match(/^(.*?)(\d+)$/); return m ? m[1] || '(no prefix)' : '(other)'; };
    const bySeries = new Map();
    for (const inv of allSalesDocs) {
      const key = seriesOf(inv.invoiceNo);
      const cur = bySeries.get(key) || { nos: [], cancelled: [] };
      cur.nos.push(inv.invoiceNo);
      if (inv.status === 'deleted') cur.cancelled.push(inv.invoiceNo);
      bySeries.set(key, cur);
    }
    const seqNum = (no) => { const m = (no || '').match(/(\d+)$/); return m ? Number(m[1]) : 0; };
    for (const [prefix, g] of [...bySeries.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const sorted = [...g.nos].sort((a, b) => seqNum(a) - seqNum(b));
      s.addRow([prefix, `${sorted[0]} — ${sorted[sorted.length - 1]}`, g.nos.length, g.cancelled.length, g.nos.length - g.cancelled.length]);
    }
    if (cancelledSales.length) {
      s.addRow([]);
      s.addRow(['Cancelled invoice numbers', cancelledSales.map((i) => i.invoiceNo).join(', ')]).font = { italic: true };
    }

    // Detail sheets
    const detailCols = [
      { header: 'Invoice No', key: 'no', width: 16 }, { header: 'Date', key: 'date', width: 12 },
      { header: 'Customer', key: 'cust', width: 26 }, { header: 'GSTIN', key: 'gstn', width: 18 },
      { header: 'Taxable', key: 'sub', width: 12 }, { header: 'CGST', key: 'cgst', width: 10 },
      { header: 'SGST', key: 'sgst', width: 10 }, { header: 'IGST', key: 'igst', width: 10 },
      { header: 'Total', key: 'tot', width: 12 }, { header: 'Against', key: 'ref', width: 14 },
    ];
    const fill = (ws, list) => {
      ws.columns = detailCols;
      headStyle(ws.getRow(1));
      for (const i of list) {
        ws.addRow({ no: i.invoiceNo, date: d10(i.invoiceDate), cust: i.buyerName, gstn: i.buyerGstn, sub: r2(i.subTotal), cgst: r2(i.cgstAmount), sgst: r2(i.sgstAmount), igst: r2(i.igstAmount), tot: r2(i.grandTotal), ref: i.againstInvoiceNo || '' });
      }
    };
    fill(wb.addWorksheet('B2B Invoices'), b2b);
    fill(wb.addWorksheet('B2C Invoices'), b2c);
    fill(wb.addWorksheet('Credit-Debit Notes'), [...cns, ...dns]);

    // HSN summary (sales invoices only)
    const hsn = new Map();
    for (const inv of sales) {
      const totals = computeTotals(inv);
      for (const it of totals.items) {
        const key = it.hsnCode || '(none)';
        const cur = hsn.get(key) || { hsn: key, desc: it.description, qty: 0, taxable: 0, tax: 0 };
        cur.qty += Number(it.qty) || 0;
        cur.taxable = r2(cur.taxable + it.total);
        cur.tax = r2(cur.tax + (it.total * (it.gstRate || 0)) / 100);
        hsn.set(key, cur);
      }
    }
    const h = wb.addWorksheet('HSN Summary');
    h.columns = [
      { header: 'HSN', key: 'hsn', width: 14 }, { header: 'Description (sample)', key: 'desc', width: 38 },
      { header: 'Qty Sold', key: 'qty', width: 12 }, { header: 'Taxable Value', key: 'taxable', width: 16 }, { header: 'Tax', key: 'tax', width: 12 },
    ];
    headStyle(h.getRow(1));
    [...hsn.values()].sort((a, b) => a.hsn.localeCompare(b.hsn)).forEach((x) => h.addRow(x));

    await send(res, wb, `GST-Sales-${from}-to-${to}.xlsx`);
  } catch (e) { next(e); }
});

// ── Employee attendance report (monthly) ──
router.get('/employees', async (req, res, next) => {
  try {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const employees = await prisma.employee.findMany({
      orderBy: { name: 'asc' },
      include: {
        attendance: { where: { date: { startsWith: month } } },
        leaves: { where: { status: 'approved' } },
      },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Attendance ${month}`);
    ws.columns = [
      { header: 'Employee', key: 'name', width: 24 }, { header: 'Days in Month', key: 'days', width: 14 },
      { header: 'Present', key: 'present', width: 10 }, { header: 'Clocked Days', key: 'clocked', width: 13 },
      { header: 'Manual Full Days', key: 'manual', width: 16 }, { header: 'Absent', key: 'absent', width: 10 },
      { header: 'Monthly Salary', key: 'salary', width: 15 },
    ];
    headStyle(ws.getRow(1));
    for (const e of employees) {
      const present = e.attendance.filter((a) => a.present).length;
      ws.addRow({
        name: e.name, days: daysInMonth, present,
        clocked: e.attendance.filter((a) => a.clockIn).length,
        manual: e.attendance.filter((a) => a.manual).length,
        absent: daysInMonth - present,
        salary: e.monthlySalary || 0,
      });
    }

    const det = wb.addWorksheet('Daily Log');
    det.columns = [
      { header: 'Employee', key: 'n', width: 24 }, { header: 'Date', key: 'd', width: 12 },
      { header: 'Clock In', key: 'ci', width: 10 }, { header: 'Clock Out', key: 'co', width: 10 },
      { header: 'Type', key: 't', width: 10 }, { header: 'Work Summary', key: 'w', width: 50 },
    ];
    headStyle(det.getRow(1));
    const time = (x) => (x ? new Date(x).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');
    for (const e of employees) {
      for (const a of [...e.attendance].sort((x, z) => x.date.localeCompare(z.date))) {
        det.addRow({ n: e.name, d: a.date, ci: time(a.clockIn), co: time(a.clockOut), t: a.manual ? 'Full day' : 'Clock', w: a.workSummary });
      }
    }

    await send(res, wb, `Employee-Report-${month}.xlsx`);
  } catch (e) { next(e); }
});

// ── Stock report (current stock + movements in range) ──
router.get('/stock', async (req, res, next) => {
  try {
    const { from, to } = range(req);
    const [items, movements] = await Promise.all([
      prisma.inventoryItem.findMany({ orderBy: { name: 'asc' } }),
      prisma.stockMovement.findMany({
        where: { createdAt: { gte: new Date(from), lte: new Date(`${to}T23:59:59`) } },
        orderBy: { createdAt: 'asc' },
        include: { item: { select: { name: true, unit: true } } },
      }),
    ]);

    const wb = new ExcelJS.Workbook();
    const cur = wb.addWorksheet('Current Stock');
    cur.columns = [
      { header: 'Item', key: 'name', width: 30 }, { header: 'SKU', key: 'sku', width: 14 },
      { header: 'HSN', key: 'hsn', width: 12 }, { header: 'Quantity', key: 'qty', width: 12 },
      { header: 'Unit', key: 'unit', width: 8 }, { header: 'Location', key: 'loc', width: 22 }, { header: 'Notes', key: 'notes', width: 28 },
    ];
    headStyle(cur.getRow(1));
    items.forEach((i) => cur.addRow({ name: i.name, sku: i.sku, hsn: i.hsnCode, qty: i.quantity, unit: i.unit, loc: i.location, notes: i.notes }));

    const mv = wb.addWorksheet('Movements');
    mv.columns = [
      { header: 'Date', key: 'd', width: 18 }, { header: 'Item', key: 'i', width: 30 },
      { header: 'In/Out', key: 'delta', width: 10 }, { header: 'Reason', key: 'r', width: 30 }, { header: 'By', key: 'by', width: 14 },
    ];
    headStyle(mv.getRow(1));
    movements.forEach((x) => mv.addRow({ d: new Date(x.createdAt).toLocaleString('en-IN'), i: x.item?.name, delta: x.delta, r: x.reason, by: x.byUsername }));

    await send(res, wb, `Stock-Report-${from}-to-${to}.xlsx`);
  } catch (e) { next(e); }
});

export default router;
