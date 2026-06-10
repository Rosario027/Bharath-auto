import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { formatINR } from '../utils/money.js';

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtD = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };
const fmtDT = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const blankUpdate = { visitDate: todayStr(), visitType: 'follow up', status: 'follow-up', productsDiscussed: '', quotationNo: '', quotationValue: '', nextFollowUp: '', whoIsFollowing: '', probability: '', summary: '' };

function Field({ label, value }) {
  return <div className="sv-field"><span>{label}</span><b>{value || '—'}</b></div>;
}

export default function SiteVisitDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const [v, setV] = useState(null);
  const [emps, setEmps] = useState([]);
  const [assignTo, setAssignTo] = useState('');
  const [showUpdate, setShowUpdate] = useState(false);
  const [u, setU] = useState({ ...blankUpdate });
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    try {
      const visit = await api.getSiteVisit(id);
      setV(visit);
      setAssignTo(visit.employeeId || '');
      setU((p) => ({ ...p, status: visit.status === 'assigned' ? 'open' : visit.status, quotationNo: visit.quotationNo, whoIsFollowing: visit.whoIsFollowing, probability: visit.probability }));
    } catch (e) { flash(e.message, 'err'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isAdmin) api.listEmployees().then(setEmps).catch(() => {}); }, [isAdmin]);

  if (!v) return <div className="page"><div className="empty">Loading…</div></div>;

  const reassign = async () => {
    setBusy('assign');
    try {
      await api.assignSiteVisit(v.id, assignTo ? Number(assignTo) : null);
      await load();
      flash(assignTo ? 'Assigned — a task was added to their portal' : 'Unassigned');
    } catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };

  const submitUpdate = async (e) => {
    e.preventDefault();
    setBusy('update');
    try {
      await api.addSiteVisitUpdate(v.id, { ...u, quotationValue: u.quotationValue === '' ? undefined : Number(u.quotationValue), probability: u.probability === '' ? undefined : Number(u.probability) });
      setU({ ...blankUpdate });
      setShowUpdate(false);
      await load();
      flash('Update saved as a new tranche');
    } catch (e2) { flash(e2.message, 'err'); } finally { setBusy(''); }
  };

  const remove = async () => {
    if (!confirm(`Delete site visit ${v.refNo}? All tranches will be removed.`)) return;
    try { await api.deleteSiteVisit(v.id); nav(isAdmin ? '/site-visits' : '/my-visits'); } catch (e) { flash(e.message, 'err'); }
  };

  const mapHref = v.googleLocation
    ? (v.googleLocation.startsWith('http') ? v.googleLocation : `https://maps.google.com/?q=${encodeURIComponent(v.googleLocation)}`)
    : null;

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <button className="btn ghost" onClick={() => nav(isAdmin ? '/site-visits' : '/my-visits')}>&larr; Site Visits</button>
          <h1 style={{ marginTop: 6 }}>{v.refNo} · {v.customerName || v.builderName || 'Site Visit'} <span className={`badge sv-${v.status}`}>{v.status}</span></h1>
          <p className="subtle">First visit {fmtD(v.visitDate)} · {v.trancheCount ?? v.updates.length} tranche(s) · Executive: <b>{v.employee?.name || 'Unassigned'}</b></p>
        </div>
        <button className="btn primary" onClick={() => { setShowUpdate((s) => !s); }}>{showUpdate ? 'Cancel' : '+ Add Update (new tranche)'}</button>
      </header>

      {/* Add update */}
      {showUpdate && (
        <section className="fsec" style={{ borderLeft: '4px solid var(--brand-orange)' }}>
          <h3>New Update · Tranche #{(v.updates[0]?.tranche || 0) + 1}</h3>
          <form onSubmit={submitUpdate} className="grid2">
            <label>Visit Date<input type="date" value={u.visitDate} onChange={(e) => setU({ ...u, visitDate: e.target.value })} /></label>
            <label>Visit Type
              <select value={u.visitType} onChange={(e) => setU({ ...u, visitType: e.target.value })}>
                <option value="new">New</option><option value="follow up">Follow up</option>
              </select>
            </label>
            <label>Status
              <select value={u.status} onChange={(e) => setU({ ...u, status: e.target.value })}>
                <option value="open">Open</option><option value="follow-up">Follow-up</option><option value="closed">Closed</option>
              </select>
            </label>
            <label>Probability (%)
              <select value={u.probability} onChange={(e) => setU({ ...u, probability: e.target.value })}>
                {[0, 25, 50, 75, 90, 100].map((p) => <option key={p} value={p}>{p}%</option>)}
              </select>
            </label>
            <label>Quotation No<input value={u.quotationNo} onChange={(e) => setU({ ...u, quotationNo: e.target.value })} /></label>
            <label>Quotation Value (₹)<input type="number" step="any" value={u.quotationValue} onChange={(e) => setU({ ...u, quotationValue: e.target.value })} /></label>
            <label>Next Follow-up<input type="date" value={u.nextFollowUp} onChange={(e) => setU({ ...u, nextFollowUp: e.target.value })} /></label>
            <label>Who is Following<input value={u.whoIsFollowing} onChange={(e) => setU({ ...u, whoIsFollowing: e.target.value })} /></label>
            <label className="full">Products Discussed<input value={u.productsDiscussed} onChange={(e) => setU({ ...u, productsDiscussed: e.target.value })} /></label>
            <label className="full">What happened on this visit? *<textarea rows={3} value={u.summary} placeholder="Outcome, discussions, commitments…" onChange={(e) => setU({ ...u, summary: e.target.value })} /></label>
            <div><button className="btn primary" type="submit" disabled={busy === 'update' || !u.summary.trim()}>{busy === 'update' ? 'Saving…' : 'Save tranche'}</button></div>
          </form>
        </section>
      )}

      {/* Admin: assign / reassign */}
      {isAdmin && (
        <section className="fsec">
          <h3>Assignment</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ minWidth: 240 }}>Sales executive
              <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                <option value="">— Unassigned —</option>
                {emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            <button className="btn" disabled={busy === 'assign'} onClick={reassign}>{Number(assignTo) === v.employeeId ? 'Re-notify' : (v.employeeId ? 'Reassign' : 'Assign')}</button>
            <span className="subtle" style={{ fontSize: 12 }}>Assigning drops a task into their portal; their next submission becomes the next tranche.</span>
          </div>
        </section>
      )}

      {/* Master info */}
      <div className="staff-grid">
        <section className="fsec">
          <h3>Customer & Location</h3>
          <div className="sv-grid">
            <Field label="Customer" value={v.customerName} />
            <Field label="Contact Person" value={v.contactPerson} />
            <Field label="Phone" value={v.contactPhone} />
            <Field label="Alt Phone" value={v.altPhone} />
            <Field label="District" value={v.district} />
            <Field label="Building Size" value={v.buildingSize} />
            <Field label="Project Type" value={v.projectType} />
            <div className="sv-field"><span>GPS</span><b>{mapHref ? <a href={mapHref} target="_blank" rel="noreferrer">📍 Open in Maps</a> : '—'}</b></div>
            <div className="sv-field" style={{ gridColumn: '1 / -1' }}><span>Address</span><b>{v.address || '—'}</b></div>
          </div>
        </section>

        <section className="fsec">
          <h3>Site Contacts & Lead</h3>
          <div className="sv-grid">
            <Field label={`Professional (${v.proType || 'Ar/Ir/Er'})`} value={v.proName} />
            <Field label="Pro Contact" value={v.proPhone} />
            <Field label="Builder / Firm" value={v.builderName} />
            <Field label="Builder Contact" value={v.builderPhone} />
            <Field label="Electrical Contractor" value={v.electricalContractor} />
            <Field label="Lead Source" value={v.leadSource} />
            <Field label="Home Theatre" value={v.homeTheatre} />
            <div className="sv-field" style={{ gridColumn: '1 / -1' }}><span>Requirement</span><b>{v.requirementSummary || '—'}</b></div>
            <div className="sv-field" style={{ gridColumn: '1 / -1' }}><span>Products Discussed</span><b>{v.productsDiscussed || '—'}</b></div>
          </div>
        </section>
      </div>

      <section className="fsec">
        <h3>Sales Pipeline · latest</h3>
        <div className="sv-grid">
          <Field label="Visit Type" value={v.visitType} />
          <Field label="Quotation No" value={v.quotationNo} />
          <Field label="Quotation Value" value={v.quotationValue ? `₹ ${formatINR(v.quotationValue)}` : '—'} />
          <Field label="Next Follow-up" value={fmtD(v.nextFollowUp)} />
          <Field label="Who is Following" value={v.whoIsFollowing} />
          <Field label="Probability" value={`${v.probability}%`} />
          <div className="sv-field" style={{ gridColumn: '1 / -1' }}><span>Latest Remarks</span><b>{v.remarks || '—'}</b></div>
        </div>
      </section>

      {/* Tranche history */}
      <section className="fsec">
        <h3>Update History <span className="hint">{v.updates.length} tranche(s)</span></h3>
        <div className="tranche-list">
          {v.updates.map((t) => (
            <div className="tranche" key={t.id}>
              <div className="tr-head">
                <span className="tr-no">Tranche #{t.tranche}</span>
                <span className={`badge sv-${t.status || 'open'}`}>{t.status || '—'}</span>
                <span className="tr-meta">{fmtD(t.visitDate)} · by {t.byUsername} · logged {fmtDT(t.createdAt)}</span>
              </div>
              <div className="tr-body">{t.summary || '—'}</div>
              <div className="tr-tags">
                {t.visitType && <span>{t.visitType}</span>}
                {t.productsDiscussed && <span>🛒 {t.productsDiscussed}</span>}
                {t.quotationNo && <span>📄 {t.quotationNo}{t.quotationValue ? ` · ₹${formatINR(t.quotationValue)}` : ''}</span>}
                {t.nextFollowUp && <span>⏭ {fmtD(t.nextFollowUp)}</span>}
                {t.probability > 0 && <span>{t.probability}%</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {isAdmin && <div><button className="btn danger" onClick={remove}>Delete site visit</button></div>}
    </div>
  );
}
