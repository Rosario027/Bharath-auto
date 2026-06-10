// Accounting module routes — available to admin AND the accountant login.
// Double-entry vouchers with balance validation, MCA Rule 11(g) edit log,
// trial balance / P&L / balance sheet / cash flow, fixed-asset schedule.
import { Router } from 'express';
import ExcelJS from 'exceljs';
import PdfPrinter from 'pdfmake/src/printer.js';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';
import { isValidDate } from '../lib/dates.js';
import { ensureCoA, ensureDemoBooks, nextVoucherNo, syncAllInvoices, VTYPES } from '../lib/accounting.js';

const printer = new PdfPrinter({ Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } });
const headStyle = (row) => { row.font = { bold: true, color: { argb: 'FFFFFFFF' } }; row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8732B' } }; }); };
async function sendXlsx(res, wb, name) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  await wb.xlsx.write(res);
  res.end();
}
function sendPdf(res, docDef, name) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  const doc = printer.createPdfKitDocument(docDef);
  doc.pipe(res);
  doc.end();
}

const router = Router();
router.use(authRequired);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── Groups ──
router.get('/groups', async (req, res, next) => {
  try {
    await ensureCoA();
    res.json(await prisma.accGroup.findMany({ orderBy: { name: 'asc' } }));
  } catch (e) { next(e); }
});

// ── Ledgers (with computed balances) ──
router.get('/ledgers', async (req, res, next) => {
  try {
    await ensureCoA();
    const [ledgers, sums] = await Promise.all([
      prisma.accLedger.findMany({ include: { group: true }, orderBy: { name: 'asc' } }),
      prisma.accVoucherLine.groupBy({ by: ['ledgerId'], _sum: { debit: true, credit: true } }),
    ]);
    const map = new Map(sums.map((s) => [s.ledgerId, s._sum]));
    res.json(ledgers.map((l) => {
      const s = map.get(l.id) || { debit: 0, credit: 0 };
      const opening = (l.openingType === 'cr' ? -1 : 1) * (l.openingBalance || 0);
      const net = r2(opening + (s.debit || 0) - (s.credit || 0)); // +ve = Dr
      return { ...l, totalDebit: r2(s.debit || 0), totalCredit: r2(s.credit || 0), balance: Math.abs(net), balanceType: net >= 0 ? 'dr' : 'cr' };
    }));
  } catch (e) { next(e); }
});

router.post('/ledgers', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!(b.name || '').trim()) return res.status(400).json({ error: 'Ledger name is required' });
    if (!b.groupId) return res.status(400).json({ error: 'Pick a group' });
    const ledger = await prisma.accLedger.create({
      data: {
        name: b.name.trim(), groupId: Number(b.groupId),
        openingBalance: Number(b.openingBalance) || 0,
        openingType: b.openingType === 'cr' ? 'cr' : 'dr',
        gstin: b.gstin ?? '', notes: b.notes ?? '',
      },
      include: { group: true },
    });
    res.status(201).json(ledger);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A ledger with that name already exists' });
    next(e);
  }
});

router.put('/ledgers/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const data = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.groupId !== undefined) data.groupId = Number(b.groupId);
    if (b.openingBalance !== undefined) data.openingBalance = Number(b.openingBalance) || 0;
    if (b.openingType !== undefined) data.openingType = b.openingType === 'cr' ? 'cr' : 'dr';
    if (b.gstin !== undefined) data.gstin = b.gstin;
    if (b.notes !== undefined) data.notes = b.notes;
    const ledger = await prisma.accLedger.update({ where: { id: Number(req.params.id) }, data, include: { group: true } });
    res.json(ledger);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A ledger with that name already exists' });
    if (e.code === 'P2025') return res.status(404).json({ error: 'Ledger not found' });
    next(e);
  }
});

router.delete('/ledgers/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ledger = await prisma.accLedger.findUnique({ where: { id } });
    if (!ledger) return res.status(404).json({ error: 'Ledger not found' });
    if (ledger.isSystem) return res.status(400).json({ error: 'Core system ledgers cannot be deleted' });
    const used = await prisma.accVoucherLine.count({ where: { ledgerId: id } });
    if (used > 0) return res.status(400).json({ error: `Ledger has ${used} voucher line(s) — delete those vouchers first` });
    await prisma.accLedger.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Ledger statement (account view)
router.get('/ledgers/:id/statement', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ledger = await prisma.accLedger.findUnique({ where: { id }, include: { group: true } });
    if (!ledger) return res.status(404).json({ error: 'Ledger not found' });
    const lines = await prisma.accVoucherLine.findMany({
      where: { ledgerId: id },
      include: { voucher: { select: { id: true, voucherNo: true, vtype: true, date: true, narration: true, refNo: true } } },
      orderBy: [{ voucher: { date: 'asc' } }, { id: 'asc' }],
    });
    res.json({ ledger, lines });
  } catch (e) { next(e); }
});

