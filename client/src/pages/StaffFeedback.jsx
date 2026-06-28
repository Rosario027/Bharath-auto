import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const CATEGORIES = ['general', 'management', 'workplace', 'safety', 'compensation', 'recognition', 'other'];
const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };

export default function StaffFeedback() {
  const { isAdmin } = useAuth();
  const [feedbacks, setFeedbacks] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ category: 'general', message: '' });
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const [catFilter, setCatFilter] = useState('all');
  const [readFilter, setReadFilter] = useState('all');
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const data = await api.listFeedback();
      setFeedbacks(data.feedbacks || []);
      setUnreadCount(data.unreadCount || 0);
    } finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.message.trim()) return flash('Please write your feedback before submitting', 'err');
    setBusy('submit');
    try {
      await api.submitFeedback(form);
      setSubmitted(true);
      setForm({ category: 'general', message: '' });
    } catch (err) { flash(err.message, 'err'); }
    finally { setBusy(''); }
  };

  const markRead = async (id) => {
    try { await api.markFeedbackRead(id); await load(); } catch (e) { flash(e.message, 'err'); }
  };

  const markAllRead = async () => {
    try { await api.markAllFeedbackRead(); await load(); flash('All marked as read'); } catch (e) { flash(e.message, 'err'); }
  };

  const catColor = (c) => {
    const map = { safety: '#fde8e8', compensation: '#fef3ec', management: '#e8f4fd', recognition: '#e7f6ec', workplace: '#f0e6ff' };
    return map[c] || '#f3f4f6';
  };

  const view = feedbacks.filter((f) => {
    if (catFilter !== 'all' && f.category !== catFilter) return false;
    if (readFilter === 'unread' && f.read) return false;
    if (readFilter === 'read' && !f.read) return false;
    return true;
  });

  if (!isAdmin) {
    return (
      <div className="page" style={{ maxWidth: 580, margin: '0 auto' }}>
        {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
        <header className="page-head">
          <div><h1>Share Feedback</h1><p className="subtle">Your feedback is completely anonymous — no name or login is attached.</p></div>
        </header>

        {submitted ? (
          <div className="fsec" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <h2>Thank you for your feedback!</h2>
            <p className="subtle">Your response has been recorded anonymously and will be reviewed by the admin.</p>
            <button className="btn primary" style={{ marginTop: 16 }} onClick={() => setSubmitted(false)}>Submit another</button>
          </div>
        ) : (
          <section className="fsec">
            <form onSubmit={submit}>
              <label>Category
                <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </label>
              <label style={{ display: 'block', marginTop: 12 }}>Your Feedback *
                <textarea rows={5} value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                  placeholder="Share your thoughts, suggestions, or concerns freely. This is anonymous." />
              </label>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn primary" type="submit" disabled={busy === 'submit'}>{busy === 'submit' ? 'Submitting…' : 'Submit anonymously'}</button>
                <span className="subtle" style={{ fontSize: 12 }}>No personal info is stored with this submission.</span>
              </div>
            </form>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <h1>Staff Feedback <span className="hint">{unreadCount > 0 ? `${unreadCount} unread` : 'all read'}</span></h1>
          <p className="subtle">Anonymous feedback from staff — no names attached.</p>
        </div>
        {unreadCount > 0 && <button className="btn" onClick={markAllRead}>Mark all read</button>}
      </header>

      <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`seg-toggle ${catFilter === 'all' ? 'on' : ''}`} onClick={() => setCatFilter('all')}>All ({feedbacks.length})</button>
          {CATEGORIES.map((c) => {
            const cnt = feedbacks.filter((f) => f.category === c).length;
            return cnt > 0 ? (
              <button key={c} className={`seg-toggle ${catFilter === c ? 'on' : ''}`} onClick={() => setCatFilter(c)}>
                {c.charAt(0).toUpperCase() + c.slice(1)} ({cnt})
              </button>
            ) : null;
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {['all', 'unread', 'read'].map((r) => (
            <button key={r} className={`seg-toggle ${readFilter === r ? 'on' : ''}`} onClick={() => setReadFilter(r)}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="empty">Loading…</div> : view.length === 0 ? (
        <div className="empty">No feedback here.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {view.map((f) => (
            <div key={f.id} style={{ background: f.read ? '#fff' : '#fffbf0', border: `1px solid ${f.read ? '#e5e7eb' : '#f5c06a'}`, borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {!f.read && <span style={{ width: 8, height: 8, background: '#f5a623', borderRadius: '50%', display: 'inline-block' }} />}
                  <span className="badge" style={{ background: catColor(f.category), color: '#374151' }}>
                    {f.category}
                  </span>
                  <span className="subtle" style={{ fontSize: 12 }}>{fmtDate(f.createdAt)}</span>
                </div>
                {!f.read && <button className="btn xs" onClick={() => markRead(f.id)}>Mark read</button>}
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{f.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
