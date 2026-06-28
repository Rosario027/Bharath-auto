import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const TASK_LABELS = { assigned: 'Yet to be taken', processing: 'Processing', pending_deadline_approval: 'Deadline Pending', completed: 'Completed' };
const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };

export default function StaffTasksAdmin() {
  const nav = useNavigate();
  const [emps, setEmps] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState('tasks');
  const [deadlineReqs, setDeadlineReqs] = useState([]);
  const [form, setForm] = useState({ employeeId: '', title: '', description: '', dueDate: '', priority: 'medium' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    try {
      const [e, t, dr] = await Promise.all([api.listEmployees(), api.adminTasks(), api.adminDeadlineRequests().catch(() => [])]);
      setEmps(e); setTasks(t); setDeadlineReqs(dr);
    } catch (e2) { flash(e2.message, 'err'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const assign = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.assignTask(form);
      setForm({ employeeId: form.employeeId, title: '', description: '', dueDate: '', priority: 'medium' });
      await load();
      flash(form.employeeId ? 'Task assigned — the staff member will see it on their dashboard' : 'Task added to your (admin) list');
    } catch (e2) { flash(e2.message, 'err'); } finally { setBusy(false); }
  };

  const remove = async (t) => {
    if (!confirm(`Delete task "${t.title}"?`)) return;
    try { await api.deleteTask(t.id); await load(); } catch (e) { flash(e.message, 'err'); }
  };

  const decideDeadline = async (id, decision) => {
    try {
      await api.decideDeadlineRequest(id, { status: decision });
      flash(`Deadline request ${decision}`);
      await load();
    } catch (e) { flash(e.message, 'err'); }
  };

  const view = tasks.filter((t) => filter === 'all' || t.status === filter);
  const pendingDeadlineCount = deadlineReqs.filter((r) => r.status === 'pending').length;

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

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`seg-toggle ${tab === 'tasks' ? 'on' : ''}`} onClick={() => setTab('tasks')}>Tasks</button>
        <button className={`seg-toggle ${tab === 'deadline-requests' ? 'on' : ''}`} onClick={() => setTab('deadline-requests')}>
          Deadline Requests{pendingDeadlineCount > 0 ? ` (${pendingDeadlineCount} pending)` : ''}
        </button>
      </div>

      {tab === 'deadline-requests' && (
        <div className="card table-card">
          {deadlineReqs.length === 0 ? <div className="empty">No deadline change requests.</div> : (
            <table className="data-table">
              <thead><tr><th>Task</th><th>Employee</th><th>Original Due</th><th>Proposed</th><th>Reason</th><th>Status</th><th className="r">Actions</th></tr></thead>
              <tbody>
                {deadlineReqs.map((r) => (
                  <tr key={r.id}>
                    <td className="strong">{r.task?.title || `Task #${r.taskId}`}</td>
                    <td>{r.employee?.name || '—'}</td>
                    <td>{fmtDate(r.originalDate)}</td>
                    <td><b style={{ color: '#b9651a' }}>{fmtDate(r.proposedDate)}</b></td>
                    <td style={{ maxWidth: 240, fontSize: 13 }}>{r.reason}</td>
                    <td><span className={`badge rq-${r.status}`}>{r.status}</span></td>
                    <td className="r">
                      {r.status === 'pending' && (
                        <div className="row-actions">
                          <button className="btn xs" style={{ background: '#e7f6ec', color: '#1f8f4e' }} onClick={() => decideDeadline(r.id, 'approved')}>Approve</button>
                          <button className="btn xs danger" onClick={() => decideDeadline(r.id, 'rejected')}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'tasks' && (<>

      <section className="fsec">
        <h3>Assign a new task</h3>
        <form onSubmit={assign} className="grid2">
          <label>Assign to
            <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">⭐ Myself (Admin)</option>
              {emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <label>Priority
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">🟢 Low</option>
              <option value="medium">🟡 Medium</option>
              <option value="high">🔴 High</option>
            </select>
          </label>
          <label>Due date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
          <label className="full">Task title *<input value={form.title} placeholder="e.g. Install control panel at Saravana Mills" onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label className="full">Description<textarea rows={2} value={form.description} placeholder="Details, location, materials…" onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div><button className="btn primary" type="submit" disabled={busy || !form.title.trim()}>{busy ? 'Assigning…' : 'Assign task'}</button></div>
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
            <thead><tr><th>Task</th><th>Assigned To</th><th>Priority</th><th>Due</th><th>Status</th><th>Staff comments</th><th className="r">Actions</th></tr></thead>
            <tbody>
              {view.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.title}</b>{t.description && <div className="subtle" style={{ fontSize: 12 }}>{t.description}</div>}</td>
                  <td>{t.employee?.name || <span className="badge" style={{ background: '#fef3ec', color: '#b9651a' }}>Admin (self)</span>}</td>
                  <td><span className={`badge pr-${t.priority}`}>{t.priority}</span></td>
                  <td>{fmtDate(t.dueDate)}</td>
                  <td><span className={`badge rq-${t.status === 'completed' ? 'approved' : t.status === 'processing' ? 'pending' : t.status === 'pending_deadline_approval' ? 'pending' : 'rejected'}`} style={{ textTransform: 'none', background: t.status === 'pending_deadline_approval' ? '#fef3ec' : undefined, color: t.status === 'pending_deadline_approval' ? '#b9651a' : undefined }}>{TASK_LABELS[t.status] || t.status}</span></td>
                  <td style={{ maxWidth: 260 }}>{t.staffComment ? <i>"{t.staffComment}"</i> : <span className="subtle">—</span>}</td>
                  <td className="r"><button className="btn xs danger" onClick={() => remove(t)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>)}
    </div>
  );
}
