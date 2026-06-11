import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { formatINR } from '../utils/money.js';

const fmtD = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };
const fmtDT = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

// One page serves both: admin (/site-visits → all) and staff (/my-visits → own).
export default function SiteVisits() {
  const nav = useNavigate();
  const { isAdmin: roleAdmin, user } = useAuth();
  const isAdmin = roleAdmin || user?.perms?.siteVisits === 'full';
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try { setVisits(await api.listSiteVisits()); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const view = visits.filter((v) =>
    (filter === 'all' || v.status === filter) &&
    (!q.trim() ||
      (v.customerName || '').toLowerCase().includes(q.toLowerCase()) ||
      (v.builderName || '').toLowerCase().includes(q.toLowerCase()) ||
      (v.district || '').toLowerCase().includes(q.toLowerCase()) ||
      (v.refNo || '').toLowerCase().includes(q.toLowerCase())));

  const count = (s) => visits.filter((v) => v.status === s).length;
  const pipeline = visits.filter((v) => v.status !== 'closed').reduce((sum, v) => sum + (v.quotationValue || 0), 0);

  const base = isAdmin ? '/site-visits' : '/my-visits';

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{isAdmin ? 'Site Visits' : 'My Site Visits'}</h1>
          <p className="subtle">{isAdmin ? 'All field visits — assign, track tranches and pipeline.' : 'Your field visits — create new or update assigned ones.'}</p>
        </div>
        <button className="btn primary" onClick={() => nav(`${base}/new`)}>+ New Site Visit</button>
      </header>

      <div className="stat-row">
        <div className="stat-card"><div className="stat-label">Total Visits</div><div className="stat-value">{visits.length}</div></div>
        <div className="stat-card"><div className="stat-label">Open / Follow-up</div><div className="stat-value">{count('open') + count('follow-up') + count('assigned')}</div></div>
        <div className="stat-card"><div className="stat-label">Pipeline Value</div><div className="stat-value sm">₹ {formatINR(pipeline)}</div></div>
      </div>

      <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="search" placeholder="Search ref, customer, builder, district…" value={q} onChange={(e) => setQ(e.target.value)} />
        {['all', 'assigned', 'open', 'follow-up', 'closed'].map((f) => (
          <button key={f} className={`seg-toggle ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? `All (${visits.length})` : `${f} (${count(f)})`}
          </button>
        ))}
      </div>

      <div className="card table-card">
        {loading ? <div className="empty">Loading…</div> : view.length === 0 ? (
          <div className="empty">
            <p>No site visits yet.</p>
            <button className="btn primary" onClick={() => nav(`${base}/new`)}>Log your first site visit</button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref</th><th>Visit Date</th><th>Customer / Builder</th>
                {isAdmin && <th>Executive</th>}
                <th>District</th><th>Status</th><th className="r">Quote ₹</th><th>Next F-up</th><th className="r">Tranches</th><th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {view.map((v) => (
                <tr key={v.id} className="row-click" onClick={() => nav(`/site-visits/${v.id}`)}>
                  <td className="mono">{v.refNo}</td>
                  <td>{fmtD(v.visitDate)}</td>
                  <td className="strong">{v.customerName || v.builderName || '—'}</td>
                  {isAdmin && <td>{v.employee?.name || <span className="subtle">—</span>}</td>}
                  <td>{v.district || '—'}</td>
                  <td><span className={`badge sv-${v.status}`}>{v.status}</span></td>
                  <td className="r">{v.quotationValue ? formatINR(v.quotationValue, false) : '—'}</td>
                  <td>{fmtD(v.nextFollowUp)}</td>
                  <td className="r">{v.trancheCount}</td>
                  <td>{fmtDT(v.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
