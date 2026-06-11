// Accounting engine: Tally-style chart of accounts, voucher numbering,
// invoice → voucher auto-posting and demo data. Indian double-entry books.
import { prisma } from './db.js';
import { computeTotals } from './calc.js';

// Tally's standard group tree (condensed) — name, nature, parent.
const GROUPS = [
  ['Capital Account', 'liability', ''],
  ['Reserves & Surplus', 'liability', 'Capital Account'],
  ['Loans (Liability)', 'liability', ''],
  ['Secured Loans', 'liability', 'Loans (Liability)'],
  ['Unsecured Loans', 'liability', 'Loans (Liability)'],
  ['Current Liabilities', 'liability', ''],
  ['Duties & Taxes', 'liability', 'Current Liabilities'],
  ['Provisions', 'liability', 'Current Liabilities'],
  ['Sundry Creditors', 'liability', 'Current Liabilities'],
  ['Fixed Assets', 'asset', ''],
  ['Investments', 'asset', ''],
  ['Current Assets', 'asset', ''],
  ['Bank Accounts', 'asset', 'Current Assets'],
  ['Cash-in-Hand', 'asset', 'Current Assets'],
  ['Deposits (Asset)', 'asset', 'Current Assets'],
  ['Loans & Advances (Asset)', 'asset', 'Current Assets'],
  ['Stock-in-Hand', 'asset', 'Current Assets'],
  ['Sundry Debtors', 'asset', 'Current Assets'],
  ['Sales Accounts', 'income', ''],
  ['Direct Income', 'income', ''],
  ['Indirect Income', 'income', ''],
  ['Purchase Accounts', 'expense', ''],
  ['Direct Expenses', 'expense', ''],
  ['Indirect Expenses', 'expense', ''],
  ['Suspense A/c', 'asset', ''],
];

// Core ledgers the posting engine relies on — [name, group, isSystem].
const LEDGERS = [
  ['Cash', 'Cash-in-Hand'],
  ['HDFC Bank', 'Bank Accounts'],
  ['Sales', 'Sales Accounts'],
  ['Purchase', 'Purchase Accounts'],
  ['CGST Output', 'Duties & Taxes'],
  ['SGST Output', 'Duties & Taxes'],
  ['IGST Output', 'Duties & Taxes'],
  ['CGST Input', 'Duties & Taxes'],
  ['SGST Input', 'Duties & Taxes'],
  ['IGST Input', 'Duties & Taxes'],
  ['Round Off', 'Indirect Expenses'],
  ['Capital', 'Capital Account'],
];

export const VTYPES = ['sales', 'purchase', 'payment', 'receipt', 'contra', 'journal', 'credit-note', 'debit-note'];
export const VPREFIX = { sales: 'SAL', purchase: 'PUR', payment: 'PMT', receipt: 'RCT', contra: 'CON', journal: 'JV', 'credit-note': 'CRN', 'debit-note': 'DBN' };

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const d10 = (d) => new Date(d).toISOString().slice(0, 10);

export async function ensureCoA() {
  if ((await prisma.accGroup.count()) === 0) {
    for (const [name, nature, parent] of GROUPS) {
      await prisma.accGroup.create({ data: { name, nature, parent } });
    }
    console.log('[seed] Accounting groups created (Tally-style CoA).');
  }
  if ((await prisma.accLedger.count()) === 0) {
    const groups = await prisma.accGroup.findMany();
    const gid = (n) => groups.find((g) => g.name === n)?.id;
    for (const [name, group] of LEDGERS) {
      await prisma.accLedger.create({ data: { name, groupId: gid(group), isSystem: true } });
    }
    console.log('[seed] Core ledgers created.');
  }
}

export async function ledgerByName(tx, name, groupName) {
  const found = await tx.accLedger.findUnique({ where: { name } });
  if (found) return found;
  const group = await tx.accGroup.findUnique({ where: { name: groupName } });
  return tx.accLedger.create({ data: { name, groupId: group.id } });
}

export async function nextVoucherNo(tx, vtype) {
  const count = await tx.accVoucher.count({ where: { vtype } });
  return `${VPREFIX[vtype] || 'VCH'}-${String(count + 1).padStart(4, '0')}`;
}

