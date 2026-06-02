import { useEffect, useMemo, useState, useCallback } from 'react';
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
    items: [{ description: '', hsnCode: '', qty: 1, unit: 'Nos', price: 0 }],
  };
}

function toForm(inv) {
  return {
    ...inv,
    invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : todayISO(),
    buyerAddressLines: inv.buyerAddressLines || [],
    items: inv.items?.length ? inv.items.map(({ id, invoiceId, slNo, total, ...rest }) => rest) : [{ description: '', hsnCode: '', qty: 1, unit: 'Nos', price: 0 }],
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
  const [emailReady, setEmailReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);

  const flash = (msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3500);
  };

  // Load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cust, share] = await Promise.all([api.listCustomers(), api.shareStatus()]);
        if (!alive) return;
        setCustomers(cust);
        setEmailReady(share.emailConfigured);
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
  const addItem = () => set({ items: [...inv.items, { description: '', hsnCode: '', qty: 1, unit: 'Nos', price: 0 }] });
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
    let theId = savedId;
    if (!theId) { const r = await persist(); if (!r) return; theId = r.id; }
    const to = prompt('Send invoice to email:', inv.buyerEmail || '');
    if (!to) return;
    if (emailReady) {
      setBusy('email');
      try {
        await api.emailInvoice(theId, { to, includeWord: false });
        flash(`Emailed to ${to}`);
      } catch (e) { flash(e.message, 'err'); }
      finally { setBusy(''); }
    } else {
      // Fallback: mailto with summary (no attachment possible), and download PDF.
      const t = computeTotals(inv);
      const subject = `Invoice ${inv.invoiceNo} from ${settings.companyName}`;
      const body = `Dear ${inv.buyerName},\n\nPlease find attached invoice ${inv.invoiceNo} for ${sym} ${formatINR(t.grandTotal)}.\n\nRegards,\n${settings.companyName}`;
      try { await exporter.pdf(inv); } catch { /* ignore */ }
      window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      flash('PDF downloaded — attach it to the email');
    }
  };

  const addressText = (inv.buyerAddressLines || []).join('\n');

  return (
    <div className="editor">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}

      {/* ── Left: form ── */}
      <div className="editor-form">
        <div className="form-head">
          <button className="btn ghost" onClick={() => nav('/')}>&larr; Back</button>
          <h2>{isEdit ? `Edit ${inv.invoiceNo}` : 'New Invoice'}</h2>
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
            <div className="ie-head">
              <span>Description</span><span>HSN</span><span>Qty</span><span>Unit</span><span>Price</span><span>Total</span><span></span>
            </div>
            {inv.items.map((it, i) => (
              <div className="ie-row" key={i}>
                <textarea className="ie-desc" rows={1} value={it.description} placeholder="Item description" onChange={(e) => setItem(i, { description: e.target.value })} />
                <input value={it.hsnCode} onChange={(e) => setItem(i, { hsnCode: e.target.value })} />
                <input type="number" step="any" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} />
                <input value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} />
                <input type="number" step="any" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} />
                <div className="ie-total">{formatINR((Number(it.qty) || 0) * (Number(it.price) || 0))}</div>
                <button className="btn xs danger" onClick={() => removeItem(i)} disabled={inv.items.length === 1}>✕</button>
              </div>
            ))}
          </div>
        </section>

        <section className="fsec">
          <h3>Tax</h3>
          <div className="tax-toggle">
            <button className={`seg ${inv.taxMode === 'intra' ? 'on' : ''}`} onClick={() => set({ taxMode: 'intra' })}>Intra-state (CGST + SGST)</button>
            <button className={`seg ${inv.taxMode === 'inter' ? 'on' : ''}`} onClick={() => set({ taxMode: 'inter' })}>Inter-state (IGST)</button>
          </div>
          <div className="grid2">
            {inv.taxMode === 'intra' ? (
              <>
                <label>CGST %<input type="number" step="any" value={inv.cgstRate} onChange={(e) => set({ cgstRate: e.target.value })} /></label>
                <label>SGST %<input type="number" step="any" value={inv.sgstRate} onChange={(e) => set({ sgstRate: e.target.value })} /></label>
              </>
            ) : (
              <label>IGST %<input type="number" step="any" value={inv.igstRate} onChange={(e) => set({ igstRate: e.target.value })} /></label>
            )}
          </div>
          <div className="totals-mini">
            <div><span>Sub Total</span><b>{sym} {formatINR(totals.subTotal)}</b></div>
            <div><span>Tax</span><b>{sym} {formatINR(totals.cgstAmount + totals.sgstAmount + totals.igstAmount)}</b></div>
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
        <div className="preview-bar">
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
            <button className="btn" onClick={shareEmail} disabled={busy === 'email'}>{busy === 'email' ? '…' : 'Email'}</button>
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
