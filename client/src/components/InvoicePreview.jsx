import { Fragment, useEffect, useRef, useState } from 'react';
import { getTheme } from '../themes.js';
import { computeTotals } from '../utils/calc.js';
import { paginateItems } from '../utils/paginate.js';
import { formatINR, formatRate } from '../utils/money.js';

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${dt.getFullYear()}`;
}

// Length-based font auto-fit so a long description shrinks gracefully.
function descFontSize(text = '') {
  const len = text.length;
  if (len > 160) return '8.5px';
  if (len > 110) return '9.5px';
  if (len > 70) return '10.5px';
  return '11.5px';
}

const A4_WIDTH = 794;

export default function InvoicePreview({ invoice, settings, fitToWidth = true, print = false }) {
  const theme = getTheme(invoice.theme || settings?.defaultTheme);
  const totals = computeTotals(invoice);
  const items = totals.items;
  const isInter = invoice.taxMode === 'inter';
  const sym = settings?.currencySymbol || '₹';
  const money = (n) => `${sym} ${formatINR(n)}`;
  const showHsn = items.some((it) => (it.hsnCode || '').toString().trim() !== '');

  const pages = paginateItems(items);
  const single = pages.length === 1;

  const wrapRef = useRef(null);
  const stackRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [boxHeight, setBoxHeight] = useState(undefined);

  useEffect(() => {
    if (!fitToWidth || print) return;
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const s = Math.min(1, el.clientWidth / A4_WIDTH);
      setScale(s);
      const h = stackRef.current?.offsetHeight || 0;
      if (h) setBoxHeight(h * s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    if (stackRef.current) ro.observe(stackRef.current);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [fitToWidth, print]);

  const cssVars = {
    '--accent': theme.accent, '--accent-soft': theme.accentSoft, '--secondary': theme.secondary,
    '--ink': theme.ink, '--muted': theme.muted, '--head-bg': theme.headBg, '--head-text': theme.headText,
    '--zebra': theme.zebra, '--total-bg': theme.totalBg, '--total-text': theme.totalText,
  };

  const logo = (
    <img className="inv-logo-img" src={settings?.logoDataUrl || '/logo-mark.svg'} alt="logo" />
  );

  const fullHeader = (
    <>
      <div className="inv-header">
        <div className="inv-brand">
          {logo}
          <div className="inv-company">
            <div className="inv-company-name">{settings?.companyName || 'Company Name'}</div>
            {settings?.tagline ? <div className="inv-tagline">{settings.tagline}</div> : null}
            <div className="inv-addr">{(settings?.addressLines || []).map((l, i) => <div key={i}>{l}</div>)}</div>
            <div className="inv-contact">
              {settings?.phones?.length ? <div>Mob: {settings.phones.join(', ')}</div> : null}
              {settings?.emails?.length ? <div>{settings.emails.join(', ')}</div> : null}
              {settings?.gstn ? <div className="inv-gstn">GSTIN: {settings.gstn}</div> : null}
            </div>
          </div>
        </div>
        <div className="inv-title-block">
          <div className="inv-title">{invoice.title || settings?.invoiceTitle || 'Invoice'}</div>
          <div className="inv-copy">{invoice.copyType || settings?.invoiceCopy}</div>
          <table className="inv-meta-table">
            <tbody>
              <tr><td>Invoice No</td><td className="strong">{invoice.invoiceNo || '—'}</td></tr>
              <tr><td>Date</td><td className="strong">{fmtDate(invoice.invoiceDate) || '—'}</td></tr>
              {settings?.division ? <tr><td>Division</td><td>{settings.division}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      <div className="inv-rule" />
      <div className="inv-strip">
        <div><span>Transport Mode:</span> <b>{invoice.transportMode || '-'}</b></div>
        <div><span>PO / Ref No:</span> <b>{invoice.poRefNo || '-'}</b></div>
        <div><span>Payment:</span> <b>{invoice.paymentTerms || settings?.paymentTerms}</b></div>
      </div>
      <div className="inv-billto">
        <div className="inv-billto-head">BILL TO</div>
        <div className="inv-billto-body">
          <div className="inv-buyer-name">{invoice.buyerName || 'Customer Name'}</div>
          {(invoice.buyerAddressLines || []).map((l, i) => l ? <div key={i}>{l}</div> : null)}
          {invoice.buyerContactPerson ? <div>Contact Person: {invoice.buyerContactPerson}</div> : null}
          {invoice.buyerContactPhone ? <div>Contact: {invoice.buyerContactPhone}</div> : null}
          {invoice.buyerGstn ? <div className="inv-gstn">GSTIN: {invoice.buyerGstn}</div> : null}
        </div>
      </div>
    </>
  );

  const slimHeader = (page) => (
    <div className="inv-slim-header">
      <div className="inv-slim-left">
        <img className="inv-slim-logo" src={settings?.logoDataUrl || '/logo-mark.svg'} alt="" />
        <span className="inv-company-name">{settings?.companyName}</span>
      </div>
      <div className="inv-slim-right">
        <span>Invoice {invoice.invoiceNo}</span>
        <span className="inv-page-no">Page {page.index + 1} of {pages.length}</span>
      </div>
    </div>
  );

  const itemsTable = (page) => {
    const rows = [...page.items];
    if (single) { while (rows.length < 6) rows.push({ _filler: true }); }
    return (
      <table className="inv-items">
        <thead>
          <tr>
            <th className="c-sl">SL</th>
            <th className="c-desc">DESCRIPTION</th>
            {showHsn && <th className="c-hsn">HSN</th>}
            <th className="c-qty">QTY</th>
            <th className="c-price">PRICE</th>
            <th className="c-gst">GST%</th>
            <th className="c-total">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((it, i) => (
            <tr key={i} className={it._filler ? 'filler' : ''}>
              <td className="c-sl">{it._filler ? '' : it.slNo}</td>
              <td className="c-desc" style={{ fontSize: it._filler ? undefined : descFontSize(it.description) }}>
                {it._filler ? '' : it.description}
                {!it._filler && it.gstInclusive ? <span className="incl-tag">incl. GST</span> : null}
              </td>
              {showHsn && <td className="c-hsn">{it._filler ? '' : it.hsnCode}</td>}
              <td className="c-qty">{it._filler ? '' : `${formatINR(it.qty, false)}${it.unit ? ' ' + it.unit : ''}`}</td>
              <td className="c-price">{it._filler ? '' : formatINR(it.price)}</td>
              <td className="c-gst">{it._filler ? '' : `${formatRate(it.gstRate)}%`}</td>
              <td className="c-total">{it._filler ? '' : formatINR(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const finalTotals = (
    <>
      <div className="inv-totals-wrap">
        <table className="inv-totals">
          <tbody>
            <tr><td>Sub Total</td><td>{money(totals.subTotal)}</td></tr>
            {totals.taxBreakup.map((g, i) => (
              isInter ? (
                <tr key={i}><td>IGST @ {formatRate(g.rate)}%</td><td>{money(g.igst)}</td></tr>
              ) : (
                <Fragment key={i}>
                  <tr><td>CGST @ {formatRate(g.half)}%</td><td>{money(g.cgst)}</td></tr>
                  <tr><td>SGST @ {formatRate(g.half)}%</td><td>{money(g.sgst)}</td></tr>
                </Fragment>
              )
            ))}
            {Math.abs(totals.roundOff) >= 0.005 ? <tr><td>Round Off</td><td>{money(totals.roundOff)}</td></tr> : null}
            <tr className="grand"><td>TOTAL</td><td>{money(totals.grandTotal)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="inv-words"><b>Amount in Words:</b> <i>{totals.amountWords}</i></div>
      <div className="inv-foot-rule" />
      <div className="inv-footer">
        <div className="inv-foot-left">
          {(settings?.bankName || settings?.bankAccount || settings?.bankIfsc) ? (
            <div className="inv-bank">
              <div className="inv-bank-head">Bank Details</div>
              {settings.bankName ? <div>Bank: {settings.bankName}</div> : null}
              {settings.bankAccount ? <div>A/C: {settings.bankAccount}</div> : null}
              {settings.bankIfsc ? <div>IFSC: {settings.bankIfsc} {settings.bankBranch ? `(${settings.bankBranch})` : ''}</div> : null}
            </div>
          ) : null}
          {settings?.termsNote ? <div className="inv-terms">Terms: {settings.termsNote}</div> : null}
          <div className="inv-eoe">{settings?.footerNote || 'E & O.E'}</div>
        </div>
        <div className="inv-foot-right">
          <div className="inv-for">For {settings?.companyName}</div>
          {settings?.signatureDataUrl ? <img className="inv-sign" src={settings.signatureDataUrl} alt="signature" /> : <div className="inv-sign-space" />}
          <div className="inv-sign-line" />
          <div className="inv-signatory">{settings?.signatory || 'Authorized Signatory'}</div>
        </div>
      </div>
    </>
  );

  const renderPage = (page) => (
    <div className={`invoice-page layout-${theme.layout}`} style={cssVars} key={page.index}>
      {page.isFirst ? fullHeader : slimHeader(page)}
      {itemsTable(page)}
      {page.isLast ? finalTotals : (
        <div className="inv-pagetotal">
          <span>Page Total{!page.isFirst ? ' (carried forward applies)' : ''}</span>
          <b>{money(page.pageTotal)}</b>
        </div>
      )}
      {!page.isLast ? <div className="inv-continued">Continued on page {page.index + 2} →</div> : null}
    </div>
  );

  if (print) {
    return <div className="invoice-print-root">{pages.map(renderPage)}</div>;
  }

  return (
    <div className="invoice-fit" ref={wrapRef} style={{ height: boxHeight }}>
      <div className="invoice-scale" style={{ transform: `scale(${scale})`, width: A4_WIDTH }}>
        <div className="invoice-pages" ref={stackRef}>
          {pages.map(renderPage)}
        </div>
      </div>
    </div>
  );
}