// ── Vouchers ──
function validateLines(rawLines) {
  const lines = (rawLines || [])
    .map((l, i) => ({ ledgerId: Number(l.ledgerId), debit: r2(l.debit), credit: r2(l.credit), sortOrder: i }))
    .filter((l) => l.ledgerId && (l.debit > 0 || l.credit > 0));
  if (lines.length < 2) return { error: 'A voucher needs at least two lines (one debit, one credit).' };
  const dr = r2(lines.reduce((s, l) => s + l.debit, 0));
  const cr = r2(lines.reduce((s, l) => s + l.credit, 0));
  if (dr !== cr) return { error: `Voucher does not balance — Dr ₹${dr} vs Cr ₹${cr}.` };
  if (lines.some((l) => l.debit > 0 && l.credit > 0)) return { error: 'A line can be either debit or credit, not both.' };
  return { lines, total: dr };
}

router.get('/vouchers', async (req, res, next) => {
  try {
    await ensureDemoBooks();
    const where = {};
    if (req.query.vtype && VTYPES.includes(req.query.vtype)) where.vtype = req.query.vtype;
    if (isValidDate(req.query.from) || isValidDate(req.query.to)) {
      where.date = {};
      if (isValidDate(req.query.from)) where.date.gte = req.query.from;
      if (isValidDate(req.query.to)) where.date.lte = req.query.to;
    }
    const vouchers = await prisma.accVoucher.findMany({
      where,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 300,
      include: { lines: { include: { ledger: { select: { name: true } } }, orderBy: { sortOrder: 'asc' } } },
    });
    res.json(vouchers.map((v) => ({ ...v, total: r2(v.lines.reduce((s, l) => s + l.debit, 0)) })));
  } catch (e) { next(e); }
});

router.get('/vouchers/:id', async (req, res, next) => {
  try {
    const voucher = await prisma.accVoucher.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        lines: { include: { ledger: { select: { name: true } } }, orderBy: { sortOrder: 'asc' } },
        edits: { orderBy: { changedAt: 'desc' } },
      },
    });
    if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
    res.json(voucher);
  } catch (e) { next(e); }
});

router.post('/vouchers', async (req, res, next) => {
  try {
    await ensureCoA();
    const b = req.body || {};
    const vtype = VTYPES.includes(b.vtype) ? b.vtype : 'journal';
    if (!isValidDate(b.date)) return res.status(400).json({ error: 'Pick a valid date' });
    const v = validateLines(b.lines);
    if (v.error) return res.status(400).json({ error: v.error });
    const voucher = await prisma.$transaction(async (tx) => tx.accVoucher.create({
      data: {
        voucherNo: await nextVoucherNo(tx, vtype),
        vtype, date: b.date,
        narration: b.narration ?? '', refNo: b.refNo ?? '',
        createdBy: req.user.username,
        lines: { create: v.lines },
      },
      include: { lines: { include: { ledger: { select: { name: true } } } } },
    }));
    res.status(201).json(voucher);
  } catch (e) { next(e); }
});

router.put('/vouchers/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const existing = await prisma.accVoucher.findUnique({ where: { id }, include: { lines: true } });
    if (!existing) return res.status(404).json({ error: 'Voucher not found' });
    const v = validateLines(b.lines);
    if (v.error) return res.status(400).json({ error: v.error });

    const oldTotal = r2(existing.lines.reduce((s, l) => s + l.debit, 0));
    const parts = [];
    if (b.date && b.date !== existing.date) parts.push(`Date ${existing.date} → ${b.date}`);
    if (oldTotal !== v.total) parts.push(`Amount ${oldTotal} → ${v.total}`);
    if ((b.narration ?? existing.narration) !== existing.narration) parts.push('Narration changed');
    if (existing.lines.length !== v.lines.length) parts.push(`Lines ${existing.lines.length} → ${v.lines.length}`);
    const summary = parts.length ? parts.join(' · ') : 'Entries updated';

    const voucher = await prisma.$transaction(async (tx) => {
      await tx.accVoucherLine.deleteMany({ where: { voucherId: id } });
      return tx.accVoucher.update({
        where: { id },
        data: {
          date: isValidDate(b.date) ? b.date : existing.date,
          narration: b.narration ?? existing.narration,
          refNo: b.refNo ?? existing.refNo,
          editCount: existing.editCount + 1,
          lines: { create: v.lines },
          edits: { create: { byUsername: req.user.username, summary } },
        },
        include: { lines: { include: { ledger: { select: { name: true } } } }, edits: { orderBy: { changedAt: 'desc' } } },
      });
    });
    res.json(voucher);
  } catch (e) { next(e); }
});

