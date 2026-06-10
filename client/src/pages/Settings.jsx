import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useSettings } from '../App.jsx';
import InvoicePreview from '../components/InvoicePreview.jsx';
import { THEME_LIST } from '../themes.js';

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const linesToText = (a) => (a || []).join('\n');
const textToLines = (t) => t.split('\n').map((s) => s.trim()).filter(Boolean);
const csvToArr = (t) => t.split(',').map((s) => s.trim()).filter(Boolean);

export default function Settings() {
  const { settings, setSettings, refreshSettings, updateSettingsLocal } = useSettings();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [series, setSeries] = useState([]);

  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000); };

  const loadSeries = () => api.listSeries().then(setSeries).catch(() => {});
  useEffect(() => { loadSeries(); }, []);

  const patchSeries = (id, patch) => setSeries((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addSeries = async () => {
    try { await api.createSeries({ name: 'New Series', prefix: 'INV-', nextSeq: 1 }); await loadSeries(); flash('Series added'); }
    catch (e) { flash(e.message, 'err'); }
  };
  const removeSeries = async (id) => {
    if (!confirm('Delete this series?')) return;
    try { await api.deleteSeries(id); await loadSeries(); } catch (e) { flash(e.message, 'err'); }
  };
  const makeDefault = async (id) => {
    try { await api.updateSeries(id, { isDefault: true }); await loadSeries(); } catch (e) { flash(e.message, 'err'); }
  };

  // update local form + propagate to app-wide settings for live reflect
  const set = (patch) => {
    setForm((p) => ({ ...p, ...patch }));
    updateSettingsLocal(patch);
  };

  const onLogo = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    set({ logoDataUrl: await fileToDataUrl(f) });
  };
  const onSign = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    set({ signatureDataUrl: await fileToDataUrl(f) });
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveSettings(form);
      setSettings(saved);
      setForm(saved);
      // persist any series edits (name/prefix/nextSeq)
      await Promise.all(series.map((s) => api.updateSeries(s.id, { name: s.name, prefix: s.prefix, nextSeq: s.nextSeq, padWidth: s.padWidth })));
      await loadSeries();
      flash('Settings saved');
    } catch (e) { flash(e.message, 'err'); }
    finally { setSaving(false); }
  };

  const sample = useMemo(() => ({
    invoiceNo: series[0] ? `${series[0].prefix}${String(series[0].nextSeq).padStart(series[0].padWidth || 4, '0')}` : `${form.invoicePrefix}${String(form.nextInvoiceSeq).padStart(4, '0')}`,
    invoiceDate: new Date().toISOString(),
    title: form.invoiceTitle,
    copyType: form.invoiceCopy,
    transportMode: 'By Road',
    poRefNo: 'PO-2024-001',
    paymentTerms: form.paymentTerms,
    buyerName: 'Sample Customer Pvt Ltd',
    buyerAddressLines: ['14/F, Thottasalai Street', 'Coimbatore - 641 659'],
    buyerContactPhone: '+91-70100 92185',
    buyerGstn: '33ABCDE1234F1Z5',
    taxMode: 'intra',
    theme: form.defaultTheme,
    items: [
      { description: 'Atomberg Studio Pedestal Fan 400mm - Sno White', hsnCode: '84145120', qty: 1, unit: 'Nos', price: 3010, gstRate: form.defaultGstRate ?? 18 },
      { description: 'Installation & commissioning charges', hsnCode: '9954', qty: 1, unit: 'Nos', price: 500, gstRate: form.defaultGstRate ?? 18 },
    ],
  }), [form, series]);

  return (
    <div className="settings">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}

      <div className="settings-form">
        <header className="page-head sticky">
          <div><h1>Settings</h1><p className="subtle">Fixed invoice components — changes preview live on the right.</p></div>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </header>

        <section className="fsec">
          <h3>Company Identity</h3>
          <div className="grid2">
            <label className="full">Company Name<input value={form.companyName} onChange={(e) => set({ companyName: e.target.value })} /></label>
            <label className="full">Tagline<input value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} /></label>
            <label className="full">Logo
              <div className="uploader">
                {form.logoDataUrl ? <img className="logo-prev" src={form.logoDataUrl} alt="logo" /> : <img className="logo-prev" src="/logo-mark.svg" alt="logo" />}
                <input type="file" accept="image/*" onChange={onLogo} />
                {form.logoDataUrl && <button className="btn xs danger" onClick={() => set({ logoDataUrl: null })}>Remove</button>}
              </div>
            </label>
          </div>
        </section>

        <section className="fsec">
          <h3>Address & Contact</h3>
          <div className="grid2">
            <label className="full">Address (one line per row)<textarea rows={3} value={linesToText(form.addressLines)} onChange={(e) => set({ addressLines: textToLines(e.target.value) })} /></label>
            <label>Phones (comma separated)<input value={(form.phones || []).join(', ')} onChange={(e) => set({ phones: csvToArr(e.target.value) })} /></label>
            <label>Emails (comma separated)<input value={(form.emails || []).join(', ')} onChange={(e) => set({ emails: csvToArr(e.target.value) })} /></label>
            <label>Website<input value={form.website} onChange={(e) => set({ website: e.target.value })} /></label>
            <label>GSTIN<input value={form.gstn} onChange={(e) => set({ gstn: e.target.value })} /></label>
            <label>Division<input value={form.division} onChange={(e) => set({ division: e.target.value })} /></label>
            <label>State Code<input value={form.stateCode} onChange={(e) => set({ stateCode: e.target.value })} /></label>
          </div>
        </section>

        <section className="fsec">
          <h3>Invoice Defaults</h3>
          <div className="grid2">
            <label>Invoice Title<input value={form.invoiceTitle} onChange={(e) => set({ invoiceTitle: e.target.value })} /></label>
            <label>Copy Label<input value={form.invoiceCopy} onChange={(e) => set({ invoiceCopy: e.target.value })} /></label>
            <label>Currency Symbol<input value={form.currencySymbol} onChange={(e) => set({ currencySymbol: e.target.value })} /></label>
            <label>Default Theme
              <div className="theme-picker">
                {THEME_LIST.map((t) => (
                  <button key={t.key} type="button" className={`swatch ${form.defaultTheme === t.key ? 'on' : ''}`} style={{ background: t.accent }} title={t.name} onClick={() => set({ defaultTheme: t.key })} />
                ))}
              </div>
            </label>
          </div>
        </section>

        <section className="fsec">
          <div className="fsec-head">
            <h3>Invoice Number Series</h3>
            <button className="btn xs" onClick={addSeries}>+ Add series</button>
          </div>
          <p className="subtle" style={{ fontSize: 12, marginTop: 0 }}>The next number auto-increments and is never reused (deleted invoices keep their number). Pick the active series per invoice from the editor's Series dropdown.</p>
          {series.map((s) => (
            <div className="series-row" key={s.id}>
              <label>Name<input value={s.name} onChange={(e) => patchSeries(s.id, { name: e.target.value })} /></label>
              <label>Prefix<input value={s.prefix} onChange={(e) => patchSeries(s.id, { prefix: e.target.value })} /></label>
              <label>Next #<input type="number" value={s.nextSeq} onChange={(e) => patchSeries(s.id, { nextSeq: Number(e.target.value) })} /></label>
              <span className={`badge vt-${s.docType === 'credit-note' ? 'credit-note' : s.docType === 'debit-note' ? 'debit-note' : 'sales'}`} style={{ alignSelf: 'center' }}>
                {s.docType === 'credit-note' ? 'Credit Note' : s.docType === 'debit-note' ? 'Debit Note' : 'Invoice'}
              </span>
              <button className={`btn xs ${s.isDefault ? 'primary' : ''}`} onClick={() => makeDefault(s.id)} title="Set as default series for this document type">{s.isDefault ? '★ Default' : 'Make default'}</button>
              <button className="btn xs danger" disabled={series.length <= 1} onClick={() => removeSeries(s.id)}>✕</button>
            </div>
          ))}
          <div className="subtle" style={{ fontSize: 12, marginTop: 8 }}>Preview next: <b>{series.map((s) => `${s.prefix}${String(s.nextSeq).padStart(s.padWidth || 4, '0')}`).join(', ') || '—'}</b></div>
        </section>

        <section className="fsec">
          <h3>Tax Defaults</h3>
          <div className="grid2">
            <label>Default GST rate % (per new item)
              <select value={form.defaultGstRate ?? 18} onChange={(e) => set({ defaultGstRate: Number(e.target.value) })}>
                {[...new Set([0, 5, 12, 18, 28, Number(form.defaultGstRate) || 18])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </label>
          </div>
          <p className="subtle" style={{ fontSize: 12 }}>GST is applied per line item; each invoice line can override this rate, and the sale type (intra/inter-state) decides CGST+SGST vs IGST.</p>
        </section>

        <section className="fsec">
          <h3>Payment & Bank</h3>
          <div className="grid2">
            <label>Payment Terms<input value={form.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} /></label>
            <label>Bank Name<input value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} /></label>
            <label>Account No<input value={form.bankAccount} onChange={(e) => set({ bankAccount: e.target.value })} /></label>
            <label>IFSC<input value={form.bankIfsc} onChange={(e) => set({ bankIfsc: e.target.value })} /></label>
            <label>Branch<input value={form.bankBranch} onChange={(e) => set({ bankBranch: e.target.value })} /></label>
          </div>
        </section>

        <section className="fsec">
          <h3>Footer & Signature</h3>
          <div className="grid2">
            <label className="full">Terms Note<textarea rows={2} value={form.termsNote} onChange={(e) => set({ termsNote: e.target.value })} /></label>
            <label>Footer Note<input value={form.footerNote} onChange={(e) => set({ footerNote: e.target.value })} /></label>
            <label>Signatory Label<input value={form.signatory} onChange={(e) => set({ signatory: e.target.value })} /></label>
            <label className="full">Signature Image
              <div className="uploader">
                {form.signatureDataUrl && <img className="logo-prev" src={form.signatureDataUrl} alt="sign" />}
                <input type="file" accept="image/*" onChange={onSign} />
                {form.signatureDataUrl && <button className="btn xs danger" onClick={() => set({ signatureDataUrl: null })}>Remove</button>}
              </div>
            </label>
          </div>
        </section>
      </div>

      <div className="settings-preview">
        <div className="preview-bar"><span className="subtle">Live preview</span></div>
        <div className="preview-scroll">
          <InvoicePreview invoice={sample} settings={form} />
        </div>
      </div>
    </div>
  );
}