// Post a sales invoice / credit note / debit note into the books.
//  Sales:   Dr Customer (Sundry Debtors)  Cr Sales + Cr GST Output
//  CN:      reverse of sales              DN: same direction as sales
export async function postInvoiceToBooks(invoice) {
  await ensureCoA();
  const existing = await prisma.accVoucher.findUnique({ where: { sourceInvoiceId: invoice.id } });
  if (existing) return existing;
  if (invoice.status === 'deleted') return null;

  const totals = computeTotals(invoice);
  const isCN = invoice.docType === 'credit-note';
  const vtype = isCN ? 'credit-note' : invoice.docType === 'debit-note' ? 'debit-note' : 'sales';

  return prisma.$transaction(async (tx) => {
    const customer = await ledgerByName(tx, invoice.buyerName || 'Cash Customer', 'Sundry Debtors');
    const sales = await ledgerByName(tx, 'Sales', 'Sales Accounts');
    const lines = [];
    const push = (ledgerId, debit, credit) => { if (r2(debit) || r2(credit)) lines.push({ ledgerId, debit: r2(debit), credit: r2(credit), sortOrder: lines.length }); };

    // Normal sales direction; CN flips Dr/Cr.
    const D = (id, amt) => (isCN ? push(id, 0, amt) : push(id, amt, 0));
    const C = (id, amt) => (isCN ? push(id, amt, 0) : push(id, 0, amt));

    D(customer.id, totals.grandTotal);
    C(sales.id, totals.subTotal);
    if (totals.cgstAmount) C((await ledgerByName(tx, 'CGST Output', 'Duties & Taxes')).id, totals.cgstAmount);
    if (totals.sgstAmount) C((await ledgerByName(tx, 'SGST Output', 'Duties & Taxes')).id, totals.sgstAmount);
    if (totals.igstAmount) C((await ledgerByName(tx, 'IGST Output', 'Duties & Taxes')).id, totals.igstAmount);
    if (Math.abs(totals.roundOff) >= 0.005) {
      const ro = await ledgerByName(tx, 'Round Off', 'Indirect Expenses');
      // roundOff = grandTotal - taxedTotal; positive means customer pays more → income side (credit)
      if (totals.roundOff > 0) C(ro.id, totals.roundOff); else D(ro.id, -totals.roundOff);
    }

    const voucher = await tx.accVoucher.create({
      data: {
        voucherNo: await nextVoucherNo(tx, vtype),
        vtype,
        date: d10(invoice.invoiceDate),
        narration: `Auto-posted from ${invoice.docType === 'invoice' ? 'invoice' : invoice.docType} ${invoice.invoiceNo} (${invoice.buyerName})`,
        refNo: invoice.invoiceNo,
        sourceInvoiceId: invoice.id,
        createdBy: 'system',
        lines: { create: lines },
      },
      include: { lines: true },
    });
    return voucher;
  });
}

// Re-post an EDITED invoice: replace the linked voucher's lines with the
// recomputed amounts and journal the change (MCA audit trail).
export async function repostInvoiceToBooks(invoice, username = 'system') {
  const existing = await prisma.accVoucher.findUnique({ where: { sourceInvoiceId: invoice.id }, include: { lines: true } });
  if (!existing) return postInvoiceToBooks(invoice);

  const totals = computeTotals(invoice);
  const isCN = invoice.docType === 'credit-note';
  const oldTotal = r2(existing.lines.reduce((s, l) => s + l.debit, 0));

  return prisma.$transaction(async (tx) => {
    const customer = await ledgerByName(tx, invoice.buyerName || 'Cash Customer', 'Sundry Debtors');
    const sales = await ledgerByName(tx, 'Sales', 'Sales Accounts');
    const lines = [];
    const push = (ledgerId, debit, credit) => { if (r2(debit) || r2(credit)) lines.push({ ledgerId, debit: r2(debit), credit: r2(credit), sortOrder: lines.length }); };
    const D = (id, amt) => (isCN ? push(id, 0, amt) : push(id, amt, 0));
    const C = (id, amt) => (isCN ? push(id, amt, 0) : push(id, 0, amt));
    D(customer.id, totals.grandTotal);
    C(sales.id, totals.subTotal);
    if (totals.cgstAmount) C((await ledgerByName(tx, 'CGST Output', 'Duties & Taxes')).id, totals.cgstAmount);
    if (totals.sgstAmount) C((await ledgerByName(tx, 'SGST Output', 'Duties & Taxes')).id, totals.sgstAmount);
    if (totals.igstAmount) C((await ledgerByName(tx, 'IGST Output', 'Duties & Taxes')).id, totals.igstAmount);
    if (Math.abs(totals.roundOff) >= 0.005) {
      const ro = await ledgerByName(tx, 'Round Off', 'Indirect Expenses');
      if (totals.roundOff > 0) C(ro.id, totals.roundOff); else D(ro.id, -totals.roundOff);
    }

    await tx.accVoucherLine.deleteMany({ where: { voucherId: existing.id } });
    return tx.accVoucher.update({
      where: { id: existing.id },
      data: {
        date: d10(invoice.invoiceDate),
        narration: `Auto-posted from ${invoice.docType === 'invoice' ? 'invoice' : invoice.docType} ${invoice.invoiceNo} (${invoice.buyerName})`,
        editCount: existing.editCount + 1,
        lines: { create: lines },
        edits: { create: { byUsername: username, summary: `Source ${invoice.invoiceNo} edited — amount ${oldTotal} → ${r2(totals.grandTotal)}` } },
      },
    });
  });
}

// Remove a deleted invoice's voucher from the books.
export async function removeInvoiceFromBooks(invoiceId) {
  const v = await prisma.accVoucher.findUnique({ where: { sourceInvoiceId: invoiceId } });
  if (v) await prisma.accVoucher.delete({ where: { id: v.id } });
  return !!v;
}