router.delete('/vouchers/:id', async (req, res, next) => {
  try {
    await prisma.accVoucher.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Voucher not found' });
    next(e);
  }
});

// Pull every invoice / CN / DN raised in the billing module into the books.
router.post('/sync-invoices', async (req, res, next) => {
  try { res.json(await syncAllInvoices()); } catch (e) { next(e); }
});

// ── Reports ──
async function ledgerBalances(from, to) {
  await ensureDemoBooks();
  const ledgers = await prisma.accLedger.findMany({ include: { group: true } });
  const whereDate = {};
  if (isValidDate(from)) whereDate.gte = from;
  if (isValidDate(to)) whereDate.lte = to;
  const lines = await prisma.accVoucherLine.findMany({
    where: Object.keys(whereDate).length ? { voucher: { date: whereDate } } : {},
    select: { ledgerId: true, debit: true, credit: true },
  });
  const sums = new Map();
  for (const l of lines) {
    const s = sums.get(l.ledgerId) || { debit: 0, credit: 0 };
    s.debit += l.debit; s.credit += l.credit;
    sums.set(l.ledgerId, s);
  }
  return ledgers.map((l) => {
    const s = sums.get(l.id) || { debit: 0, credit: 0 };
    const opening = (l.openingType === 'cr' ? -1 : 1) * (l.openingBalance || 0);
    const net = r2(opening + s.debit - s.credit);
    return {
      id: l.id, name: l.name, group: l.group.name, nature: l.group.nature,
      debit: r2(s.debit), credit: r2(s.credit), net,
    };
  });
}

router.get('/reports/trial-balance', async (req, res, next) => {
  try {
    const rows = (await ledgerBalances(req.query.from, req.query.to))
      .filter((l) => l.net !== 0 || l.debit !== 0 || l.credit !== 0)
      .map((l) => ({ ...l, drBalance: l.net > 0 ? l.net : 0, crBalance: l.net < 0 ? -l.net : 0 }));
    res.json({
      rows,
      totals: { dr: r2(rows.reduce((s, x) => s + x.drBalance, 0)), cr: r2(rows.reduce((s, x) => s + x.crBalance, 0)) },
    });
  } catch (e) { next(e); }
});

router.get('/reports/pnl', async (req, res, next) => {
  try {
    const all = await ledgerBalances(req.query.from, req.query.to);
    const income = all.filter((l) => l.nature === 'income' && l.net !== 0).map((l) => ({ ...l, amount: r2(-l.net) }));
    const expense = all.filter((l) => l.nature === 'expense' && l.net !== 0).map((l) => ({ ...l, amount: r2(l.net) }));
    const totalIncome = r2(income.reduce((s, x) => s + x.amount, 0));
    const totalExpense = r2(expense.reduce((s, x) => s + x.amount, 0));
    res.json({ income, expense, totalIncome, totalExpense, netProfit: r2(totalIncome - totalExpense) });
  } catch (e) { next(e); }
});

router.get('/reports/balance-sheet', async (req, res, next) => {
  try {
    const all = await ledgerBalances(req.query.from, req.query.to);
    const assets = all.filter((l) => l.nature === 'asset' && l.net !== 0).map((l) => ({ ...l, amount: r2(l.net) }));
    const liabilities = all.filter((l) => l.nature === 'liability' && l.net !== 0).map((l) => ({ ...l, amount: r2(-l.net) }));
    const income = all.filter((l) => l.nature === 'income').reduce((s, l) => s + -l.net, 0);
    const expense = all.filter((l) => l.nature === 'expense').reduce((s, l) => s + l.net, 0);
    const netProfit = r2(income - expense);
    const totalAssets = r2(assets.reduce((s, x) => s + x.amount, 0));
    const totalLiabilities = r2(liabilities.reduce((s, x) => s + x.amount, 0) + netProfit);
    res.json({ assets, liabilities, netProfit, totalAssets, totalLiabilities });
  } catch (e) { next(e); }
});

