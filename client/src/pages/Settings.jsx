import { useMemo, useState } from 'react';
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

  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000); };

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
      flash('Settings saved');
    } catch (e) { flash(e.message, 'err'); }
    finally { setSaving(false); }
  };

  const sample = useMemo(() => ({
    invoiceNo: `${form.invoicePrefix}${String(form.nextInvoiceSeq).padStart(4, '0')}`,
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
  }), [form]);

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
            <label>Invoice Prefix<input value={form.invoicePrefix} onChange={(e) => set({ invoicePrefix: e.target.value })} /></label>
            <label>Next Sequence<input type="number" value={form.nextInvoiceSeq} onChange={(e) => set({ nextInvoiceSeq: Number(e.target.value) })} /></label>
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
