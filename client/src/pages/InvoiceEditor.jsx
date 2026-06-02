import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, exporter } from '../api.js';
import { useSettings } from '../App.jsx';
import InvoicePreview from '../components/InvoicePreview.jsx';
import { THEME_LIST } from '../themes.js';
import { computeTotals } from '../utils/calc.js';
import { formatINR } from '../utils/money.js';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function defaultInvoice(settings) {
  return {
    invoiceNo: '',
    invoiceDate: todayISO(),
    title: settings.invoiceTitle,
    copyType: settings.invoiceCopy,
    transportMode: 'By Road',
    poRefNo: '',
    paymentTerms: settings.paymentTerms,
    buyerName: '',
    buyerAddressLines: [],
    buyerContactPerson: '',
    buyerContactPhone: '',
    buyerEmail: '',
    buyerGstn: '',
    buyerStateCode: '',
    taxMode: 'intra',
    cgstRate: settings.defaultCgst,
    sgstRate: settings.defaultSgst,
    igstRate: settings.defaultIgst,
    theme: settings.defaultTheme,
    notes: '',
    status: 'draft',
    items: [newItem(settings)],
  };
}

function newItem(settings) {
  return { description: '', hsnCode: '', qty: 1, unit: 'Nos', price: 0, gstRate: settings?.defaultGstRate ?? 18 };
}

function toForm(inv) {
  return {
    ...inv,
    invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : todayISO(),
    buyerAddressLines: inv.buyerAddressLines || [],
    items: inv.items?.length
      ? inv.items.map(({ id, invoiceId, slNo, total, ...rest }) => ({ gstRate: 18, ...rest }))
      : [{ description: '', hsnCode: '', qty: 1, unit: 'Nos', price: 0, gstRate: 18 }],
  };
}