// Cash flow — receipts vs payments through Cash & Bank ledgers, grouped monthly.
router.get('/reports/cash-flow', async (req, res, next) => {
  try {
    await ensureDemoBooks();
    const cashLedgers = await prisma.accLedger.findMany({
      where: { group: { name: { in: ['Cash-in-Hand', 'Bank Accounts'] } } },
      select: { id: true, name: true },
    });
    const ids = cashLedgers.map((l) => l.id);
    const lines = await prisma.accVoucherLine.findMany({
      where: { ledgerId: { in: ids } },
      include: { voucher: { select: { date: true, vtype: true, narration: true, voucherNo: true } }, ledger: { select: { name: true } } },
      orderBy: { voucher: { date: 'asc' } },
    });
    const months = new Map();
    for (const l of lines) {
      const m = (l.voucher.date || '').slice(0, 7);
      const cur = months.get(m) || { month: m, inflow: 0, outflow: 0 };
      cur.inflow = r2(cur.inflow + l.debit);
      cur.outflow = r2(cur.outflow + l.credit);
      months.set(m, cur);
    }
    const rows = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, net: r2(m.inflow - m.outflow) }));
    res.json({
      ledgers: cashLedgers.map((l) => l.name),
      rows,
      entries: lines.map((l) => ({ date: l.voucher.date, voucherNo: l.voucher.voucherNo, vtype: l.voucher.vtype, ledger: l.ledger.name, in: l.debit, out: l.credit, narration: l.voucher.narration })).slice(-100),
    });
  } catch (e) { next(e); }
});

// ── Fixed assets + depreciation schedule ──
router.get('/assets', async (req, res, next) => {
  try {
    await ensureDemoBooks();
    const assets = await prisma.fixedAsset.findMany({ orderBy: { name: 'asc' } });
    const schedule = assets.map((a) => {
      const opening = r2(a.cost - a.accumulatedDep);
      const base = a.method === 'SLM' ? a.cost + a.additions : opening + a.additions;
      const depreciation = r2((base * (a.depRate || 0)) / 100);
      const closing = r2(opening + a.additions - depreciation);
      return { ...a, openingWdv: opening, depreciation, closingWdv: Math.max(0, closing) };
    });
    const totals = {
      cost: r2(schedule.reduce((s, a) => s + a.cost, 0)),
      additions: r2(schedule.reduce((s, a) => s + a.additions, 0)),
      depreciation: r2(schedule.reduce((s, a) => s + a.depreciation, 0)),
      closingWdv: r2(schedule.reduce((s, a) => s + a.closingWdv, 0)),
    };
    res.json({ schedule, totals });
  } catch (e) { next(e); }
});

router.post('/assets', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!(b.name || '').trim()) return res.status(400).json({ error: 'Asset name is required' });
    const asset = await prisma.fixedAsset.create({
      data: {
        name: b.name.trim(), category: b.category ?? '', purchaseDate: b.purchaseDate ?? '',
        cost: Number(b.cost) || 0, additions: Number(b.additions) || 0,
        accumulatedDep: Number(b.accumulatedDep) || 0, depRate: Number(b.depRate) || 0,
        method: b.method === 'SLM' ? 'SLM' : 'WDV', notes: b.notes ?? '',
      },
    });
    res.status(201).json(asset);
  } catch (e) { next(e); }
});

router.put('/assets/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const data = {};
    for (const k of ['name', 'category', 'purchaseDate', 'method', 'notes']) if (b[k] !== undefined) data[k] = b[k];
    for (const k of ['cost', 'additions', 'accumulatedDep', 'depRate']) if (b[k] !== undefined) data[k] = Number(b[k]) || 0;
    res.json(await prisma.fixedAsset.update({ where: { id: Number(req.params.id) }, data }));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Asset not found' });
    next(e);
  }
});

router.delete('/assets/:id', async (req, res, next) => {
  try {
    await prisma.fixedAsset.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Asset not found' });
    next(e);
  }
});

