// Invoice totals. Mirrors server/lib/calc.js
// Per-line GST with inclusive/exclusive handling, grouped rate-wise;
// taxMode decides CGST+SGST vs IGST.
import { amountInWords } from './numberToWords.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function computeTotals(invoice) {
  const items = invoice.items || [];
  const taxMode = invoice.taxMode === 'inter' ? 'inter' : 'intra';

  const lineItems = items.map((it, idx) => {
    const qty = Number(it.qty) || 0;
    const price = Number(it.price) || 0;
    const gstRate = Number(it.gstRate) || 0;
    const gross = qty * price;
    const taxable = it.gstInclusive ? gross / (1 + gstRate / 100) : gross;
    return { ...it, slNo: idx + 1, gstRate, gstInclusive: !!it.gstInclusive, total: round2(taxable) };
  });

  const subTotal = round2(lineItems.reduce((s, it) => s + it.total, 0));

  const groups = {};
  for (const it of lineItems) {
    const r = it.gstRate;
    if (!groups[r]) groups[r] = { rate: r, taxable: 0 };
    groups[r].taxable = round2(groups[r].taxable + it.total);
  }

  let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
  const taxBreakup = Object.values(groups)
    .sort((a, b) => a.rate - b.rate)
    .map((g) => {
      if (taxMode === 'inter') {
        const igst = round2((g.taxable * g.rate) / 100);
        igstAmount = round2(igstAmount + igst);
        return { rate: g.rate, half: g.rate, taxable: g.taxable, cgst: 0, sgst: 0, igst };
      }
      const half = g.rate / 2;
      const cgst = round2((g.taxable * half) / 100);
      const sgst = round2((g.taxable * half) / 100);
      cgstAmount = round2(cgstAmount + cgst);
      sgstAmount = round2(sgstAmount + sgst);
      return { rate: g.rate, half, taxable: g.taxable, cgst, sgst, igst: 0 };
    });

  const taxedTotal = subTotal + cgstAmount + sgstAmount + igstAmount;
  const grandTotal = Math.round(taxedTotal);
  const roundOff = round2(grandTotal - taxedTotal);

  return {
    items: lineItems, taxMode, subTotal, taxBreakup,
    cgstAmount, sgstAmount, igstAmount, roundOff, grandTotal,
    amountWords: amountInWords(grandTotal),
  };
}
export default computeTotals;
