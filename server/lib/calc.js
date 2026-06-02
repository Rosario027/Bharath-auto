// Single source of truth for invoice totals. Mirrored on the client
// (client/src/utils/calc.js) so the live preview matches what is stored.
import { amountInWords } from './numberToWords.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function computeTotals(invoice) {
  const items = invoice.items || [];

  const lineItems = items.map((it, idx) => {
    const qty = Number(it.qty) || 0;
    const price = Number(it.price) || 0;
    return {
      ...it,
      slNo: idx + 1,
      total: round2(qty * price),
    };
  });

  const subTotal = round2(lineItems.reduce((s, it) => s + it.total, 0));

  const taxMode = invoice.taxMode === 'inter' ? 'inter' : 'intra';
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (taxMode === 'inter') {
    igstAmount = round2((subTotal * (Number(invoice.igstRate) || 0)) / 100);
  } else {
    cgstAmount = round2((subTotal * (Number(invoice.cgstRate) || 0)) / 100);
    sgstAmount = round2((subTotal * (Number(invoice.sgstRate) || 0)) / 100);
  }

  const taxedTotal = subTotal + cgstAmount + sgstAmount + igstAmount;
  const grandTotal = Math.round(taxedTotal); // round to nearest rupee
  const roundOff = round2(grandTotal - taxedTotal);

  return {
    items: lineItems,
    subTotal,
    cgstAmount,
    sgstAmount,
    igstAmount,
    roundOff,
    grandTotal,
    amountWords: amountInWords(grandTotal),
  };
}

export default computeTotals;