// ── Accounts overview (dashboard panel on the accounting tab) ──
router.get('/overview', async (req, res, next) => {
  try {
    const all = await ledgerBalances(req.query.from, req.query.to);
    const income = r2(all.filter((l) => l.nature === 'income').reduce((s, l) => s + -l.net, 0));
    const expense = r2(all.filter((l) => l.nature === 'expense').reduce((s, l) => s + l.net, 0));
    const assets = r2(all.filter((l) => l.nature === 'asset' && l.net > 0).reduce((s, l) => s + l.net, 0));
    const liabilities = r2(all.filter((l) => l.nature === 'liability' && l.net < 0).reduce((s, l) => s + -l.net, 0));
    const cashBank = r2(all.filter((l) => ['Cash-in-Hand', 'Bank Accounts'].includes(l.group)).reduce((s, l) => s + l.net, 0));
    const debtors = r2(all.filter((l) => l.group === 'Sundry Debtors' && l.net > 0).reduce((s, l) => s + l.net, 0));
    const creditors = r2(all.filter((l) => l.group === 'Sundry Creditors' && l.net < 0).reduce((s, l) => s + -l.net, 0));
    res.json({ income, expense, netProfit: r2(income - expense), assets, liabilities, cashBank, debtors, creditors });
  } catch (e) { next(e); }
});

// ── Bank statement import — template download ──
router.get('/bank-template', async (req, res, next) => {
  try {
    await ensureCoA();
    const ledgers = await prisma.accLedger.findMany({ include: { group: true }, orderBy: { name: 'asc' } });
    const wb = new ExcelJS.Workbook();

    const info = wb.addWorksheet('How to Fill');
    info.columns = [{ width: 64 }, { width: 30 }, { width: 26 }];
    info.addRow(['BANK STATEMENT IMPORT — INSTRUCTIONS']).font = { bold: true, size: 14 };
    info.addRow([]);
    [
      '1. Fill ONLY the "Bank Entries" sheet. Do not rename sheets or change the header row.',
      '2. Date — format YYYY-MM-DD (e.g. 2026-06-11) or use an Excel date cell.',
      '3. Debit — amount that went OUT of the bank. Credit — amount that came IN. Numbers only.',
      '4. Fill exactly ONE of Debit / Credit per row — never both, never neither.',
      '5. Description — narration for the entry (e.g. "NEFT rent June").',
      '6. Ledger — the counter ledger. Copy-paste EXACTLY from the list on the right.',
      '7. Money IN  → posted as Receipt:  Dr Bank / Cr Ledger.',
      '   Money OUT → posted as Payment: Dr Ledger / Cr Bank.',
      '8. If anything is invalid the whole file is rejected with row-wise errors — fix and re-upload.',
    ].forEach((t) => info.addRow([t]));
    info.addRow([]);
    info.getCell('B1').value = 'AVAILABLE LEDGERS (copy-paste)';
    info.getCell('B1').font = { bold: true };
    info.getCell('C1').value = 'Group';
    info.getCell('C1').font = { bold: true };
    ledgers.forEach((l, i) => {
      info.getCell(`B${i + 2}`).value = l.name;
      info.getCell(`C${i + 2}`).value = l.group?.name || '';
    });

    const data = wb.addWorksheet('Bank Entries');
    data.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Description', key: 'desc', width: 40 },
      { header: 'Debit', key: 'debit', width: 14 },
      { header: 'Credit', key: 'credit', width: 14 },
      { header: 'Ledger', key: 'ledger', width: 30 },
    ];
    headStyle(data.getRow(1));
    data.addRow({ date: new Date().toISOString().slice(0, 10), desc: 'EXAMPLE — NEFT received from customer (delete this row)', debit: '', credit: 25000, ledger: ledgers.find((l) => l.group?.name === 'Sundry Debtors')?.name || 'Sales' });

    await sendXlsx(res, wb, 'Bank-Import-Template.xlsx');
  } catch (e) { next(e); }
});

