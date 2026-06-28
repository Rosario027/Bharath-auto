import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const blank = {
  siteName: '', visitDate: todayStr(), customerName: '', contactPerson: '', contactPhone: '', altPhone: '',
  googleLocation: '', address: '', district: '', buildingSize: '', projectType: '',
  proType: '', proName: '', proPhone: '', builderName: '', builderPhone: '', electricalContractor: '',
  leadSource: '', requirementSummary: '', productsDiscussed: '', homeTheatre: '',
  visitType: 'new', status: 'open', quotationNo: '', quotationValue: '', nextFollowUp: '',
  whoIsFollowing: '', probability: 25, remarks: '', employeeId: '',
  visitCategory: 'lead_visit', itemsChecklist: '[]', othersNote: '',
  keyPersonName: '', keyPersonRole: '', keyPersonPhone: '',
  dimensions: '', estimatedCost: '', siteEvaluation: '',
};

const STEPS = ['Visit & Customer', 'Location & Site', 'Site Contacts', 'Lead & Requirement', 'Sales & Status'];

export default function SiteVisitNew() {
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const [v, setV] = useState({ ...blank });
  const [step, setStep] = useState(0);
  const [emps, setEmps] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };
  const set = (patch) => setV((p) => ({ ...p, ...patch }));

  useEffect(() => { if (isAdmin) api.listEmployees().then(setEmps).catch(() => {}); }, [isAdmin]);
  useEffect(() => { api.listInventory().then(setInventory).catch(() => {}); }, []);

  const toggleChecklistItem = (item) => {
    setChecklist((prev) => {
      const exists = prev.find((x) => x.id === item.id);
      const updated = exists ? prev.filter((x) => x.id !== item.id) : [...prev, { id: item.id, name: item.name, qty: 1 }];
      set({ itemsChecklist: JSON.stringify(updated) });
      return updated;
    });
  };

  const updateChecklistQty = (id, qty) => {
    setChecklist((prev) => {
      const updated = prev.map((x) => x.id === id ? { ...x, qty: Number(qty) || 1 } : x);
      set({ itemsChecklist: JSON.stringify(updated) });
      return updated;
    });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return flash('Location not available on this device', 'err');
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { set({ googleLocation: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}` }); setGeoBusy(false); flash('Location captured 📍'); },
      () => { setGeoBusy(false); flash('Could not get location — allow GPS access', 'err'); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const next = () => {
    if (step === 0 && !v.customerName.trim() && !v.builderName.trim()) {
      // allow continuing — builder name may come in step 3; only block at submit
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0 });
  };
  const back = () => { setStep((s) => Math.max(s - 1, 0)); window.scrollTo({ top: 0 }); };

  const submit = async () => {
    if (!v.customerName.trim() && !v.builderName.trim()) return flash('Enter the customer name (step 1) or builder name (step 3)', 'err');
    setBusy(true);
    try {
      const created = await api.createSiteVisit({ ...v, quotationValue: Number(v.quotationValue) || 0, probability: Number(v.probability) || 0 });
      flash(`Saved — ${created.refNo}`);
      nav(`/site-visits/${created.id}`, { replace: true });
    } catch (e) { flash(e.message, 'err'); setBusy(false); }
  };

  const L = (label, field, props = {}) => (
    <label className={props.full ? 'full' : ''}>{label}
      <input value={v[field]} {...props} onChange={(e) => set({ [field]: e.target.value })} />
    </label>
  );

  return (
    <div className="page wizard-page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <button className="btn ghost" onClick={() => nav(-1)}>&larr; Back</button>
          <h1 style={{ marginTop: 6 }}>New Site Visit</h1>
        </div>
      </header>

      {/* step indicator */}
      <div className="wiz-steps">
        {STEPS.map((s, i) => (
          <button key={i} className={`wiz-step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`} onClick={() => setStep(i)}>
            <span className="wiz-num">{i < step ? '✓' : i + 1}</span>
            <span className="wiz-name">{s}</span>
          </button>
        ))}
      </div>

      <section className="fsec">
        <h3>{STEPS[step]} <span className="hint">step {step + 1} of {STEPS.length}</span></h3>

        {step === 0 && (
          <div className="grid2">
            <label className="full">Visit Category
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                {[['project_visit', '🏗 Project Visit', 'Existing project / installation follow-up'], ['lead_visit', '🎯 Lead Visit', 'New prospect / sales enquiry']].map(([val, label, hint]) => (
                  <button key={val} type="button"
                    className={`seg-toggle ${v.visitCategory === val ? 'on' : ''}`}
                    style={{ flex: 1, padding: '10px 14px', textAlign: 'left', borderRadius: 8 }}
                    onClick={() => set({ visitCategory: val })}>
                    <div style={{ fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{hint}</div>
                  </button>
                ))}
              </div>
            </label>
            {isAdmin && (
              <label className="full">Assign to (sales executive)
                <select value={v.employeeId} onChange={(e) => set({ employeeId: e.target.value })}>
                  <option value="">— Unassigned (admin record) —</option>
                  {emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </label>
            )}
            <label className="full">Site Name <span className="hint">to find this visit easily later</span>
              <input value={v.siteName} placeholder='e.g. "Saravana Villa — Vadavalli" or "ABC Mills gate automation"' onChange={(e) => set({ siteName: e.target.value })} />
            </label>
            {L('Visit Date', 'visitDate', { type: 'date' })}
            {L('Customer Name *', 'customerName', { placeholder: 'e.g. Mr. Saravanakumar' })}
            {L('Contact Person', 'contactPerson')}
            {L('Contact Number', 'contactPhone', { type: 'tel' })}
            {L('Alternative Number', 'altPhone', { type: 'tel' })}
          </div>
        )}

        {step === 1 && (
          <div className="grid2">
            <label className="full">Google Location (GPS)
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={v.googleLocation} placeholder="lat, lng or maps link" onChange={(e) => set({ googleLocation: e.target.value })} />
                <button type="button" className="btn" disabled={geoBusy} onClick={useMyLocation}>{geoBusy ? '…' : '📍 Use my location'}</button>
              </div>
            </label>
            <label className="full">Address<textarea rows={2} value={v.address} onChange={(e) => set({ address: e.target.value })} /></label>
            {L('District', 'district', { placeholder: 'e.g. Coimbatore' })}
            {L('Building Size', 'buildingSize', { placeholder: 'e.g. 2400 sq.ft' })}
            <label>Project Type
              <select value={v.projectType} onChange={(e) => set({ projectType: e.target.value })}>
                <option value="">Select…</option>
                {['villa', 'apartment', 'commercial', 'industrial', 'renovation', 'other'].map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="grid2">
            <label>Ar / Ir / Civil Er
              <select value={v.proType} onChange={(e) => set({ proType: e.target.value })}>
                <option value="">None / Unknown</option>
                <option value="Ar">Architect (Ar)</option>
                <option value="Ir">Interior (Ir)</option>
                <option value="Civil Er">Civil Engineer (Er)</option>
              </select>
            </label>
            {L('Name', 'proName')}
            {L('Contact Number', 'proPhone', { type: 'tel' })}
            {L('Builder / Firm Name', 'builderName')}
            {L('Builder Contact Number', 'builderPhone', { type: 'tel' })}
            {L('Electrical Contractor Contact', 'electricalContractor')}
          </div>
        )}

        {step === 3 && (
          <div className="grid2">
            <label>Lead Source
              <select value={v.leadSource} onChange={(e) => set({ leadSource: e.target.value })}>
                <option value="">Select…</option>
                {['walk in', 'reference', 'phone enquiry', 'online', 'exhibition', 'other'].map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label>Home Theatre interest?
              <select value={v.homeTheatre} onChange={(e) => set({ homeTheatre: e.target.value })}>
                <option value="">—</option><option>Yes</option><option>No</option>
              </select>
            </label>
            <label className="full">Requirement Summary<textarea rows={3} value={v.requirementSummary} placeholder="What does the customer need?" onChange={(e) => set({ requirementSummary: e.target.value })} /></label>
            <label className="full">Products Discussed<textarea rows={2} value={v.productsDiscussed} placeholder="e.g. gate automation, sensors, home theatre…" onChange={(e) => set({ productsDiscussed: e.target.value })} /></label>

            {v.visitCategory === 'project_visit' && inventory.length > 0 && (
              <div className="full" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 14 }}>
                <b style={{ display: 'block', marginBottom: 8 }}>Items Checklist (from inventory)</b>
                <p className="subtle" style={{ fontSize: 12, marginTop: 0 }}>Tick the items to be carried / verified at site.</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {inventory.map((item) => {
                    const checked = checklist.find((x) => x.id === item.id);
                    return (
                      <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: `1px solid ${checked ? 'var(--brand-orange)' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', background: checked ? '#fef3ec' : '#fff', fontSize: 13 }}>
                        <input type="checkbox" checked={!!checked} onChange={() => toggleChecklistItem(item)} />
                        {item.name}
                        {checked && (
                          <input type="number" min="1" value={checked.qty} onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateChecklistQty(item.id, e.target.value)}
                            style={{ width: 50, marginLeft: 4 }} />
                        )}
                      </label>
                    );
                  })}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13 }}>
                  <input type="checkbox" onChange={(e) => {
                    if (!e.target.checked) set({ othersNote: '' });
                    else set({ othersNote: ' ' });
                  }} />
                  Others (specify below)
                </label>
                {(v.othersNote !== undefined && v.othersNote !== '') && (
                  <input style={{ marginTop: 6 }} value={v.othersNote} placeholder="Describe other items…" onChange={(e) => set({ othersNote: e.target.value })} />
                )}
              </div>
            )}

            {v.visitCategory === 'project_visit' && (
              <>
                {L('Key Person Name', 'keyPersonName')}
                {L('Key Person Role', 'keyPersonRole')}
                {L('Key Person Phone', 'keyPersonPhone', { type: 'tel' })}
                {L('Dimensions / Area', 'dimensions', { placeholder: 'e.g. 40×60 ft, 2400 sq.ft' })}
                {L('Estimated Cost (₹)', 'estimatedCost', { type: 'number' })}
                <label className="full">Site Evaluation<textarea rows={2} value={v.siteEvaluation} onChange={(e) => set({ siteEvaluation: e.target.value })} placeholder="Notes on site condition, access, power availability…" /></label>
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="grid2">
            <label>Visit Type
              <select value={v.visitType} onChange={(e) => set({ visitType: e.target.value })}>
                <option value="new">New</option><option value="follow up">Follow up</option>
              </select>
            </label>
            <label>Status
              <select value={v.status} onChange={(e) => set({ status: e.target.value })}>
                <option value="open">Open</option><option value="follow-up">Follow-up</option><option value="closed">Closed</option>
              </select>
            </label>
            {L('Quotation No', 'quotationNo')}
            {L('Quotation Value (₹)', 'quotationValue', { type: 'number', step: 'any' })}
            {L('Next Follow-up Date', 'nextFollowUp', { type: 'date' })}
            {L('Who is Following', 'whoIsFollowing')}
            <label>Probability (%)
              <select value={v.probability} onChange={(e) => set({ probability: e.target.value })}>
                {[0, 25, 50, 75, 90, 100].map((p) => <option key={p} value={p}>{p}%</option>)}
              </select>
            </label>
            <label className="full">Remarks<textarea rows={3} value={v.remarks} placeholder="Notes from this visit…" onChange={(e) => set({ remarks: e.target.value })} /></label>
          </div>
        )}

        <div className="wiz-nav">
          {step > 0 && <button className="btn" onClick={back}>← Back</button>}
          <div style={{ flex: 1 }} />
          {step < STEPS.length - 1 && <button className="btn primary" onClick={next}>Next →</button>}
          {step === STEPS.length - 1 && <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : '✓ Submit Site Visit'}</button>}
        </div>
      </section>
    </div>
  );
}
