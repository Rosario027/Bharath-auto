// Invoice totals. Mirrors server/lib/calc.js
import { amountInWords } from './numberToWords.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function computeTotals(invoice) {
  const items = invoice.items || [];
  const lineItems = items.map((it, idx) => ({
    ...it,
    slNo: idx + 1,
    total: round2((Number(it.qty) || 0) * (Number(it.price) || 0)),
  }));
  const subTotal = round2(lineItems.reduce((s, it) => s + it.total, 0));
  const taxMode = invoice.taxMode === 'inter' ? 'inter' : 'intra';
  let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
  if (taxMode === 'inter') {
    igstAmount = round2((subTotal * (Number(invoice.igstRate) || 0)) / 100);
  } else {
    cgstAmount = round2((subTotal * (Number(invoice.cgstRate) || 0)) / 100);
    sgstAmount = round2((subTotal * (Number(invoice.sgstRate) || 0)) / 100);
  }
  const taxedTotal = subTotal + cgstAmount + sgstAmount + igstAmount;
  const grandTotal = Math.round(taxedTotal);
  const roundOff = round2(grandTotal - taxedTotal);
  return {
    items: lineItems, subTotal, cgstAmount, sgstAmount, igstAmount,
    roundOff, grandTotal, amountWords: amountInWords(grandTotal),
  };
}
export default computeTotals;
