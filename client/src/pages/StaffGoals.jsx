import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; };

export default function StaffGoals() {
  const { isAdmin, user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState('');
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  const [form, setForm] = useState({ employeeId: '', title: '', kpis: '', targetDate: '', evidenceUrl: '' });
  const [updateForm, setUpdateForm] = useState({ progress: 0, evidenceUrl: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = isAdmin ? await api.listGoals() : await api.getMyGoals();
      setGoals(data);
    } finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isAdmin) api.listEmployees().then(setEmployees).catch(() => {}); }, [isAdmin]);

  const create = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return flash('Goal title is required', 'err');
    if (!form.employeeId) return flash('Select an employee', 'err');
    setBusy('create');
    try {
      const kpisArr = form.kpis.split('\n').map((s) => s.trim()).filter(Boolean);
      await api.createGoal({ employeeId: Number(form.employeeId), title: form.title, kpis: kpisArr, targetDate: form.targetDate || null });
      flash('Goal assigned');
      setForm({ employeeId: '', title: '', kpis: '', targetDate: '', evidenceUrl: '' });
      setShowForm(false);
      await load();
    } catch (err) { flash(err.message, 'err'); }
    finally { setBusy(''); }
  };

  const openUpdate = (g) => {
    setEditGoal(g);
    setUpdateForm({ progress: g.progress || 0, evidenceUrl: g.evidenceUrl || '' });
  };

  const saveUpdate = async () => {
    if (!editGoal) return;
    setBusy('update');
    try {
      await api.updateGoal(editGoal.id, { progress: Number(updateForm.progress), evidenceUrl: updateForm.evidenceUrl });
      flash('Progress updated');
      setEditGoal(null);
      await load();
    } catch (e) { flash(e.message, 'err'); }
    finally { setBusy(''); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this goal?')) return;
    try { await api.deleteGoal(id); await load(); } catch (e) { flash(e.message, 'err'); }
  };

  const empName = (id) => employees.find((e) => e.id === id)?.name || `Employee #${id}`;
  const progressColor = (p) => p >= 100 ? '#1f8f4e' : p >= 60 ? '#2471a3' : p >= 30 ? '#b9651a' : '#c0392b';

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <h1>Career Development</h1>
          <p className="subtle">{isAdmin ? 'Assign and track staff goals and KPIs.' : 'Your assigned goals and progress.'}</p>
        </div>
        {isAdmin && <button className="btn primary" onClick={() => setShowForm((v) => !v)}>{showForm ? '✕ Close' : '+ Assign Goal'}</button>}
      </header>

      {showForm && isAdmin && (
        <section className="fsec">
          <h3>Assign new goal</h3>
          <form onSubmit={create} className="grid2">
            <label>Employee
              <select value={form.employeeId} onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))}>
                <option value="">— Select —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            <label>Target Date (optional)<input type="date" value={form.targetDate} onChange={(e) => setForm((p) => ({ ...p, targetDate: e.target.value }))} /></label>
            <label className="full">Goal Title *<input value={form.title} placeholder="e.g. Achieve customer satisfaction score > 4.5" onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} /></label>
            <label className="full">KPIs (one per line)
              <textarea rows={3} value={form.kpis} placeholder="e.g. Complete 3 site visits/week&#10;Pass safety training by Sep 30" onChange={(e) => setForm((p) => ({ ...p, kpis: e.target.value }))} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" type="submit" disabled={busy === 'create'}>{busy === 'create' ? 'Assigning…' : 'Assign Goal'}</button>
              <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      {editGoal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="fsec" style={{ background: '#fff', padding: 24, borderRadius: 10, minWidth: 340, maxWidth: 500 }}>
            <h3 style={{ marginTop: 0 }}>Update Progress</h3>
            <p style={{ fontSize: 13, color: '#555' }}>{editGoal.title}</p>
            <label>Progress (%)
              <input type="range" min="0" max="100" value={updateForm.progress} onChange={(e) => setUpdateForm((p) => ({ ...p, progress: e.target.value }))} />
              <span style={{ fontWeight: 700, color: progressColor(Number(updateForm.progress)) }}> {updateForm.progress}%</span>
            </label>
            <label style={{ display: 'block', marginTop: 10 }}>Evidence / Notes URL
              <input value={updateForm.evidenceUrl} onChange={(e) => setUpdateForm((p) => ({ ...p, evidenceUrl: e.target.value }))} placeholder="Link to report, photo, document…" />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn primary" onClick={saveUpdate} disabled={busy === 'update'}>{busy === 'update' ? 'Saving…' : 'Save'}</button>
              <button className="btn" onClick={() => setEditGoal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card table-card">
        {loading ? <div className="empty">Loading…</div> : goals.length === 0 ? (
          <div className="empty"><p>No goals assigned yet.</p>{isAdmin && <button className="btn primary" onClick={() => setShowForm(true)}>Assign the first goal</button>}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
            {goals.map((g) => (
              <div key={g.id} className="fsec" style={{ margin: 0, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    {isAdmin && <div className="subtle" style={{ fontSize: 12, marginBottom: 2 }}>{empName(g.employeeId)}</div>}
                    <b style={{ fontSize: 15 }}>{g.title}</b>
                    {g.targetDate && <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>Target: {fmtDate(g.targetDate)}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn xs" onClick={() => openUpdate(g)}>Update Progress</button>
                    {isAdmin && <button className="btn xs danger" onClick={() => remove(g.id)}>✕</button>}
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>Progress</span>
                    <b style={{ color: progressColor(g.progress || 0) }}>{g.progress || 0}%</b>
                  </div>
                  <div style={{ background: '#f3f4f6', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${g.progress || 0}%`, height: '100%', background: progressColor(g.progress || 0), transition: 'width 0.3s' }} />
                  </div>
                </div>

                {g.kpis?.length > 0 && (
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, fontSize: 13 }}>
                    {g.kpis.map((kpi, i) => <li key={i}>{kpi}</li>)}
                  </ul>
                )}
                {g.evidenceUrl && (
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    Evidence: <a href={g.evidenceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-orange)' }}>{g.evidenceUrl}</a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
