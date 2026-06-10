import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const TASK_LABELS = { assigned: 'Yet to be taken', processing: 'Processing', completed: 'Completed' };
const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };

export default function StaffTasksAdmin() {
  const nav = useNavigate();
  const [emps, setEmps] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ employeeId: '', title: '', description: '', dueDate: '' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    try {
      const [e, t] = await Promise.all([api.listEmployees(), api.adminTasks()]);
      setEmps(e); setTasks(t);
    } catch (e2) { flash(e2.message, 'err'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const assign = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.assignTask(form);
      setForm({ employeeId: form.employeeId, title: '', description: '', dueDate: '' });
      await load();
      flash('Task assigned — the staff member will see it on their dashboard');
    } catch (e2) { flash(e2.message, 'err'); } finally { setBusy(false); }
  };

  const remove = async (t) => {
    if (!confirm(`Delete task "${t.title}"?`)) return;
    try { await api.deleteTask(t.id); await load(); } catch (e) { flash(e.message, 'err'); }
  };

  const view = tasks.filter((t) => filter === 'all' || t.status === filter);

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <button className="btn ghost" onClick={() => nav('/staff')}>&larr; Staff</button>
          <h1 style={{ marginTop: 6 }}>Task Assignment</h1>
          <p className="subtle">Assign work to staff — they update status & comments from their portal.</p>
        </div>
      </header>

      <section className="fsec">
        <h3>Assign a new task</h3>
        <form onSubmit={assign} className="grid2">
          <label>Staff member *
            <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">Select…</option>
              {emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <label>Due date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
          <label className="full">Task title *<input value={form.title} placeholder="e.g. Install control panel at Saravana Mills" onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label className="full">Description<textarea rows={2} value={form.description} placeholder="Details, location, materials…" onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div><button className="btn primary" type="submit" disabled={busy || !form.employeeId || !form.title.trim()}>{busy ? 'Assigning…' : 'Assign task'}</button></div>
        </form>
      </section>

      <div className="toolbar" style={{ display: 'flex', gap: 8 }}>
        {['all', 'assigned', 'processing', 'completed'].map((f) => (
          <button key={f} className={`seg-toggle ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? `All (${tasks.length})` : `${TASK_LABELS[f]} (${tasks.filter((t) => t.status === f).length})`}
          </button>
        ))}
      </div>

      <div className="card table-card">
        {view.length === 0 ? <div className="empty">No tasks here.</div> : (
          <table className="data-table">
            <thead><tr><th>Task</th><th>Staff</th><th>Due</th><th>Status</th><th>Staff comments</th><th className="r">Actions</th></tr></thead>
            <tbody>
              {view.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.title}</b>{t.description && <div className="subtle" style={{ fontSize: 12 }}>{t.description}</div>}</td>
                  <td>{t.employee?.name || '—'}</td>
                  <td>{fmtDate(t.dueDate)}</td>
                  <td><span className={`badge rq-${t.status === 'completed' ? 'approved' : t.status === 'processing' ? 'pending' : 'rejected'}`} style={{ textTransform: 'none' }}>{TASK_LABELS[t.status]}</span></td>
                  <td style={{ maxWidth: 260 }}>{t.staffComment ? <i>"{t.staffComment}"</i> : <span className="subtle">—</span>}</td>
                  <td className="r"><button className="btn xs danger" onClick={() => remove(t)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
