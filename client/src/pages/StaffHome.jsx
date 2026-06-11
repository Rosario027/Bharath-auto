import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const TASK_LABELS = { assigned: 'Yet to be taken', processing: 'Processing', completed: 'Completed' };

function Calendar({ month, records, requests = [], onPrev, onNext, onDay }) {
  const reqDays = new Set(requests.filter((r) => r.date.slice(0, 7) === month).map((r) => Number(r.date.slice(8))));
  const presentDays = useMemo(() => new Set(records.filter((r) => r.present).map((r) => Number(r.date.slice(8)))), [records]);
  const first = new Date(`${month}-01T00:00:00`);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const startPad = first.getDay();
  const isThisMonth = todayStr().slice(0, 7) === month;
  const todayDay = Number(todayStr().slice(8));
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <div className="att-cal">
      <div className="att-cal-head">
        <button className="btn xs" onClick={onPrev}>←</button>
        <b>{monthLabel(month)}</b>
        <button className="btn xs" onClick={onNext}>→</button>
      </div>
      <div className="att-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="att-dow">{d}</span>)}
        {cells.map((d, i) => (
          <button key={i} disabled={d == null}
            onClick={() => d != null && onDay && onDay(`${month}-${String(d).padStart(2, '0')}`)}
            className={`att-day ${d == null ? 'pad' : ''} ${d != null && presentDays.has(d) ? 'present' : ''} ${isThisMonth && d === todayDay ? 'today' : ''} ${d != null && reqDays.has(d) ? 'requested' : ''}`}>
            {d || ''}
          </button>
        ))}
      </div>
      <div className="att-legend"><span className="dot present" /> Present · {presentDays.size} day(s) this month · <span className="dot" style={{ background: '#e8a13b' }} /> update requested · click a date for details</div>
    </div>
  );
}