// ── Bank statement import — validated upload ──
router.post('/bank-import', async (req, res, next) => {
  try {
    await ensureCoA();
    const { bankLedgerId, dataBase64 } = req.body || {};
    const bank = await prisma.accLedger.findUnique({ where: { id: Number(bankLedgerId) || 0 } });
    if (!bank) return res.status(400).json({ error: 'Pick the bank ledger to post against.' });
    if (!dataBase64) return res.status(400).json({ error: 'No file received.' });

    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(Buffer.from(dataBase64, 'base64')); }
    catch { return res.status(400).json({ error: 'Not a valid .xlsx file — download the template and try again.' }); }

    const sheet = wb.getWorksheet('Bank Entries') || wb.worksheets[1] || wb.worksheets[0];
    if (!sheet) return res.status(400).json({ error: 'Sheet "Bank Entries" not found — use the provided template.' });
    const head = (i) => String(sheet.getRow(1).getCell(i).value || '').trim().toLowerCase();
    if (head(1) !== 'date' || head(3) !== 'debit' || head(4) !== 'credit' || head(5) !== 'ledger') {
      return res.status(400).json({ error: 'Header row changed — expected Date | Description | Debit | Credit | Ledger. Re-download the template.' });
    }

    const ledgers = await prisma.accLedger.findMany();
    const byName = new Map(ledgers.map((l) => [l.name.trim().toLowerCase(), l]));
    const errors = [];
    const rows = [];

    sheet.eachRow((row, rowNo) => {
      if (rowNo === 1) return;
      const raw = (i) => { const v = row.getCell(i).value; return v && typeof v === 'object' && 'result' in v ? v.result : v; };
      const vals = [raw(1), raw(2), raw(3), raw(4), raw(5)];
      if (vals.every((v) => v === null || v === undefined || String(v).trim() === '')) return; // skip blank rows
      const desc = String(vals[1] ?? '').trim();
      if (desc.toUpperCase().startsWith('EXAMPLE')) return; // skip sample row

      // Date
      let date = '';
      const dv = vals[0];
      if (dv instanceof Date) date = dv.toISOString().slice(0, 10);
      else if (isValidDate(String(dv || '').trim())) date = String(dv).trim();
      else errors.push({ row: rowNo, category: 'Invalid date', issue: `"${dv ?? ''}" — use YYYY-MM-DD (e.g. 2026-06-11)` });

      // Amounts
      const numOf = (v, label) => {
        if (v === null || v === undefined || String(v).trim() === '') return 0;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) { errors.push({ row: rowNo, category: 'Amount not a number', issue: `${label} contains "${v}" — numbers only` }); return NaN; }
        return n;
      };
      const debit = numOf(vals[2], 'Debit');
      const credit = numOf(vals[3], 'Credit');
      if (Number.isFinite(debit) && Number.isFinite(credit)) {
        if (debit > 0 && credit > 0) errors.push({ row: rowNo, category: 'Both amounts filled', issue: 'Fill only ONE of Debit / Credit per row' });
        if (debit === 0 && credit === 0) errors.push({ row: rowNo, category: 'No amount', issue: 'Either Debit or Credit must have a value' });
      }

      // Ledger
      const lname = String(vals[4] ?? '').trim();
      let ledger = null;
      if (!lname) errors.push({ row: rowNo, category: 'Missing ledger', issue: 'Ledger column is empty — copy a name from the "How to Fill" sheet' });
      else {
        ledger = byName.get(lname.toLowerCase());
        if (!ledger) errors.push({ row: rowNo, category: 'Ledger not found', issue: `"${lname}" does not exist — copy exactly from the ledger list` });
        else if (ledger.id === bank.id) errors.push({ row: rowNo, category: 'Invalid ledger', issue: 'Counter ledger cannot be the bank ledger itself' });
      }

      rows.push({ rowNo, date, desc, debit: debit || 0, credit: credit || 0, ledger });
    });

    if (rows.length === 0 && errors.length === 0) return res.status(400).json({ error: 'No data rows found in "Bank Entries".' });
    if (errors.length) return res.status(400).json({ error: `File rejected — ${errors.length} issue(s) found. Fix and re-upload.`, errors });

    let posted = 0;
    for (const r of rows) {
      const isIn = r.credit > 0; // money into bank
      const amount = isIn ? r.credit : r.debit;
      const vtype = isIn ? 'receipt' : 'payment';
      await prisma.$transaction(async (tx) => tx.accVoucher.create({
        data: {
          voucherNo: await nextVoucherNo(tx, vtype),
          vtype, date: r.date,
          narration: r.desc || `Bank import (${bank.name})`,
          refNo: 'BANK-IMPORT',
          createdBy: req.user.username,
          lines: {
            create: isIn
              ? [{ ledgerId: bank.id, debit: amount, credit: 0, sortOrder: 0 }, { ledgerId: r.ledger.id, debit: 0, credit: amount, sortOrder: 1 }]
              : [{ ledgerId: r.ledger.id, debit: amount, credit: 0, sortOrder: 0 }, { ledgerId: bank.id, debit: 0, credit: amount, sortOrder: 1 }],
          },
        },
      }));
      posted++;
    }
    res.json({ ok: true, posted });
  } catch (e) { next(e); }
});

