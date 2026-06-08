import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

function ageFrom(dob) {
  if (!dob) return '—';
  const d = new Date(dob);
  if (isNaN(d)) return '—';
  let a = new Date().getFullYear() - d.getFullYear();
  const m = new Date().getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && new Date().getDate() < d.getDate())) a--;
  return a;
}
function fmtDate(d) { if (!d) return '—'; const t = new Date(d); return `${String(t.getDate()).padStart(2,'0')}.${String(t.getMonth()+1).padStart(2,'0')}.${t.getFullYear()}`; }
function expirySoon(d) { if (!d) return false; const days = (new Date(d) - Date.now()) / 864e5; return days <= 30; }

export default function Staff() {
  const nav = useNavigate();
  const [emps, setEmps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setEmps(await api.listEmployees()); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const togglePresent = async (e) => {
    setBusy(e.id);
    try { await api.setAttendance(e.id, !e.presentToday); await load(); }
    catch (err) { alert(err.message); } finally { setBusy(null); }
  };

  const view = emps.filter((e) => !q.trim() || e.name.toLowerCase().includes(q.toLowerCase()) || (e.phone || '').includes(q));
  const presentCount = emps.filter((e) => e.presentToday).length;
  const expiringCount = emps.filter((e) => expirySoon(e.insuranceExpiry)).length;

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Staff</h1><p className="subtle">Employee files, attendance and documents.</p></div>
        <button className="btn primary" onClick={() => nav('/staff/new')}>+ Add employee</button>
      </header>

      <div className="stat-row">
        <div className="stat-card"><div className="stat-label">Total Employees</div><div className="stat-value">{emps.length}</div></div>
        <div className="stat-card"><div className="stat-label">Working Today</div><div className="stat-value">{presentCount}</div></div>
        <div className="stat-card"><div className="stat-label">Insurance expiring (30d)</div><div className="stat-value">{expiringCount}</div></div>
      </div>

      <div className="toolbar"><input className="search" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} /></div>

      <div className="card table-card">
        {loading ? <div className="empty">Loading…</div> : view.length === 0 ? (
          <div className="empty"><p>No employees yet.</p><button className="btn primary" onClick={() => nav('/staff/new')}>Create the first employee file</button></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Age</th><th>Phone</th><th>Blood</th><th>Vehicle</th><th>Insurance</th><th>Today</th><th className="r">Actions</th></tr></thead>
            <tbody>
              {view.map((e) => (
                <tr key={e.id} className="row-click" onClick={() => nav(`/staff/${e.id}`)}>
                  <td className="strong">{e.name}</td>
                  <td>{ageFrom(e.dob)}</td>
                  <td>{e.phone || '—'}</td>
                  <td>{e.bloodGroup || '—'}</td>
                  <td className="mono">{e.vehicleNo || '—'}</td>
                  <td className={expirySoon(e.insuranceExpiry) ? 'exp-soon' : ''}>{fmtDate(e.insuranceExpiry)}</td>
                  <td onClick={(ev) => ev.stopPropagation()}>
                    <button className={`seg-toggle ${e.presentToday ? 'on' : ''}`} disabled={busy === e.id} onClick={() => togglePresent(e)}>
                      {e.presentToday ? 'Present' : 'Mark'}
                    </button>
                  </td>
                  <td className="r" onClick={(ev) => ev.stopPropagation()}>
                    <button className="btn xs" onClick={() => nav(`/staff/${e.id}`)}>Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
