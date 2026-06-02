// Single source of truth for invoice totals. Mirrored on the client
// (client/src/utils/calc.js) so the live preview matches what is stored.
//
// GST is computed PER LINE from each item's gstRate, then grouped rate-wise.
// Sale type (invoice.taxMode) decides whether each line's GST becomes
// CGST+SGST (intra-state) or IGST (inter-state).
import { amountInWords } from './numberToWords.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function computeTotals(invoice) {
  const items = invoice.items || [];
  const taxMode = invoice.taxMode === 'inter' ? 'inter' : 'intra';

  const lineItems = items.map((it, idx) => {
    const qty = Number(it.qty) || 0;
    const price = Number(it.price) || 0;
    const gstRate = Number(it.gstRate) || 0;
    return { ...it, slNo: idx + 1, gstRate, total: round2(qty * price) };
  });

  const subTotal = round2(lineItems.reduce((s, it) => s + it.total, 0));

  // Group taxable value by GST rate
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
  const grandTotal = Math.round(taxedTotal); // round to nearest rupee
  const roundOff = round2(grandTotal - taxedTotal);

  return {
    items: lineItems,
    taxMode,
    subTotal,
    taxBreakup,
    cgstAmount,
    sgstAmount,
    igstAmount,
    roundOff,
    grandTotal,
    amountWords: amountInWords(grandTotal),
  };
}

export default computeTotals;
