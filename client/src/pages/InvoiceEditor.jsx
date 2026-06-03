import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
  return { description: '', hsnCode: '', qty: 1, unit: 'Nos', price: 0, gstRate: settings?.defaultGstRate ?? 18, gstInclusive: false };
}

function fmtDateTime(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const date = `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
  const time = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function lineTaxable(it) {
  const gross = (Number(it.qty) || 0) * (Number(it.price) || 0);
  const r = Number(it.gstRate) || 0;
  return it.gstInclusive ? gross / (1 + r / 100) : gross;
}

function toForm(inv) {
  return {
    ...inv,
    invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : todayISO(),
    buyerAddressLines: inv.buyerAddressLines || [],
    items: inv.items?.length
      ? inv.items.map(({ id, invoiceId, slNo, total, ...rest }) => ({ gstRate: 18, gstInclusive: false, ...rest }))
      : [{ description: '', hsnCode: '', qty: 1, unit: 'Nos', price: 0, gstRate: 18, gstInclusive: false }],
  };
}

export default function InvoiceEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { settings } = useSettings();
  const isEdit = !!id;

  const [inv, setInv] = useState(null);
  const [savedId, setSavedId] = useState(id ? Number(id) : null);
  const [customers, setCustomers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);

  // Invoice series
  const [series, setSeries] = useState([]);

  // Client search autofill (gated behind an explicit "Find existing client")
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [clientOpen, setClientOpen] = useState(false);

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
      let custList = [];
      let seriesList = [];
      try {
        [custList, seriesList] = await Promise.all([api.listCustomers(), api.listSeries()]);
        if (!alive) return;
        setCustomers(custList);
        setSeries(seriesList);
      } catch { /* ignore */ }

      if (isEdit) {
        const data = await api.getInvoice(id);
        if (alive) setInv(toForm(data));
      } else {
        const base = defaultInvoice(settings);
        const def = seriesList.find((s) => s.isDefault) || seriesList[0];
        base.seriesId = def?.id ?? null;
        try {
          const { invoiceNo } = await api.nextNumber(base.seriesId);
          base.invoiceNo = invoiceNo;
        } catch { /* ignore */ }
        // Prefill from ?client=:id (e.g. "New invoice for this client")
        const clientId = searchParams.get('client');
        if (clientId) {
          const c = custList.find((x) => x.id === Number(clientId));
          if (c) Object.assign(base, {
            customerId: c.id, buyerName: c.name, buyerAddressLines: c.addressLines || [],
            buyerContactPerson: c.contactPerson || '', buyerContactPhone: c.contactPhone || '',
            buyerEmail: c.email || '', buyerGstn: c.gstn || '', buyerStateCode: c.stateCode || '',
          });
        }
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
  // ── Series ──
  const changeSeries = async (sid) => {
    const id2 = Number(sid);
    set({ seriesId: id2 });
    if (!savedId) {
      try { const { invoiceNo } = await api.nextNumber(id2); set({ seriesId: id2, invoiceNo }); } catch { /* ignore */ }
    }
  };

  // Reset the editor to a fresh new invoice so the user can raise the next one.
  const resetToNew = async () => {
    const base = defaultInvoice(settings);
    const def = series.find((s) => s.isDefault) || series[0];
    base.seriesId = def?.id ?? null;
    try { const { invoiceNo } = await api.nextNumber(base.seriesId); base.invoiceNo = invoiceNo; } catch { /* ignore */ }
    setSavedId(null);
    setClientQuery(''); setClientSearchOpen(false);
    setInv(base);
    window.history.replaceState(null, '', '/new');
    window.scrollTo({ top: 0 });
    document.querySelector('.editor-form')?.scrollTo({ top: 0 });
  };

  // ── Persist ──
  const persist = async () => {
    if (!inv.buyerName.trim()) { flash('Customer name is required', 'err'); return null; }
    setSaving(true);
    try {
      const payload = { ...inv };
      let result;
      if (savedId) {
        result = await api.updateInvoice(savedId, payload);
      } else {
        // Let the series generate & advance the number; the field is just a preview.
        delete payload.invoiceNo;
        result = await api.createInvoice(payload);
      }
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

  // Save (if needed) and return the finalised invoice object, else null.
  const ensureSaved = async () => {
    if (savedId) return inv;
    const r = await persist();
    return r ? toForm(r) : null;
  };

  // Save then clear the editor for the next invoice.
  const saveAndNew = async () => {
    const r = await persist();
    if (r) { flash('Saved — ready for the next invoice'); await resetToNew(); }
  };

  // ── Exports ── (record the invoice first, then clear for the next)
  const doExport = async (kind) => {
    setBusy(kind);
    try {
      const target = await ensureSaved();
      if (!target) return;
      await (kind === 'pdf' ? exporter.pdf(target) : exporter.docx(target));
      await resetToNew();
    } catch (e) { flash(e.message, 'err'); }
    finally { setBusy(''); }
  };

  const doPrint = async () => {
    const target = await ensureSaved();
    if (!target) return;
    window.print();
    await resetToNew();
  };

  const shareWhatsApp = async () => {
    // Ensure saved so totals/number are final, then download PDF for manual attach.
    const target = await ensureSaved();
    if (!target) return;
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
    await resetToNew();
  };

  const shareEmail = async () => {
    // Mirror the WhatsApp flow: finalise, download the PDF (the "payload"),
    // then hand off to the user's default mail app via a mailto: link.
    const target = await ensureSaved();
    if (!target) return;
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
    await resetToNew();
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
          <h2>{savedId ? `Edit ${inv.invoiceNo}` : 'New Invoice'}</h2>
          {inv.editCount > 0 && <span className="badge edited" title={`Edited ${inv.editCount} time(s)`}>edited ×{inv.editCount}</span>}
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
            <label>Series
              <select value={inv.seriesId ?? ''} disabled={!!savedId} onChange={(e) => changeSeries(e.target.value)}>
                {series.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.prefix})</option>)}
              </select>
            </label>
            <label>Invoice No <span className="hint">auto</span>
              <input value={inv.invoiceNo} readOnly title="Auto-generated from the series — change the series in Settings" />
            </label>
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
            <h3>Customer <span className="hint">new client — saved automatically</span></h3>
            <div className="fsec-tools">
              <button className="btn xs" onClick={() => setClientSearchOpen((v) => !v)}>{clientSearchOpen ? 'Close search' : '🔍 Find existing client'}</button>
            </div>
          </div>
          {clientSearchOpen && (
            <div className="client-search">
              <input
                autoFocus
                placeholder="Type a client name to search saved clients…"
                value={clientQuery}
                onChange={(e) => { setClientQuery(e.target.value); setClientOpen(true); }}
                onFocus={() => setClientOpen(true)}
              />
              {clientOpen && clientQuery.trim() && (
                <div className="client-dropdown">
                  {customers
                    .filter((c) => c.name.toLowerCase().includes(clientQuery.trim().toLowerCase()))
                    .slice(0, 10)
                    .map((c) => (
                      <button key={c.id} className="client-opt" onClick={() => { applyCustomer(c.id); setClientQuery(''); setClientOpen(false); setClientSearchOpen(false); }}>
                        <b>{c.name}</b>{c.gstn ? <span> · {c.gstn}</span> : null}{c.contactPhone ? <span> · {c.contactPhone}</span> : null}{c.addressLines?.[0] ? <span> · {c.addressLines[0]}</span> : null}
                      </button>
                    ))}
                  {customers.filter((c) => c.name.toLowerCase().includes(clientQuery.trim().toLowerCase())).length === 0 && (
                    <div className="client-opt empty">No saved client matches — just fill the fields below for a new client.</div>
                  )}
                </div>
              )}
            </div>
          )}
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
                  <label>Price is
                    <div className="incl-toggle">
                      <button type="button" className={!it.gstInclusive ? 'on' : ''} onClick={() => setItem(i, { gstInclusive: false })}>Excl</button>
                      <button type="button" className={it.gstInclusive ? 'on' : ''} onClick={() => setItem(i, { gstInclusive: true })}>Incl</button>
                    </div>
                  </label>
                  <div className="item-line-total">
                    <span>Taxable</span>
                    <b>{sym} {formatINR(lineTaxable(it))}</b>
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

        {inv.edits && inv.edits.length > 0 && (
          <section className="fsec">
            <h3>Edit Log <span className="hint">{inv.edits.length} change(s)</span></h3>
            <ul className="edit-log">
              {inv.edits.map((e) => (
                <li key={e.id}>
                  <span className="el-time">{fmtDateTime(e.changedAt)}</span>
                  <span className="el-sum">{e.summary}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
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
            <button className="btn primary" onClick={savedId ? persist : saveAndNew} disabled={saving}>{saving ? 'Saving…' : (savedId ? 'Update' : 'Save & New')}</button>
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
