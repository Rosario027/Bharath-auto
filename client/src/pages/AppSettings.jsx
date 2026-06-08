import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSettings, useAuth } from '../App.jsx';

export default function AppSettings() {
  const { settings, setSettings } = useSettings();
  const { user } = useAuth();
  const [form, setForm] = useState({
    loginHeading: settings.loginHeading || 'Thirukural of the day',
    loginNote: settings.loginNote || '',
    showLoginQuote: settings.showLoginQuote !== false,
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000); };

  // Quotes
  const [quotes, setQuotes] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const loadQuotes = () => api.listLoginQuotes().then((r) => { setQuotes(r.quotes); setSchedule(r.schedule); }).catch(() => {});
  // Users
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
  const loadUsers = () => api.listUsers().then(setUsers).catch(() => {});

  useEffect(() => { loadQuotes(); loadUsers(); }, []);

  const patchQuote = (id, patch) => setQuotes((p) => p.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const addQuote = async () => { try { await api.createLoginQuote({ text: 'முதல் வரி\nஇரண்டாம் வரி', meaning: '' }); await loadQuotes(); } catch (e) { flash(e.message, 'err'); } };
  const removeQuote = async (id) => { if (!confirm('Delete this quote?')) return; try { await api.deleteLoginQuote(id); await loadQuotes(); } catch (e) { flash(e.message, 'err'); } };
  const firstLine = (id) => { const q = quotes.find((x) => x.id === id); return q ? q.text.split('\n')[0] : '—'; };
  const schedDate = (ms) => new Date(ms).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });

  const saveAll = async () => {
    setSaving(true);
    try {
      const saved = await api.saveSettings({ ...settings, ...form });
      setSettings(saved);
      await Promise.all(quotes.map((q) => api.updateLoginQuote(q.id, { text: q.text, meaning: q.meaning, active: q.active })));
      await loadQuotes();
      flash('Saved — reflected on every login screen');
    } catch (e) { flash(e.message, 'err'); }
    finally { setSaving(false); }
  };

  const resetPw = async (u) => {
    const pw = prompt(`Set a new password for "${u.username}":`);
    if (!pw) return;
    try { await api.resetUserPassword(u.id, pw); flash(`Password reset for ${u.username}`); } catch (e) { flash(e.message, 'err'); }
  };
  const addUser = async () => {
    if (!newUser.username.trim() || !newUser.password.trim()) return flash('Enter user ID and password', 'err');
    try { await api.createUser(newUser); setNewUser({ username: '', password: '', role: 'user' }); await loadUsers(); flash('User created'); }
    catch (e) { flash(e.message, 'err'); }
  };
  const removeUser = async (u) => {
    if (u.username === user.username) return flash("You can't delete your own account", 'err');
    if (!confirm(`Delete user "${u.username}"?`)) return;
    try { await api.deleteUser(u.id); await loadUsers(); } catch (e) { flash(e.message, 'err'); }
  };

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div><h1>Settings</h1><p className="subtle">Common application settings — website content & users.</p></div>
        <button className="btn primary" onClick={saveAll} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </header>

      {/* ── Website data ── */}
      <section className="fsec">
        <div className="fsec-head">
          <h3>Login Screen · About</h3>
          <button className="btn xs" onClick={addQuote}>+ Add quote</button>
        </div>
        <p className="subtle" style={{ fontSize: 12, marginTop: 0 }}>Quotes (Thirukkural) rotate automatically — one per day, same for everyone. Changes reflect on every user's login screen.</p>
        <div className="grid2">
          <label>Heading<input value={form.loginHeading} onChange={(e) => setForm({ ...form, loginHeading: e.target.value })} /></label>
          <label>Show daily quote
            <select value={form.showLoginQuote ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, showLoginQuote: e.target.value === 'yes' })}>
              <option value="yes">Yes</option><option value="no">No</option>
            </select>
          </label>
          <label className="full">Static note (always shown)<input value={form.loginNote} placeholder="e.g. Together for a productive day" onChange={(e) => setForm({ ...form, loginNote: e.target.value })} /></label>
        </div>
        <div className="quotes-list">
          {quotes.map((q) => (
            <div className={`quote-row ${q.active ? '' : 'off'}`} key={q.id}>
              <textarea className="q-text" rows={2} value={q.text} onChange={(e) => patchQuote(q.id, { text: e.target.value })} />
              <input className="q-mean" value={q.meaning} placeholder="Meaning (English)" onChange={(e) => patchQuote(q.id, { meaning: e.target.value })} />
              <label className="q-active"><input type="checkbox" checked={q.active} onChange={(e) => patchQuote(q.id, { active: e.target.checked })} /> Active</label>
              <button className="btn xs danger" onClick={() => removeQuote(q.id)}>✕</button>
            </div>
          ))}
        </div>
        {schedule.length > 0 && (
          <div className="sched">
            <div className="sched-head">Upcoming schedule</div>
            {schedule.map((s) => (
              <div className="sched-row" key={s.dayOffset}>
                <span className="sched-date">{s.dayOffset === 0 ? 'Today' : schedDate(s.dateMs)}</span>
                <span className="sched-q">{s.quoteId ? firstLine(s.quoteId) : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── User management ── */}
      <section className="fsec">
        <h3>User Management</h3>
        <table className="data-table" style={{ marginBottom: 14 }}>
          <thead><tr><th>User ID</th><th>Role</th><th className="r">Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="strong">{u.username}{u.username === user.username ? ' (you)' : ''}</td>
                <td><span className={`badge`} style={{ background: u.role === 'admin' ? '#fef3ec' : '#e7f6ec', color: u.role === 'admin' ? '#b9651a' : '#1f8f4e' }}>{u.role}</span></td>
                <td className="r">
                  <div className="row-actions">
                    <button className="btn xs" onClick={() => resetPw(u)}>Reset password</button>
                    <button className="btn xs danger" onClick={() => removeUser(u)}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid2">
          <label>New User ID<input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} /></label>
          <label>Password<input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></label>
          <label>Role
            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
              <option value="user">User (invoicing only)</option>
              <option value="admin">Admin (full access)</option>
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn" onClick={addUser}>+ Add user</button></div>
        </div>
      </section>
    </div>
  );
}