// ── Ledger statement downloads (Excel + PDF) ──
async function statementData(id) {
  const ledger = await prisma.accLedger.findUnique({ where: { id }, include: { group: true } });
  if (!ledger) return null;
  const lines = await prisma.accVoucherLine.findMany({
    where: { ledgerId: id },
    include: { voucher: { select: { voucherNo: true, vtype: true, date: true, narration: true } } },
    orderBy: [{ voucher: { date: 'asc' } }, { id: 'asc' }],
  });
  return { ledger, lines };
}

router.get('/ledgers/:id/statement.xlsx', async (req, res, next) => {
  try {
    const d = await statementData(Number(req.params.id));
    if (!d) return res.status(404).json({ error: 'Ledger not found' });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Statement');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Voucher', key: 'no', width: 14 },
      { header: 'Type', key: 'type', width: 12 }, { header: 'Narration', key: 'narr', width: 44 },
      { header: 'Debit', key: 'dr', width: 14 }, { header: 'Credit', key: 'cr', width: 14 }, { header: 'Balance', key: 'bal', width: 18 },
    ];
    headStyle(ws.getRow(1));
    let run = (d.ledger.openingType === 'cr' ? -1 : 1) * (d.ledger.openingBalance || 0);
    ws.addRow({ narr: 'Opening balance', bal: `${Math.abs(run)} ${run >= 0 ? 'Dr' : 'Cr'}` });
    for (const l of d.lines) {
      run += (l.debit || 0) - (l.credit || 0);
      ws.addRow({ date: l.voucher.date, no: l.voucher.voucherNo, type: l.voucher.vtype, narr: l.voucher.narration, dr: l.debit || '', cr: l.credit || '', bal: `${r2(Math.abs(run))} ${run >= 0 ? 'Dr' : 'Cr'}` });
    }
    await sendXlsx(res, wb, `Ledger-${d.ledger.name.replace(/[^\w-]+/g, '-')}.xlsx`);
  } catch (e) { next(e); }
});

router.get('/ledgers/:id/statement.pdf', async (req, res, next) => {
  try {
    const d = await statementData(Number(req.params.id));
    if (!d) return res.status(404).json({ error: 'Ledger not found' });
    let run = (d.ledger.openingType === 'cr' ? -1 : 1) * (d.ledger.openingBalance || 0);
    const body = [
      ['Date', 'Voucher', 'Narration', 'Debit', 'Credit', 'Balance'].map((t) => ({ text: t, bold: true, color: '#fff', fillColor: '#E8732B' })),
      ['', '', { text: 'Opening balance', italics: true }, '', '', `${Math.abs(run)} ${run >= 0 ? 'Dr' : 'Cr'}`],
      ...d.lines.map((l) => {
        run += (l.debit || 0) - (l.credit || 0);
        return [l.voucher.date, l.voucher.voucherNo, l.voucher.narration || '', l.debit ? String(r2(l.debit)) : '', l.credit ? String(r2(l.credit)) : '', `${r2(Math.abs(run))} ${run >= 0 ? 'Dr' : 'Cr'}`];
      }),
    ];
    sendPdf(res, {
      pageSize: 'A4', pageMargins: [30, 34, 30, 34],
      defaultStyle: { font: 'Helvetica', fontSize: 8.5 },
      content: [
        { text: `Ledger Statement — ${d.ledger.name}`, bold: true, fontSize: 14 },
        { text: `Group: ${d.ledger.group?.name} · Generated ${new Date().toLocaleString('en-IN')}`, color: '#666', fontSize: 8, margin: [0, 2, 0, 8] },
        { table: { headerRows: 1, widths: [50, 55, '*', 55, 55, 70], body }, layout: { hLineColor: () => '#ddd', vLineColor: () => '#ddd', hLineWidth: () => 0.5, vLineWidth: () => 0.5 } },
      ],
    }, `Ledger-${d.ledger.name.replace(/[^\w-]+/g, '-')}.pdf`);
  } catch (e) { next(e); }
});