// Post every invoice that isn't in the books yet (backfill / sync button).
export async function syncAllInvoices() {
  const invoices = await prisma.invoice.findMany({ where: { status: { not: 'deleted' } }, include: { items: true } });
  let posted = 0;
  for (const inv of invoices) {
    const v = await postInvoiceToBooks(inv).catch(() => null);
    if (v && Math.abs(Date.now() - new Date(v.createdAt).getTime()) < 5000) posted++;
  }
  return { total: invoices.length, posted };
}

// Demo books so reports show meaningful numbers immediately. Editable/deletable.
export async function ensureDemoBooks() {
  await ensureCoA();
  if ((await prisma.accVoucher.count({ where: { sourceInvoiceId: null } })) > 0) return;
  const today = new Date();
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const L = async (name, group, opening = 0, type = 'dr') => {
    const led = await ledgerByName(prisma, name, group);
    if (opening) await prisma.accLedger.update({ where: { id: led.id }, data: { openingBalance: opening, openingType: type } });
    return led;
  };

  const cash = await L('Cash', 'Cash-in-Hand');
  const bank = await L('HDFC Bank', 'Bank Accounts');
  const capital = await L('Capital', 'Capital Account');
  const purchase = await L('Purchase', 'Purchase Accounts');
  const creditor = await L('Sri Murugan Electricals', 'Sundry Creditors');
  const rent = await L('Office Rent', 'Indirect Expenses');
  const salaries = await L('Salaries', 'Indirect Expenses');
  const cgstIn = await L('CGST Input', 'Duties & Taxes');
  const sgstIn = await L('SGST Input', 'Duties & Taxes');

  const mk = async (vtype, date, narration, lines, refNo = '') => prisma.accVoucher.create({
    data: {
      voucherNo: await nextVoucherNo(prisma, vtype), vtype, date, narration, refNo, createdBy: 'demo',
      lines: { create: lines.map((l, i) => ({ ...l, sortOrder: i })) },
    },
  });

  // Capital introduced → bank
  await mk('receipt', `${ym}-01`, 'Capital introduced by proprietor', [
    { ledgerId: bank.id, debit: 500000, credit: 0 },
    { ledgerId: capital.id, debit: 0, credit: 500000 },
  ]);
  // Credit purchase with GST input
  await mk('purchase', `${ym}-03`, 'Stock purchase — gate motors & sensors (Bill SM/2026/118)', [
    { ledgerId: purchase.id, debit: 100000, credit: 0 },
    { ledgerId: cgstIn.id, debit: 9000, credit: 0 },
    { ledgerId: sgstIn.id, debit: 9000, credit: 0 },
    { ledgerId: creditor.id, debit: 0, credit: 118000 },
  ], 'SM/2026/118');
  // Part payment to creditor from bank
  await mk('payment', `${ym}-05`, 'Part payment to Sri Murugan Electricals', [
    { ledgerId: creditor.id, debit: 60000, credit: 0 },
    { ledgerId: bank.id, debit: 0, credit: 60000 },
  ]);
  // Cash withdrawn from bank (contra)
  await mk('contra', `${ym}-06`, 'Cash withdrawn for office use', [
    { ledgerId: cash.id, debit: 20000, credit: 0 },
    { ledgerId: bank.id, debit: 0, credit: 20000 },
  ]);
  // Expenses
  await mk('payment', `${ym}-07`, 'Office rent for the month', [
    { ledgerId: rent.id, debit: 15000, credit: 0 },
    { ledgerId: cash.id, debit: 0, credit: 15000 },
  ]);
  await mk('journal', `${ym}-08`, 'Salaries provision for the month', [
    { ledgerId: salaries.id, debit: 45000, credit: 0 },
    { ledgerId: (await L('Salaries Payable', 'Provisions')).id, debit: 0, credit: 45000 },
  ]);

  // Demo fixed assets
  if ((await prisma.fixedAsset.count()) === 0) {
    await prisma.fixedAsset.createMany({
      data: [
        { name: 'Office Computer & Printer', category: 'Computers', purchaseDate: `${today.getFullYear() - 1}-04-10`, cost: 85000, depRate: 40, method: 'WDV', accumulatedDep: 34000 },
        { name: 'Two-wheeler (TN37EX8218)', category: 'Vehicles', purchaseDate: `${today.getFullYear() - 1}-06-01`, cost: 95000, depRate: 15, method: 'WDV', accumulatedDep: 14250 },
        { name: 'Office Furniture', category: 'Furniture & Fixtures', purchaseDate: `${today.getFullYear() - 2}-04-01`, cost: 60000, depRate: 10, method: 'SLM', accumulatedDep: 12000 },
      ],
    });
  }
  console.log('[seed] Demo accounting books created.');
}

export default { ensureCoA, postInvoiceToBooks, syncAllInvoices, ensureDemoBooks };