export default function StaffHome() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [attendance, setAttendance] = useState([]);
  const [attReqs, setAttReqs] = useState([]);
  const [dayDetail, setDayDetail] = useState(null);
  const [reqSummary, setReqSummary] = useState('');
  const [tasks, setTasks] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState('');
  const [showFullDay, setShowFullDay] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ fromDate: '', toDate: '', reason: '' });
  const [expForm, setExpForm] = useState({ date: todayStr(), category: 'Travel', amount: '', description: '', receipt: null });
  const [taskEdits, setTaskEdits] = useState({});
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  const loadAll = useCallback(async () => {
    try {
      const [p, t, l, x, ar] = await Promise.all([api.getMyProfile(), api.myTasks(), api.myLeaves(), api.myExpenses(), api.myAttendanceRequests().catch(() => [])]);
      setProfile(p); setTasks(t); setLeaves(l); setExpenses(x); setAttReqs(ar);
    } catch (e) { flash(e.message, 'err'); }
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { api.getMyAttendance(month).then((r) => setAttendance(r.records)).catch(() => {}); }, [month, profile]);

  const shiftMonth = (delta) => {
    const d = new Date(`${month}-01T00:00:00`); d.setMonth(d.getMonth() + delta);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const today = profile?.today;
  const clockedIn = !!today?.clockIn;
  const clockedOut = !!today?.clockOut;

  const doClockIn = async () => {
    setBusy('in');
    try { await api.clockIn(); await loadAll(); flash('Clocked in — have a great day!'); }
    catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };
  const doClockOut = async () => {
    if (!summary.trim()) return flash('Add a brief description of today\'s work before clocking out', 'err');
    setBusy('out');
    try { await api.clockOut(summary.trim()); setSummary(''); await loadAll(); flash('Clocked out — see you tomorrow!'); }
    catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };
  const doFullDay = async () => {
    if (!summary.trim()) return flash('A brief description of the day\'s work is required', 'err');
    setBusy('full');
    try { await api.markFullDay(summary.trim()); setSummary(''); setShowFullDay(false); await loadAll(); flash('Full day marked'); }
    catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };

  const submitLeave = async (e) => {
    e.preventDefault();
    setBusy('leave');
    try { await api.requestLeave(leaveForm); setLeaveForm({ fromDate: '', toDate: '', reason: '' }); setLeaves(await api.myLeaves()); flash('Leave request sent'); }
    catch (e2) { flash(e2.message, 'err'); } finally { setBusy(''); }
  };

  const onReceipt = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return flash('Receipt must be an image', 'err');
    if (file.size > 2 * 1024 * 1024) return flash('Receipt image exceeds 2 MB', 'err');
    const r = new FileReader();
    r.onload = () => setExpForm((p) => ({ ...p, receipt: r.result }));
    r.readAsDataURL(file);
  };
  const submitExpense = async (e) => {
    e.preventDefault();
    setBusy('exp');
    try {
      await api.claimExpense({ ...expForm, amount: Number(expForm.amount) });
      setExpForm({ date: todayStr(), category: 'Travel', amount: '', description: '', receipt: null });
      setExpenses(await api.myExpenses());
      flash('Expense claim submitted');
    } catch (e2) { flash(e2.message, 'err'); } finally { setBusy(''); }
  };
  const viewMyReceipt = async (id) => {
    try { const { dataUrl } = await api.myExpenseReceipt(id); if (dataUrl) { const w = window.open(); w.document.write(`<img src="${dataUrl}" style="max-width:100%">`); } }
    catch (e) { flash(e.message, 'err'); }
  };

  const saveTask = async (t) => {
    const edit = taskEdits[t.id] || {};
    setBusy(`task${t.id}`);
    try {
      await api.updateMyTask(t.id, { status: edit.status ?? t.status, staffComment: edit.staffComment ?? t.staffComment });
      setTasks(await api.myTasks());
      setTaskEdits((p) => { const n = { ...p }; delete n[t.id]; return n; });
      flash('Task updated');
    } catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };
  const editTask = (id, patch) => setTaskEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));

  const openDay = async (date) => {
    try { setReqSummary(''); setDayDetail(await api.myAttendanceDay(date)); }
    catch (e) { flash(e.message, 'err'); }
  };
  const submitAttReq = async () => {
    if (!reqSummary.trim()) return flash('Describe the work you did that day', 'err');
    try {
      await api.requestAttendance(dayDetail.date, reqSummary.trim());
      setAttReqs(await api.myAttendanceRequests());
      await openDay(dayDetail.date);
      flash('Request sent to admin for approval');
    } catch (e) { flash(e.message, 'err'); }
  };

  const newTasks = tasks.filter((t) => t.status === 'assigned').length;

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <h1>My Workspace</h1>
          <p className="subtle">Welcome, <b>{profile?.employee?.name || user.username}</b> · {fmtDate(profile?.date)}</p>
        </div>
      </header>

      <div className="staff-grid">
        {/* ── Clock in/out ── */}
        <section className="fsec clock-card">
          <h3>Attendance · Today</h3>
          <div className="clock-times">
            <div><span>Clock In</span><b className={clockedIn ? 'ok' : ''}>{fmtTime(today?.clockIn)}</b></div>
            <div><span>Clock Out</span><b className={clockedOut ? 'ok' : ''}>{fmtTime(today?.clockOut)}</b></div>
            <div><span>Status</span><b>{today?.present ? (today.manual ? 'Full day (manual)' : 'Present') : 'Not marked'}</b></div>
          </div>

          {!clockedIn && !today?.present && (
            <button className="btn primary big" disabled={busy === 'in'} onClick={doClockIn}>{busy === 'in' ? '…' : '▶ Clock In'}</button>
          )}

          {clockedIn && !clockedOut && (
            <>
              <label style={{ marginTop: 10 }}>What did you work on today? *<textarea rows={2} value={summary} placeholder="Brief description of today's tasks (required to clock out)" onChange={(e) => setSummary(e.target.value)} /></label>
              <button className="btn primary big" disabled={busy === 'out'} onClick={doClockOut}>{busy === 'out' ? '…' : '■ Clock Out'}</button>
            </>
          )}

          {clockedOut && <div className="clock-done">✅ Day completed. <i>{today.workSummary}</i></div>}
          {!clockedIn && today?.present && today?.manual && <div className="clock-done">✅ Full day marked. <i>{today.workSummary}</i></div>}

          {!clockedOut && !today?.manual && (
            <div className="fullday-box">
              <button className="btn xs ghost" onClick={() => setShowFullDay((v) => !v)}>{showFullDay ? 'Cancel' : 'Missed clock-in? Mark full day'}</button>
              {showFullDay && (
                <>
                  <label>Day's work description *<textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
                  <button className="btn" disabled={busy === 'full'} onClick={doFullDay}>{busy === 'full' ? '…' : 'Mark full day present'}</button>
                </>
              )}
            </div>
          )}
        </section>

        {/* ── Calendar ── */}
        <section className="fsec">
          <h3>My Attendance Calendar</h3>
          <Calendar month={month} records={attendance} requests={attReqs} onPrev={() => shiftMonth(-1)} onNext={() => shiftMonth(1)} onDay={openDay} />
          {dayDetail && (
            <div className="day-detail">
              <div className="fsec-head" style={{ marginBottom: 6 }}>
                <b>{fmtDate(dayDetail.date)}</b>
                <button className="btn xs" onClick={() => setDayDetail(null)}>Close</button>
              </div>
              {dayDetail.record?.present ? (
                <>
                  <span className="badge rq-approved">Present{dayDetail.record.manual ? ' (full day)' : ''}</span>
                  <div className="subtle" style={{ fontSize: 12, marginTop: 6 }}>
                    In: {fmtTime(dayDetail.record.clockIn)} · Out: {fmtTime(dayDetail.record.clockOut)}
                  </div>
                  {dayDetail.record.workSummary && <div style={{ fontSize: 13, marginTop: 6 }}>📝 {dayDetail.record.workSummary}</div>}
                </>
              ) : (
                <>
                  <span className="badge rq-rejected">Absent / not marked</span>
                  {dayDetail.request ? (
                    <div style={{ marginTop: 8 }}>
                      <span className={`badge rq-${dayDetail.request.status}`}>update {dayDetail.request.status}</span>
                      <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>📝 {dayDetail.request.workSummary}{dayDetail.request.adminComment ? ` · Admin: ${dayDetail.request.adminComment}` : ''}</div>
                    </div>
                  ) : dayDetail.date <= todayStr() ? (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <textarea rows={2} placeholder="Missed marking? Describe the work you did that day…" value={reqSummary} onChange={(e) => setReqSummary(e.target.value)} />
                      <button className="btn xs primary" onClick={submitAttReq}>Request attendance update</button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {/* ── Tasks ── */}
      <section className="fsec">
        <h3>My Tasks {newTasks > 0 && <span className="hint">{newTasks} new assigned by admin</span>}</h3>
        {tasks.length === 0 ? <p className="subtle">No tasks assigned yet.</p> : (
          <div className="task-list">
            {tasks.map((t) => {
              const edit = taskEdits[t.id] || {};
              const status = edit.status ?? t.status;
              return (
                <div className={`task-card st-${status}`} key={t.id}>
                  <div className="task-main">
                    <div className="task-title">{t.title} <span className={`badge pr-${t.priority || 'medium'}`}>{t.priority || 'medium'}</span> {t.status === 'assigned' && !edit.status && <span className="badge edited">new</span>}</div>
                    {t.description && <div className="task-desc">{t.description}</div>}
                    <div className="task-meta">Assigned by {t.assignedBy} · {new Date(t.createdAt).toLocaleDateString('en-IN')}{t.dueDate ? ` · Due ${fmtDate(t.dueDate)}` : ''}</div>
                  </div>
                  <div className="task-side">
                    <select value={status} onChange={(e) => editTask(t.id, { status: e.target.value })}>
                      {Object.entries(TASK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <textarea rows={2} placeholder="Add your comments on this work…" value={edit.staffComment ?? t.staffComment} onChange={(e) => editTask(t.id, { staffComment: e.target.value })} />
                    <button className="btn xs primary" disabled={busy === `task${t.id}` || !taskEdits[t.id]} onClick={() => saveTask(t)}>Save update</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="staff-grid">
        {/* ── Leave requests ── */}
        <section className="fsec">
          <h3>Leave Requests</h3>
          <form onSubmit={submitLeave} className="grid2" style={{ marginBottom: 14 }}>
            <label>From<input type="date" value={leaveForm.fromDate} onChange={(e) => setLeaveForm({ ...leaveForm, fromDate: e.target.value })} /></label>
            <label>To<input type="date" value={leaveForm.toDate} onChange={(e) => setLeaveForm({ ...leaveForm, toDate: e.target.value })} /></label>
            <label className="full">Reason *<input value={leaveForm.reason} placeholder="Why do you need leave?" onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} /></label>
            <div><button className="btn primary" type="submit" disabled={busy === 'leave' || !leaveForm.fromDate || !leaveForm.toDate}>Request leave</button></div>
          </form>
          {leaves.map((l) => (
            <div className="req-row" key={l.id}>
              <div>
                <b>{fmtDate(l.fromDate)} → {fmtDate(l.toDate)}</b>
                <div className="subtle" style={{ fontSize: 12 }}>{l.reason}{l.adminComment ? ` · Admin: ${l.adminComment}` : ''}</div>
              </div>
              <span className={`badge rq-${l.status}`}>{l.status}</span>
            </div>
          ))}
        </section>

        {/* ── Expense claims ── */}
        <section className="fsec">
          <h3>Expense Claims</h3>
          <form onSubmit={submitExpense} className="grid2" style={{ marginBottom: 14 }}>
            <label>Date<input type="date" value={expForm.date} onChange={(e) => setExpForm({ ...expForm, date: e.target.value })} /></label>
            <label>Category
              <select value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}>
                {['Travel', 'Food', 'Fuel', 'Material', 'Other'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>Amount (₹) *<input type="number" step="any" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} /></label>
            <label>Receipt (image · ≤2MB)
              <input type="file" accept="image/*" onChange={(e) => { onReceipt(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {expForm.receipt && <div className="full subtle" style={{ fontSize: 12 }}>📎 Receipt attached <button type="button" className="btn xs danger" onClick={() => setExpForm({ ...expForm, receipt: null })}>remove</button></div>}
            <label className="full">Details *<textarea rows={2} value={expForm.description} placeholder="Describe the expense in detail…" onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} /></label>
            <div><button className="btn primary" type="submit" disabled={busy === 'exp'}>Submit claim</button></div>
          </form>
          {expenses.map((x) => (
            <div className="req-row" key={x.id}>
              <div>
                <b>₹ {x.amount} · {x.category}</b> <span className="subtle" style={{ fontSize: 12 }}>{fmtDate(x.date)}</span>
                <div className="subtle" style={{ fontSize: 12 }}>{x.description}{x.adminComment ? ` · Admin: ${x.adminComment}` : ''}
                  {x.hasReceipt && <button className="btn xs" style={{ marginLeft: 6 }} onClick={() => viewMyReceipt(x.id)}>View receipt</button>}
                </div>
              </div>
              <span className={`badge rq-${x.status}`}>{x.status}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