// ── Financials pack (TB + P&L + BS + Cash Flow + monthly tax summary) ──
router.get('/reports/financials.xlsx', async (req, res, next) => {
  try {
    const { from, to } = { from: req.query.from, to: req.query.to };
    const all = await ledgerBalances(from, to);
    const wb = new ExcelJS.Workbook();

    const tb = wb.addWorksheet('Trial Balance');
    tb.columns = [{ header: 'Ledger', width: 30 }, { header: 'Group', width: 24 }, { header: 'Debit', width: 14 }, { header: 'Credit', width: 14 }];
    headStyle(tb.getRow(1));
    let tdr = 0, tcr = 0;
    for (const l of all.filter((x) => x.net !== 0)) {
      const dr = l.net > 0 ? l.net : 0, cr = l.net < 0 ? -l.net : 0;
      tdr += dr; tcr += cr;
      tb.addRow([l.name, l.group, dr || '', cr || '']);
    }
    tb.addRow(['TOTAL', '', r2(tdr), r2(tcr)]).font = { bold: true };

    const income = all.filter((l) => l.nature === 'income' && l.net !== 0);
    const expense = all.filter((l) => l.nature === 'expense' && l.net !== 0);
    const ti = r2(income.reduce((s, l) => s + -l.net, 0));
    const te = r2(expense.reduce((s, l) => s + l.net, 0));
    const pl = wb.addWorksheet('Profit & Loss');
    pl.columns = [{ width: 34 }, { width: 16 }];
    headStyle(pl.addRow(['Particulars', 'Amount']));
    pl.addRow(['INCOME', '']).font = { bold: true };
    income.forEach((l) => pl.addRow([l.name, r2(-l.net)]));
    pl.addRow(['Total Income', ti]).font = { bold: true };
    pl.addRow(['EXPENSES', '']).font = { bold: true };
    expense.forEach((l) => pl.addRow([l.name, r2(l.net)]));
    pl.addRow(['Total Expenses', te]).font = { bold: true };
    pl.addRow([ti - te >= 0 ? 'NET PROFIT' : 'NET LOSS', r2(Math.abs(ti - te))]).font = { bold: true };

    const bs = wb.addWorksheet('Balance Sheet');
    bs.columns = [{ width: 34 }, { width: 16 }];
    headStyle(bs.addRow(['Particulars', 'Amount']));
    bs.addRow(['LIABILITIES & CAPITAL', '']).font = { bold: true };
    all.filter((l) => l.nature === 'liability' && l.net !== 0).forEach((l) => bs.addRow([l.name, r2(-l.net)]));
    bs.addRow(['Net Profit / (Loss)', r2(ti - te)]);
    bs.addRow(['ASSETS', '']).font = { bold: true };
    all.filter((l) => l.nature === 'asset' && l.net !== 0).forEach((l) => bs.addRow([l.name, r2(l.net)]));

    // Monthly summary for tax/GST filing: sales, purchases, expenses per month
    const lines = await prisma.accVoucherLine.findMany({ include: { voucher: { select: { date: true } }, ledger: { include: { group: true } } } });
    const months = new Map();
    for (const l of lines) {
      const m = (l.voucher.date || '').slice(0, 7);
      if (!m) continue;
      const cur = months.get(m) || { sales: 0, purchases: 0, expenses: 0, gstOut: 0, gstIn: 0 };
      const g = l.ledger.group;
      if (g.nature === 'income') cur.sales = r2(cur.sales + l.credit - l.debit);
      if (g.name === 'Purchase Accounts') cur.purchases = r2(cur.purchases + l.debit - l.credit);
      if (g.nature === 'expense' && g.name !== 'Purchase Accounts') cur.expenses = r2(cur.expenses + l.debit - l.credit);
      if (l.ledger.name.includes('Output')) cur.gstOut = r2(cur.gstOut + l.credit - l.debit);
      if (l.ledger.name.includes('Input')) cur.gstIn = r2(cur.gstIn + l.debit - l.credit);
      months.set(m, cur);
    }
    const ms = wb.addWorksheet('Monthly Summary');
    ms.columns = [{ header: 'Month', width: 12 }, { header: 'Sales', width: 14 }, { header: 'Purchases', width: 14 }, { header: 'Other Expenses', width: 16 }, { header: 'GST Output', width: 14 }, { header: 'GST Input', width: 14 }, { header: 'Net (Sales-Pur-Exp)', width: 18 }];
    headStyle(ms.getRow(1));
    [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([m, v]) => ms.addRow([m, v.sales, v.purchases, v.expenses, v.gstOut, v.gstIn, r2(v.sales - v.purchases - v.expenses)]));

    await sendXlsx(res, wb, `Financials${from ? `-${from}` : ''}${to ? `-to-${to}` : ''}.xlsx`);
  } catch (e) { next(e); }
});

export default router;
