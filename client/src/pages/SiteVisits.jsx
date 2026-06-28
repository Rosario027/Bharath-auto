import { useEffect, useMemo, useState, useCallback } from 'react';
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
  const [categoryF, setCategoryF] = useState('all');
  const [districtF, setDistrictF] = useState('all');
  const [execF, setExecF] = useState('all');
  const [sort, setSort] = useState({ key: 'updated', dir: 'desc' });

  const load = useCallback(async () => {
    setLoading(true);
    try { setVisits(await api.listSiteVisits()); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const arrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');

  const districts = useMemo(() => [...new Set(visits.map((v) => (v.district || '').trim()).filter(Boolean))].sort(), [visits]);
  const execs = useMemo(() => [...new Set(visits.map((v) => v.employee?.name).filter(Boolean))].sort(), [visits]);

  const view = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const filtered = visits.filter((v) =>
      (filter === 'all' || v.status === filter) &&
      (categoryF === 'all' || v.visitCategory === categoryF) &&
      (districtF === 'all' || (v.district || '').trim() === districtF) &&
      (execF === 'all' || v.employee?.name === execF) &&
      (!ql ||
        (v.siteName || '').toLowerCase().includes(ql) ||
        (v.customerName || '').toLowerCase().includes(ql) ||
        (v.builderName || '').toLowerCase().includes(ql) ||
        (v.district || '').toLowerCase().includes(ql) ||
        (v.proName || '').toLowerCase().includes(ql) ||
        (v.contactPhone || '').includes(ql) ||
        (v.quotationNo || '').toLowerCase().includes(ql) ||
        (v.refNo || '').toLowerCase().includes(ql)));
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (v) => {
      switch (sort.key) {
        case 'ref': return v.refNo || '';
        case 'site': return (v.siteName || v.customerName || '').toLowerCase();
        case 'date': return v.visitDate || '';
        case 'customer': return (v.customerName || v.builderName || '').toLowerCase();
        case 'exec': return (v.employee?.name || '').toLowerCase();
        case 'district': return (v.district || '').toLowerCase();
        case 'status': return v.status || '';
        case 'quote': return v.quotationValue || 0;
        case 'followup': return v.nextFollowUp || '';
        case 'tranches': return v.trancheCount || 0;
        default: return new Date(v.updatedAt).getTime();
      }
    };
    return [...filtered].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * dir);
  }, [visits, q, filter, categoryF, districtF, execF, sort]);

  const count = (s) => visits.filter((v) => v.status === s).length;
  const pipeline = visits.filter((v) => v.status !== 'closed').reduce((sum, v) => sum + (v.quotationValue || 0), 0);

  const base = isAdmin ? '/site-visits' : '/my-visits';

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{isAdmin ? 'Site Visits' : 'My Site Visits'}</h1>
          <p className="subtle">{isAdmin ? 'All field visits — name them, then filter / sort / search to find any visit instantly.' : 'Your field visits — create new or update assigned ones.'}</p>
        </div>
        <button className="btn primary" onClick={() => nav(`${base}/new`)}>+ New Site Visit</button>
      </header>

      <div className="stat-row">
        <div className="stat-card"><div className="stat-label">Total Visits</div><div className="stat-value">{visits.length}</div></div>
        <div className="stat-card"><div className="stat-label">Open / Follow-up</div><div className="stat-value">{count('open') + count('follow-up') + count('assigned')}</div></div>
        <div className="stat-card"><div className="stat-label">Pipeline Value</div><div className="stat-value sm">₹ {formatINR(pipeline)}</div></div>
      </div>

      <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="search" placeholder="Search site name, ref, customer, builder, phone, quote no…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ display: 'flex', gap: 4 }}>
          {[['all', 'All'], ['project_visit', '🏗 Project'], ['lead_visit', '🎯 Lead']].map(([val, label]) => (
            <button key={val} className={`seg-toggle ${categoryF === val ? 'on' : ''}`} onClick={() => setCategoryF(val)}>{label}</button>
          ))}
        </div>
        {['all', 'assigned', 'open', 'follow-up', 'closed'].map((f) => (
          <button key={f} className={`seg-toggle ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? `All (${visits.length})` : `${f} (${count(f)})`}
          </button>
        ))}
        {districts.length > 0 && (
          <select value={districtF} onChange={(e) => setDistrictF(e.target.value)} style={{ width: 'auto', padding: '8px 10px' }}>
            <option value="all">All districts</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        {isAdmin && execs.length > 0 && (
          <select value={execF} onChange={(e) => setExecF(e.target.value)} style={{ width: 'auto', padding: '8px 10px' }}>
            <option value="all">All executives</option>
            {execs.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      <div className="card table-card">
        {loading ? <div className="empty">Loading…</div> : view.length === 0 ? (
          <div className="empty">
            {visits.length === 0 ? (
              <>
                <p>No site visits yet.</p>
                <button className="btn primary" onClick={() => nav(`${base}/new`)}>Log your first site visit</button>
              </>
            ) : <p>No visits match the current filters.</p>}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => sortBy('ref')}>Ref{arrow('ref')}</th>
                <th className="sortable" onClick={() => sortBy('site')}>Site Name{arrow('site')}</th>
                <th className="sortable" onClick={() => sortBy('date')}>Visit Date{arrow('date')}</th>
                <th className="sortable" onClick={() => sortBy('customer')}>Customer / Builder{arrow('customer')}</th>
                {isAdmin && <th className="sortable" onClick={() => sortBy('exec')}>Executive{arrow('exec')}</th>}
                <th className="sortable" onClick={() => sortBy('district')}>District{arrow('district')}</th>
                <th className="sortable" onClick={() => sortBy('status')}>Status{arrow('status')}</th>
                <th className="r sortable" onClick={() => sortBy('quote')}>Quote ₹{arrow('quote')}</th>
                <th className="sortable" onClick={() => sortBy('followup')}>Next F-up{arrow('followup')}</th>
                <th className="r sortable" onClick={() => sortBy('tranches')}>Tranches{arrow('tranches')}</th>
                <th className="sortable" onClick={() => sortBy('updated')}>Updated{arrow('updated')}</th>
              </tr>
            </thead>
            <tbody>
              {view.map((v) => (
                <tr key={v.id} className="row-click" onClick={() => nav(`/site-visits/${v.id}`)}>
                  <td className="mono">{v.refNo}</td>
                  <td className="strong">{v.siteName || <span className="subtle">—</span>}</td>
                  <td>{fmtD(v.visitDate)}</td>
                  <td>{v.customerName || v.builderName || '—'}</td>
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