export default function InvoiceEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { settings } = useSettings();
  const isEdit = !!id;

  const [inv, setInv] = useState(null);
  const [savedId, setSavedId] = useState(id ? Number(id) : null);
  const [customers, setCustomers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);

  // Resizable / collapsible preview pane
  const [previewW, setPreviewW] = useState(560);
  const [collapsed, setCollapsed] = useState(false);

  const startResize = (e) => {
    e.preventDefault();
    const onMove = (ev) => {
      const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
      setPreviewW(Math.min(960, Math.max(340, window.innerWidth - x)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
  };

  const flash = (msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3500);
  };

  // Load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cust = await api.listCustomers();
        if (!alive) return;
        setCustomers(cust);
      } catch { /* ignore */ }

      if (isEdit) {
        const data = await api.getInvoice(id);
        if (alive) setInv(toForm(data));
      } else {
        const base = defaultInvoice(settings);
        try {
          const { invoiceNo } = await api.nextNumber();
          base.invoiceNo = invoiceNo;
        } catch { /* ignore */ }
        if (alive) setInv(base);
      }
    })();
    return () => { alive = false; };
  }, [id, isEdit]); // eslint-disable-line

  const set = useCallback((patch) => setInv((p) => ({ ...p, ...patch })), []);

  const totals = useMemo(() => (inv ? computeTotals(inv) : null), [inv]);
  const sym = settings?.currencySymbol || '₹';

  if (!inv) return <div className="page"><div className="empty">Loading invoice…</div></div>;

  // ── Items ──
  const setItem = (i, patch) => {
    const items = inv.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    set({ items });
  };
  const addItem = () => set({ items: [...inv.items, newItem(settings)] });
  const removeItem = (i) => set({ items: inv.items.filter((_, idx) => idx !== i) });

  // ── Customer ──
  const applyCustomer = (cid) => {
    const c = customers.find((x) => x.id === Number(cid));
    if (!c) return;
    set({
      customerId: c.id,
      buyerName: c.name,
      buyerAddressLines: c.addressLines || [],
      buyerContactPerson: c.contactPerson,
      buyerContactPhone: c.contactPhone,
      buyerEmail: c.email,
      buyerGstn: c.gstn,
      buyerStateCode: c.stateCode,
    });
  };
  const saveCustomer = async () => {
    if (!inv.buyerName.trim()) return flash('Enter a customer name first', 'err');
    try {
      const c = await api.createCustomer({
        name: inv.buyerName, addressLines: inv.buyerAddressLines, contactPerson: inv.buyerContactPerson,
        contactPhone: inv.buyerContactPhone, email: inv.buyerEmail, gstn: inv.buyerGstn, stateCode: inv.buyerStateCode,
      });
      setCustomers((p) => [...p, c]);
      flash('Customer saved for reuse');
    } catch (e) { flash(e.message, 'err'); }
  };

  // ── Persist ──
  const persist = async () => {
    if (!inv.buyerName.trim()) { flash('Customer name is required', 'err'); return null; }
    setSaving(true);
    try {
      const payload = { ...inv };
      let result;
      if (savedId) result = await api.updateInvoice(savedId, payload);
      else result = await api.createInvoice(payload);
      setSavedId(result.id);
      setInv(toForm(result));
      if (!isEdit) window.history.replaceState(null, '', `/invoice/${result.id}`);
      flash('Invoice saved');
      return result;
    } catch (e) {
      flash(e.message, 'err');
      return null;
    } finally {
      setSaving(false);
    }
  };

  // ── Exports ──
  const doExport = async (kind) => {
    setBusy(kind);
    try {
      await (kind === 'pdf' ? exporter.pdf(inv) : exporter.docx(inv));
    } catch (e) { flash(e.message, 'err'); }
    finally { setBusy(''); }
  };

  const doPrint = () => {
    window.print();
  };

  const shareWhatsApp = async () => {
    // Ensure saved so totals/number are final, then download PDF for manual attach.
    let target = inv;
    if (!savedId) { const r = await persist(); if (!r) return; target = toForm(r); }
    const t = computeTotals(target);
    const lines = [
      `*${settings.companyName}*`,
      `Invoice: ${target.invoiceNo}`,
      `Date: ${new Date(target.invoiceDate).toLocaleDateString('en-IN')}`,
      `Amount: ${sym} ${formatINR(t.grandTotal)}`,
      `(${t.amountWords})`,
      '',
      'Please find the invoice PDF attached.',
    ];
    const phone = (target.buyerContactPhone || '').replace(/[^\d]/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
    try { await exporter.pdf(target); } catch { /* ignore */ }
    window.open(url, '_blank');
    flash('PDF downloaded — attach it in WhatsApp');
  };

  const shareEmail = async () => {
    // Mirror the WhatsApp flow: finalise, download the PDF (the "payload"),
    // then hand off to the user's default mail app via a mailto: link.
    let target = inv;
    if (!savedId) { const r = await persist(); if (!r) return; target = toForm(r); }
    const t = computeTotals(target);
    const subject = `Invoice ${target.invoiceNo} from ${settings.companyName}`;
    const body = [
      `Dear ${target.buyerName || 'Customer'},`,
      '',
      `Please find attached invoice ${target.invoiceNo} for ${sym} ${formatINR(t.grandTotal)}.`,
      `(${t.amountWords})`,
      '',
      'Thank you for your business.',
      '',
      'Regards,',
      settings.companyName,
      (settings.phones || []).join(', '),
    ].join('\n');

    try { await exporter.pdf(target); } catch { /* ignore */ }

    const to = encodeURIComponent(target.buyerEmail || '');
    const href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const a = document.createElement('a');
    a.href = href;
    document.body.appendChild(a);
    a.click();
    a.remove();
    flash('PDF downloaded — attach it in your mail app');
  };

  const addressText = (inv.buyerAddressLines || []).join('\n');

  return (
    <div
      className={`editor${collapsed ? ' preview-collapsed' : ''}`}
      style={{ gridTemplateColumns: collapsed ? '1fr 0px' : `minmax(360px, 1fr) ${previewW}px` }}
    >
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}

      {collapsed && (
        <button className="expand-fab" onClick={() => setCollapsed(false)} title="Show invoice preview">
          ◀ Expand preview
        </button>
      )}

      {/* ── Left: form ── */}
      <div className="editor-form">
        <div className="form-head">
          <button className="btn ghost" onClick={() => nav('/')}>&larr; Back</button>
          <h2>{isEdit ? `Edit ${inv.invoiceNo}` : 'New Invoice'}</h2>
        </div>

        {/* Sale type — drives CGST+SGST vs IGST across the whole invoice */}
        <div className="saletype-bar">
          <span className="saletype-label">Sale type</span>
          <div className="tax-toggle">
            <button className={`seg ${inv.taxMode === 'intra' ? 'on' : ''}`} onClick={() => set({ taxMode: 'intra' })}>Intra-state · CGST + SGST</button>
            <button className={`seg ${inv.taxMode === 'inter' ? 'on' : ''}`} onClick={() => set({ taxMode: 'inter' })}>Inter-state · IGST</button>
          </div>
        </div>

        <section className="fsec">
          <h3>Invoice Details</h3>
          <div className="grid2">
            <label>Invoice No<input value={inv.invoiceNo} onChange={(e) => set({ invoiceNo: e.target.value })} /></label>
            <label>Date<input type="date" value={inv.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} /></label>
            <label>Title<input value={inv.title} onChange={(e) => set({ title: e.target.value })} /></label>
            <label>Copy Type<input value={inv.copyType} onChange={(e) => set({ copyType: e.target.value })} /></label>
            <label>Transport Mode<input value={inv.transportMode} onChange={(e) => set({ transportMode: e.target.value })} /></label>
            <label>PO / Ref No<input value={inv.poRefNo} onChange={(e) => set({ poRefNo: e.target.value })} /></label>
            <label>Payment Terms<input value={inv.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} /></label>
          </div>
        </section>

        <section className="fsec">
          <div className="fsec-head">
            <h3>Customer</h3>
            <div className="fsec-tools">
              {customers.length > 0 && (
                <select defaultValue="" onChange={(e) => applyCustomer(e.target.value)}>
                  <option value="" disabled>Load saved…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <button className="btn xs" onClick={saveCustomer}>Save customer</button>
            </div>
          </div>
          <div className="grid2">
            <label className="full">Customer Name *<input value={inv.buyerName} onChange={(e) => set({ buyerName: e.target.value })} /></label>
            <label className="full">Address<textarea rows={3} value={addressText} placeholder="One line per row" onChange={(e) => set({ buyerAddressLines: e.target.value.split('\n') })} /></label>
            <label>Contact Person<input value={inv.buyerContactPerson} onChange={(e) => set({ buyerContactPerson: e.target.value })} /></label>
            <label>Contact Phone<input value={inv.buyerContactPhone} onChange={(e) => set({ buyerContactPhone: e.target.value })} /></label>
            <label>Email<input value={inv.buyerEmail} onChange={(e) => set({ buyerEmail: e.target.value })} /></label>
            <label>GSTIN<input value={inv.buyerGstn} onChange={(e) => set({ buyerGstn: e.target.value })} /></label>
          </div>
        </section>

        <section className="fsec">
          <div className="fsec-head">
            <h3>Items</h3>
            <button className="btn xs" onClick={addItem}>+ Add item</button>
          </div>
          <div className="items-editor">
            {inv.items.map((it, i) => (
              <div className="item-card" key={i}>
                <div className="item-card-top">
                  <span className="item-no">{i + 1}</span>
                  <textarea
                    className="ie-desc"
                    rows={2}
                    value={it.description}
                    placeholder="Item description (wraps & auto-fits on the invoice)"
                    onChange={(e) => setItem(i, { description: e.target.value })}
                  />
                  <button className="btn xs danger item-del" onClick={() => removeItem(i)} disabled={inv.items.length === 1} title="Remove item">✕</button>
                </div>
                <div className="item-card-fields">
                  <label>HSN<input value={it.hsnCode} onChange={(e) => setItem(i, { hsnCode: e.target.value })} /></label>
                  <label>Qty<input type="number" step="any" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} /></label>
                  <label>Unit<input value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} /></label>
                  <label>Price<input type="number" step="any" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} /></label>
                  <label>GST %
                    <select value={Number(it.gstRate) || 0} onChange={(e) => setItem(i, { gstRate: Number(e.target.value) })}>
                      {[...new Set([0, 5, 12, 18, 28, Number(it.gstRate) || 0])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </label>
                  <div className="item-line-total">
                    <span>Line total</span>
                    <b>{sym} {formatINR((Number(it.qty) || 0) * (Number(it.price) || 0))}</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="fsec">
          <h3>Tax Summary <span className="tag">{inv.taxMode === 'inter' ? 'Inter-state · IGST' : 'Intra-state · CGST+SGST'}</span></h3>
          <div className="totals-mini">
            <div><span>Sub Total</span><b>{sym} {formatINR(totals.subTotal)}</b></div>
            {totals.taxBreakup.map((g, i) => (
              inv.taxMode === 'inter' ? (
                <div key={i}><span>IGST @ {g.rate}% (on {sym} {formatINR(g.taxable)})</span><b>{sym} {formatINR(g.igst)}</b></div>
              ) : (
                <div key={i}><span>CGST+SGST @ {g.rate}% (on {sym} {formatINR(g.taxable)})</span><b>{sym} {formatINR(g.cgst + g.sgst)}</b></div>
              )
            ))}
            {Math.abs(totals.roundOff) >= 0.005 ? <div><span>Round Off</span><b>{sym} {formatINR(totals.roundOff)}</b></div> : null}
            <div className="grand"><span>Grand Total</span><b>{sym} {formatINR(totals.grandTotal)}</b></div>
          </div>
        </section>

        <section className="fsec">
          <h3>Notes (internal)</h3>
          <textarea rows={2} value={inv.notes} onChange={(e) => set({ notes: e.target.value })} />
        </section>
      </div>

      {/* ── Right: preview + actions ── */}
      <div className="editor-preview">
        <div className="resizer" onMouseDown={startResize} onTouchStart={startResize} title="Drag to resize" />
        <div className="preview-bar">
          <button className="btn xs ghost collapse-btn" onClick={() => setCollapsed(true)} title="Hide preview">▶ Collapse</button>
          <div className="theme-picker">
            {THEME_LIST.map((t) => (
              <button
                key={t.key}
                className={`swatch ${inv.theme === t.key ? 'on' : ''}`}
                title={t.name}
                style={{ background: t.accent }}
                onClick={() => set({ theme: t.key })}
              />
            ))}
            <span className="theme-name">{THEME_LIST.find((t) => t.key === inv.theme)?.name}</span>
          </div>
          <div className="actions">
            <button className="btn primary" onClick={persist} disabled={saving}>{saving ? 'Saving…' : (savedId ? 'Update' : 'Save')}</button>
            <button className="btn" onClick={doPrint}>Print</button>
            <button className="btn" onClick={() => doExport('pdf')} disabled={busy === 'pdf'}>{busy === 'pdf' ? '…' : 'PDF'}</button>
            <button className="btn" onClick={() => doExport('docx')} disabled={busy === 'docx'}>{busy === 'docx' ? '…' : 'Word'}</button>
            <button className="btn wa" onClick={shareWhatsApp}>WhatsApp</button>
            <button className="btn" onClick={shareEmail}>Email</button>
          </div>
        </div>

        <div className="preview-scroll">
          <InvoicePreview invoice={inv} settings={settings} />
        </div>
      </div>

      {/* Hidden print surface */}
      <div className="print-only">
        <InvoicePreview invoice={inv} settings={settings} print />
      </div>
    </div>
  );
}
