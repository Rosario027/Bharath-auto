// Accounting module routes — available to admin AND the accountant login.
// Double-entry vouchers with balance validation, MCA Rule 11(g) edit log,
// trial balance / P&L / balance sheet / cash flow, fixed-asset schedule.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';
import { isValidDate } from '../lib/dates.js';
import { ensureCoA, ensureDemoBooks, nextVoucherNo, syncAllInvoices, VTYPES } from '../lib/accounting.js';

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

export default router;
