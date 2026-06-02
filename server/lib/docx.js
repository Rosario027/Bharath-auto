// Server-side Word (.docx) generation mirroring the PDF layout & theme.
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ImageRun, ShadingType, VerticalAlign,
} from 'docx';
import { getTheme } from './themes.js';
import { computeTotals } from './calc.js';
import { formatINR } from './money.js';

const hex = (c) => (c || '#000000').replace('#', '');
const RUPEE = 'Rs.';
const money = (n) => `${RUPEE} ${formatINR(n)}`;

function fmtDate(d) {
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${dt.getFullYear()}`;
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const thinBorder = (color = 'E0E0E0') => ({
  top: { style: BorderStyle.SINGLE, size: 2, color },
  bottom: { style: BorderStyle.SINGLE, size: 2, color },
  left: { style: BorderStyle.SINGLE, size: 2, color },
  right: { style: BorderStyle.SINGLE, size: 2, color },
});

function run(text, opts = {}) {
  return new TextRun({ text: String(text ?? ''), font: 'Calibri', ...opts });
}
function para(children, opts = {}) {
  return new Paragraph({ children: Array.isArray(children) ? children : [children], ...opts });
}

function cell(children, { shading, width, align, valign, borders } = {}) {
  return new TableCell({
    children: Array.isArray(children) ? children : [children],
    shading: shading ? { type: ShadingType.CLEAR, fill: hex(shading), color: 'auto' } : undefined,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: valign || VerticalAlign.CENTER,
    borders: borders || thinBorder(),
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });
}

function logoParas(settings, theme) {
  if (settings.logoDataUrl && settings.logoDataUrl.startsWith('data:image')) {
    try {
      const b64 = settings.logoDataUrl.split(',')[1];
      const buf = Buffer.from(b64, 'base64');
      const type = settings.logoDataUrl.includes('png') ? 'png' : 'jpg';
      return [para(new ImageRun({ data: buf, transformation: { width: 130, height: 60 }, type }))];
    } catch {
      /* fall through to text */
    }
  }
  return [
    para([run('BHARATH', { bold: true, size: 30, color: hex(theme.accent) })], { spacing: { after: 0 } }),
    para([run('AUTOMATION', { bold: true, size: 24, color: hex(theme.secondary) })]),
  ];
}

export async function generateInvoiceDocx(invoice, settings) {
  const theme = getTheme(invoice.theme || settings.defaultTheme);
  const totals = computeTotals(invoice);
  const items = totals.items;
  const isInter = invoice.taxMode === 'inter';

  // ── Header table: logo+company (left) | title+meta (right) ──
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...noBorders, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    rows: [
      new TableRow({
        children: [
          cell([
            ...logoParas(settings, theme),
            para([run(settings.companyName, { bold: true, size: 22, color: hex(theme.accent) })], { spacing: { before: 60 } }),
            ...(settings.addressLines || []).map((l) => para([run(l, { size: 15 })])),
            para([run(`Mob: ${(settings.phones || []).join(', ')}`, { size: 15 })]),
            para([run((settings.emails || []).join(', '), { size: 15 })]),
            para([run(`GSTIN: ${settings.gstn}`, { size: 15, bold: true })]),
          ], { width: 60, valign: VerticalAlign.TOP, borders: noBorders }),
          cell([
            para([run(invoice.title || settings.invoiceTitle, { bold: true, size: 30, color: hex(theme.ink) })], { alignment: AlignmentType.RIGHT }),
            para([run(invoice.copyType || settings.invoiceCopy, { size: 16, color: hex(theme.muted) })], { alignment: AlignmentType.RIGHT, spacing: { after: 120 } }),
            para([run('Invoice No: ', { size: 16, color: hex(theme.muted) }), run(invoice.invoiceNo, { size: 16, bold: true })], { alignment: AlignmentType.RIGHT }),
            para([run('Date: ', { size: 16, color: hex(theme.muted) }), run(fmtDate(invoice.invoiceDate), { size: 16, bold: true })], { alignment: AlignmentType.RIGHT }),
            settings.division ? para([run('Division: ', { size: 16, color: hex(theme.muted) }), run(settings.division, { size: 16 })], { alignment: AlignmentType.RIGHT }) : para(run('')),
          ], { width: 40, valign: VerticalAlign.TOP, borders: noBorders }),
        ],
      }),
    ],
  });

  // ── Meta strip ──
  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...noBorders, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    rows: [
      new TableRow({
        children: [
          cell(para([run('Transport: ', { size: 15, color: hex(theme.muted) }), run(invoice.transportMode || '-', { size: 15, bold: true })]), { shading: theme.accentSoft, width: 34, borders: noBorders }),
          cell(para([run('PO / Ref: ', { size: 15, color: hex(theme.muted) }), run(invoice.poRefNo || '-', { size: 15, bold: true })]), { shading: theme.accentSoft, width: 33, borders: noBorders }),
          cell(para([run('Payment: ', { size: 15, color: hex(theme.muted) }), run(invoice.paymentTerms || settings.paymentTerms, { size: 15, bold: true })]), { shading: theme.accentSoft, width: 33, borders: noBorders }),
        ],
      }),
    ],
  });

  // ── Bill To ──
  const billToTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [cell(para([run('BILL TO', { bold: true, size: 15, color: hex(theme.tableHeadText) })]), { shading: theme.tableHeadBg })],
      }),
      new TableRow({
        children: [cell([
          para([run(invoice.buyerName, { bold: true, size: 18 })]),
          ...(invoice.buyerAddressLines || []).map((l) => para([run(l, { size: 15 })])),
          invoice.buyerContactPerson ? para([run(`Contact Person: ${invoice.buyerContactPerson}`, { size: 15 })]) : para(run('')),
          invoice.buyerContactPhone ? para([run(`Contact: ${invoice.buyerContactPhone}`, { size: 15 })]) : para(run('')),
          invoice.buyerGstn ? para([run(`GSTIN: ${invoice.buyerGstn}`, { size: 15, bold: true })]) : para(run('')),
        ], { valign: VerticalAlign.TOP })],
      }),
    ],
  });

  // ── Items table ──
  const th = (t, align = AlignmentType.LEFT) =>
    cell(para([run(t, { bold: true, size: 15, color: hex(theme.tableHeadText) })], { alignment: align }), { shading: theme.tableHeadBg });

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      th('SL', AlignmentType.CENTER), th('DESCRIPTION'), th('HSN', AlignmentType.CENTER),
      th('QTY', AlignmentType.CENTER), th('PRICE', AlignmentType.RIGHT), th('TOTAL', AlignmentType.RIGHT),
    ],
  });

  const td = (t, align = AlignmentType.LEFT, shade) =>
    cell(para([run(t, { size: 15 })], { alignment: align }), { shading: shade });

  const itemRows = items.map((it, i) => {
    const shade = i % 2 === 1 ? theme.zebra : undefined;
    return new TableRow({
      children: [
        td(String(i + 1), AlignmentType.CENTER, shade),
        td(it.description || '', AlignmentType.LEFT, shade),
        td(it.hsnCode || '', AlignmentType.CENTER, shade),
        td(`${formatINR(it.qty, false)} ${it.unit || ''}`.trim(), AlignmentType.CENTER, shade),
        td(formatINR(it.price), AlignmentType.RIGHT, shade),
        td(formatINR(it.total), AlignmentType.RIGHT, shade),
      ],
    });
  });

  const itemsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [6, 50, 12, 10, 11, 11].map((p) => Math.round((p / 100) * 9000)),
    rows: [headerRow, ...itemRows],
  });

  // ── Totals ──
  const totalRow = (label, value, opts = {}) =>
    new TableRow({
      children: [
        cell(para([run(label, { size: 15, bold: !!opts.bold, color: hex(opts.textColor || theme.muted) })]), { shading: opts.shading, borders: opts.borders || thinBorder('F0F0F0') }),
        cell(para([run(value, { size: 15, bold: !!opts.bold, color: hex(opts.textColor || theme.ink) })], { alignment: AlignmentType.RIGHT }), { shading: opts.shading, borders: opts.borders || thinBorder('F0F0F0') }),
      ],
    });

  const totalsRows = [totalRow('Sub Total', money(totals.subTotal))];
  if (isInter) {
    totalsRows.push(totalRow(`IGST @ ${invoice.igstRate}%`, money(totals.igstAmount)));
  } else {
    totalsRows.push(totalRow(`CGST @ ${invoice.cgstRate}%`, money(totals.cgstAmount)));
    totalsRows.push(totalRow(`SGST @ ${invoice.sgstRate}%`, money(totals.sgstAmount)));
  }
  if (Math.abs(totals.roundOff) >= 0.005) totalsRows.push(totalRow('Round Off', money(totals.roundOff)));
  totalsRows.push(totalRow('TOTAL', money(totals.grandTotal), { bold: true, shading: theme.totalBg, textColor: theme.totalText }));

  const totalsTable = new Table({
    alignment: AlignmentType.RIGHT,
    width: { size: 45, type: WidthType.PERCENTAGE },
    rows: totalsRows,
  });

  // ── Footer ──
  const bankLines = [];
  if (settings.bankName) bankLines.push(para([run(`Bank: ${settings.bankName}`, { size: 14 })]));
  if (settings.bankAccount) bankLines.push(para([run(`A/C: ${settings.bankAccount}`, { size: 14 })]));
  if (settings.bankIfsc) bankLines.push(para([run(`IFSC: ${settings.bankIfsc} ${settings.bankBranch ? '(' + settings.bankBranch + ')' : ''}`, { size: 14 })]));

  const footerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...noBorders, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    rows: [
      new TableRow({
        children: [
          cell([
            bankLines.length ? para([run('Bank Details', { bold: true, size: 14, color: hex(theme.accent) })]) : para(run('')),
            ...bankLines,
            settings.termsNote ? para([run('Terms: ' + settings.termsNote, { size: 13, color: hex(theme.muted) })], { spacing: { before: 80 } }) : para(run('')),
            para([run(settings.footerNote || 'E & O.E', { size: 13, color: hex(theme.muted) })], { spacing: { before: 80 } }),
          ], { width: 60, valign: VerticalAlign.TOP, borders: noBorders }),
          cell([
            para([run(`For ${settings.companyName}`, { bold: true, size: 15 })], { alignment: AlignmentType.CENTER, spacing: { after: 480 } }),
            para([run('________________________', { size: 15, color: hex(theme.muted) })], { alignment: AlignmentType.CENTER }),
            para([run(settings.signatory || 'Authorized Signatory', { size: 14, color: hex(theme.muted) })], { alignment: AlignmentType.CENTER }),
          ], { width: 40, valign: VerticalAlign.TOP, borders: noBorders }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children: [
        headerTable,
        para(run(''), { spacing: { after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: hex(theme.accent) } } }),
        para(run(''), { spacing: { after: 60 } }),
        metaTable,
        para(run(''), { spacing: { after: 120 } }),
        billToTable,
        para(run(''), { spacing: { after: 120 } }),
        itemsTable,
        para(run(''), { spacing: { after: 120 } }),
        totalsTable,
        para(run(''), { spacing: { after: 80 } }),
        para([run('Amount in Words: ', { bold: true, size: 15 }), run(totals.amountWords, { italics: true, size: 15 })]),
        para(run(''), { spacing: { after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' } } }),
        para(run(''), { spacing: { after: 60 } }),
        footerTable,
      ],
    }],
  });

  return Packer.toBuffer(doc);
}

export default generateInvoiceDocx;
