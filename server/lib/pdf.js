// Server-side PDF generation using pdfmake's printer (no external font files —
// uses the standard Helvetica family that pdfkit provides built-in).
import PdfPrinter from 'pdfmake/src/printer.js';
import { getTheme } from './themes.js';
import { computeTotals } from './calc.js';
import { formatINR, formatRate } from './money.js';

const FONTS = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const printer = new PdfPrinter(FONTS);

const RUPEE = 'Rs.';

function fmt(n) {
  return `${RUPEE} ${formatINR(n)}`;
}

function fmtDate(d) {
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

// Built-in chip+house logo mark as an SVG string (used when no logo uploaded).
const LOGO_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
<rect x="22" y="22" width="76" height="76" rx="8" fill="none" stroke="#1b1b1b" stroke-width="6"/>
<g fill="#1b1b1b">
<rect x="36" y="10" width="6" height="12" rx="1"/><rect x="57" y="10" width="6" height="12" rx="1"/><rect x="78" y="10" width="6" height="12" rx="1"/>
<rect x="36" y="98" width="6" height="12" rx="1"/><rect x="57" y="98" width="6" height="12" rx="1"/><rect x="78" y="98" width="6" height="12" rx="1"/>
<rect x="10" y="36" width="12" height="6" rx="1"/><rect x="10" y="57" width="12" height="6" rx="1"/><rect x="10" y="78" width="12" height="6" rx="1"/>
<rect x="98" y="36" width="12" height="6" rx="1"/><rect x="98" y="57" width="12" height="6" rx="1"/><rect x="98" y="78" width="12" height="6" rx="1"/>
</g>
<g fill="none" stroke="#1b1b1b" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
<path d="M40 60 L60 43 L80 60"/><path d="M45 60 L45 80 L75 80 L75 60"/></g>
<rect x="55" y="68" width="10" height="12" fill="#1b1b1b"/></svg>`;

function logoNode(settings) {
  if (settings.logoDataUrl && settings.logoDataUrl.startsWith('data:image')) {
    return { image: settings.logoDataUrl, fit: [120, 60] };
  }
  return { svg: LOGO_MARK_SVG, width: 54, height: 54 };
}

export function buildDocDefinition(invoice, settings) {
  const theme = getTheme(invoice.theme || settings.defaultTheme);
  const totals = computeTotals(invoice);
  const items = totals.items;

  const isInter = invoice.taxMode === 'inter';

  // Header: logo + company block (left), invoice title (right)
  const companyBlock = {
    stack: [
      { text: settings.companyName, bold: true, fontSize: 16, color: theme.accent },
      settings.tagline ? { text: settings.tagline, fontSize: 8, color: theme.muted, margin: [0, 1, 0, 3] } : null,
      ...(settings.addressLines || []).map((l) => ({ text: l, fontSize: 8, color: theme.ink })),
      { text: `Mob: ${(settings.phones || []).join(', ')}`, fontSize: 8, color: theme.ink, margin: [0, 2, 0, 0] },
      { text: (settings.emails || []).join(', '), fontSize: 8, color: theme.ink },
      { text: `GSTIN: ${settings.gstn}`, fontSize: 8, bold: true, color: theme.ink, margin: [0, 2, 0, 0] },
    ].filter(Boolean),
  };

  const titleBlock = {
    stack: [
      { text: invoice.title || settings.invoiceTitle, bold: true, fontSize: 18, color: theme.ink, alignment: 'right' },
      { text: invoice.copyType || settings.invoiceCopy, fontSize: 9, color: theme.muted, alignment: 'right', margin: [0, 0, 0, 6] },
      {
        table: {
          widths: ['auto', 'auto'],
          body: [
            [{ text: invoice.docType === 'purchase-order' ? 'PO No' : invoice.docType === 'credit-note' ? 'Credit Note No' : invoice.docType === 'debit-note' ? 'Debit Note No' : 'Invoice No', fontSize: 8, color: theme.muted, alignment: 'right' }, { text: invoice.invoiceNo, fontSize: 9, bold: true, alignment: 'right' }],
            [{ text: 'Date', fontSize: 8, color: theme.muted, alignment: 'right' }, { text: fmtDate(invoice.invoiceDate), fontSize: 9, bold: true, alignment: 'right' }],
            ...(settings.division ? [[{ text: 'Division', fontSize: 8, color: theme.muted, alignment: 'right' }, { text: settings.division, fontSize: 9, alignment: 'right' }]] : []),
          ],
        },
        layout: 'noBorders',
        alignment: 'right',
      },
    ],
  };

  // Meta strip
  const metaStrip = {
    table: {
      widths: ['*', '*', '*'],
      body: [
        [
          { text: [{ text: 'Transport Mode: ', color: theme.muted, fontSize: 8 }, { text: invoice.transportMode || '-', fontSize: 8, bold: true }] },
          { text: [{ text: 'PO / Ref No: ', color: theme.muted, fontSize: 8 }, { text: invoice.poRefNo || '-', fontSize: 8, bold: true }] },
          { text: [{ text: 'Payment: ', color: theme.muted, fontSize: 8 }, { text: invoice.paymentTerms || settings.paymentTerms, fontSize: 8, bold: true }] },
        ],
      ],
    },
    layout: {
      fillColor: () => theme.accentSoft,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
    margin: [0, 10, 0, 10],
  };

  // Bill To
  const billTo = {
    table: {
      widths: ['*'],
      body: [
        [{ text: 'BILL TO', fontSize: 8, bold: true, color: theme.tableHeadText, characterSpacing: 1 }],
        [
          {
            stack: [
              { text: invoice.buyerName, bold: true, fontSize: 10, margin: [0, 0, 0, 2] },
              ...(invoice.buyerAddressLines || []).filter(Boolean).map((l) => ({ text: l, fontSize: 8, color: theme.ink })),
              invoice.buyerContactPerson ? { text: `Contact Person: ${invoice.buyerContactPerson}`, fontSize: 8, margin: [0, 2, 0, 0] } : null,
              invoice.buyerContactPhone ? { text: `Contact: ${invoice.buyerContactPhone}`, fontSize: 8 } : null,
              invoice.buyerGstn ? { text: `GSTIN: ${invoice.buyerGstn}`, fontSize: 8, bold: true } : null,
            ].filter(Boolean),
          },
        ],
      ],
    },
    layout: {
      fillColor: (rowIndex) => (rowIndex === 0 ? theme.tableHeadBg : null),
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#dddddd',
      vLineColor: () => '#dddddd',
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: [0, 0, 0, 10],
  };

  // Items table — HSN column only when at least one line has an HSN value.
  const showHsn = items.some((it) => (it.hsnCode || '').toString().trim() !== '');

  const headRow = [
    { text: 'SL', style: 'th', alignment: 'center' },
    { text: 'DESCRIPTION', style: 'th' },
    ...(showHsn ? [{ text: 'HSN', style: 'th', alignment: 'center' }] : []),
    { text: 'QTY', style: 'th', alignment: 'center' },
    { text: 'PRICE', style: 'th', alignment: 'right' },
    { text: 'GST%', style: 'th', alignment: 'center' },
    { text: 'TOTAL', style: 'th', alignment: 'right' },
  ];

  const itemRows = items.map((it, i) => [
    { text: String(i + 1), alignment: 'center', fontSize: 9, margin: [0, 2, 0, 2] },
    { text: it.description || '', fontSize: 9, margin: [0, 2, 0, 2] },
    ...(showHsn ? [{ text: it.hsnCode || '', alignment: 'center', fontSize: 9, margin: [0, 2, 0, 2] }] : []),
    { text: `${formatINR(it.qty, false)} ${it.unit || ''}`.trim(), alignment: 'center', fontSize: 9, margin: [0, 2, 0, 2] },
    { text: formatINR(it.price), alignment: 'right', fontSize: 9, margin: [0, 2, 0, 2] },
    { text: `${formatRate(it.gstRate)}%`, alignment: 'center', fontSize: 9, margin: [0, 2, 0, 2] },
    { text: formatINR(it.total), alignment: 'right', fontSize: 9, margin: [0, 2, 0, 2] },
  ]);

  // pad to a minimum number of rows for a balanced look
  const minRows = 5;
  const blankRow = () => [{ text: ' ', fontSize: 9, margin: [0, 2, 0, 2] }, {}, ...(showHsn ? [{}] : []), {}, {}, {}, {}];
  while (itemRows.length < minRows) itemRows.push(blankRow());

  const itemsTable = {
    table: {
      headerRows: 1,
      dontBreakRows: true, // keep a line item intact across page breaks
      widths: showHsn ? [20, '*', 46, 42, 60, 38, 64] : [20, '*', 46, 60, 38, 64],
      body: [headRow, ...itemRows],
    },
    layout: {
      fillColor: (rowIndex) => {
        if (rowIndex === 0) return theme.tableHeadBg;
        return rowIndex % 2 === 0 ? theme.zebra : null;
      },
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#e0e0e0',
      vLineColor: () => '#e0e0e0',
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
  };

  // Totals (right column) — rate-wise GST breakup
  const totalsBody = [
    [{ text: 'Sub Total', style: 'tlabel' }, { text: fmt(totals.subTotal), style: 'tval' }],
  ];
  for (const g of totals.taxBreakup) {
    if (isInter) {
      totalsBody.push([{ text: `IGST @ ${formatRate(g.rate)}%`, style: 'tlabel' }, { text: fmt(g.igst), style: 'tval' }]);
    } else {
      totalsBody.push([{ text: `CGST @ ${formatRate(g.half)}%`, style: 'tlabel' }, { text: fmt(g.cgst), style: 'tval' }]);
      totalsBody.push([{ text: `SGST @ ${formatRate(g.half)}%`, style: 'tlabel' }, { text: fmt(g.sgst), style: 'tval' }]);
    }
  }
  if (Math.abs(totals.roundOff) >= 0.005) {
    totalsBody.push([{ text: 'Round Off', style: 'tlabel' }, { text: fmt(totals.roundOff), style: 'tval' }]);
  }
  totalsBody.push([
    { text: 'TOTAL', bold: true, color: theme.totalText, fillColor: theme.totalBg, margin: [6, 4, 6, 4] },
    { text: fmt(totals.grandTotal), bold: true, alignment: 'right', color: theme.totalText, fillColor: theme.totalBg, margin: [6, 4, 6, 4] },
  ]);

  const totalsTable = {
    columns: [
      { width: '*', text: '' },
      {
        width: 240,
        table: { widths: ['*', 'auto'], body: totalsBody },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
          hLineColor: () => '#e0e0e0',
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
      },
    ],
    margin: [0, 0, 0, 8],
  };

  const amountWords = {
    text: [{ text: 'Amount in Words: ', bold: true, fontSize: 9 }, { text: totals.amountWords, fontSize: 9, italics: true }],
    margin: [0, 0, 0, 10],
  };

  // Footer: bank + terms (left), signatory (right)
  const bankLines = [];
  if (settings.bankName) bankLines.push({ text: `Bank: ${settings.bankName}`, fontSize: 8 });
  if (settings.bankAccount) bankLines.push({ text: `A/C: ${settings.bankAccount}`, fontSize: 8 });
  if (settings.bankIfsc) bankLines.push({ text: `IFSC: ${settings.bankIfsc}  ${settings.bankBranch ? '(' + settings.bankBranch + ')' : ''}`, fontSize: 8 });

  const footer = {
    columns: [
      {
        width: '*',
        stack: [
          bankLines.length ? { text: 'Bank Details', bold: true, fontSize: 8, color: theme.accent, margin: [0, 0, 0, 2] } : null,
          ...bankLines,
          settings.termsNote ? { text: 'Terms: ' + settings.termsNote, fontSize: 7.5, color: theme.muted, margin: [0, 6, 0, 0] } : null,
          { text: settings.footerNote || 'E & O.E', fontSize: 7.5, color: theme.muted, margin: [0, 6, 0, 0] },
        ].filter(Boolean),
      },
      {
        width: 180,
        stack: [
          { text: `For ${settings.companyName}`, fontSize: 9, bold: true, alignment: 'center', margin: [0, 0, 0, 30] },
          settings.signatureDataUrl && settings.signatureDataUrl.startsWith('data:image')
            ? { image: settings.signatureDataUrl, fit: [120, 40], alignment: 'center' }
            : null,
          { canvas: [{ type: 'line', x1: 30, y1: 0, x2: 150, y2: 0, lineWidth: 0.5, lineColor: theme.muted }], margin: [0, 0, 0, 2] },
          { text: settings.signatory || 'Authorized Signatory', fontSize: 8, alignment: 'center', color: theme.muted },
        ].filter(Boolean),
      },
    ],
  };

  return {
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 44],
    footer: (currentPage, pageCount) => (pageCount > 1 ? {
      columns: [
        { text: settings.companyName, fontSize: 7, color: theme.muted, margin: [36, 0, 0, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, fontSize: 7, color: theme.muted, alignment: 'right', margin: [0, 0, 36, 0] },
      ],
    } : null),
    defaultStyle: { font: 'Helvetica', fontSize: 9, color: theme.ink, lineHeight: 1.15 },
    styles: {
      th: { bold: true, fontSize: 8.5, color: theme.tableHeadText, margin: [0, 2, 0, 2] },
      tlabel: { fontSize: 9, color: theme.muted },
      tval: { fontSize: 9, alignment: 'right' },
    },
    content: [
      {
        columns: [
          { width: 'auto', stack: [logoNode(settings)], margin: [0, 0, 12, 0] },
          companyBlock,
          titleBlock,
        ],
        columnGap: 10,
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 2, lineColor: theme.accent }], margin: [0, 8, 0, 0] },
      metaStrip,
      billTo,
      itemsTable,
      { text: '', margin: [0, 0, 0, 8] },
      totalsTable,
      amountWords,
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 0.5, lineColor: '#dddddd' }], margin: [0, 0, 0, 8] },
      footer,
    ],
  };
}

export function generateInvoicePdf(invoice, settings) {
  const docDef = buildDocDefinition(invoice, settings);
  const pdfDoc = printer.createPdfKitDocument(docDef);
  return new Promise((resolve, reject) => {
    const chunks = [];
    pdfDoc.on('data', (c) => chunks.push(c));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

// Build a 3-copy PDF with page breaks between copies.
// Each copy uses a different header label per statutory requirements.
const COPY_LABELS = [
  'Original for Buyer',
  "Transporter's Copy",
  'Office Copy',
];

export function buildTripleCopyDocDefinition(invoice, settings) {
  const theme = getTheme(invoice.theme || settings.defaultTheme);

  const pages = COPY_LABELS.map((copyLabel, idx) => {
    const overriddenInvoice = { ...invoice, copyType: copyLabel };
    const singleDef = buildDocDefinition(overriddenInvoice, settings);
    // Add watermark-style copy label as top ribbon
    const copyBanner = {
      canvas: [
        { type: 'rect', x: 0, y: 0, w: 523, h: 16, color: theme.accent },
      ],
    };
    const copyText = {
      text: copyLabel.toUpperCase(),
      fontSize: 8,
      bold: true,
      color: '#ffffff',
      characterSpacing: 1.5,
      margin: [0, -16, 0, 8],
      alignment: 'center',
    };

    const contents = singleDef.content.map((block) => block);
    const pageContent = [copyBanner, copyText, ...contents];
    // Add page break after each copy except the last
    if (idx < COPY_LABELS.length - 1) {
      pageContent.push({ text: '', pageBreak: 'after' });
    }
    return pageContent;
  });

  const baseDef = buildDocDefinition({ ...invoice, copyType: COPY_LABELS[0] }, settings);
  return {
    ...baseDef,
    content: pages.flat(),
  };
}

export function generateTripleCopyPdf(invoice, settings) {
  const docDef = buildTripleCopyDocDefinition(invoice, settings);
  const pdfDoc = printer.createPdfKitDocument(docDef);
  return new Promise((resolve, reject) => {
    const chunks = [];
    pdfDoc.on('data', (c) => chunks.push(c));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

export default generateInvoicePdf;
