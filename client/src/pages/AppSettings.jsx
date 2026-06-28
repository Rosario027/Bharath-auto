import { useEffect, useState } from 'react';
import { api, exporter } from '../api.js';
import { useSettings, useAuth } from '../App.jsx';

const MODULES = [
  ['invoice', 'Invoicing'], ['accounting', 'Accounting'], ['clients', 'Clients'],
  ['siteVisits', 'Site Visits'], ['inventory', 'Inventory'], ['reports', 'Reports'],
];
const ROLE_DEFAULTS = {
  user: { invoice: 'full', accounting: 'full', clients: 'none', siteVisits: 'user', inventory: 'full', reports: 'full' },
  staff: { invoice: 'none', accounting: 'none', clients: 'none', siteVisits: 'user', inventory: 'none', reports: 'none' },
};
const parsePerms = (u) => {
  let p = {};
  try { p = u.perms ? JSON.parse(u.perms) : {}; } catch { /* ignore */ }
  return { ...(ROLE_DEFAULTS[u.role] || ROLE_DEFAULTS.user), ...p };
};

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

  // Payment terms management
  const [terms, setTerms] = useState([]);
  const [newTerm, setNewTerm] = useState('');
  const loadTerms = () => api.listPaymentTerms('?all=true').then(setTerms).catch(() => {});
  useEffect(() => { loadTerms(); }, []);

  // Quotes
  const [quotes, setQuotes] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const loadQuotes = () => api.listLoginQuotes().then((r) => { setQuotes(r.quotes); setSchedule(r.schedule); }).catch(() => {});
  // Users + sessions + perms
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
  const [permsFor, setPermsFor] = useState(null); // user being edited
  const [permDraft, setPermDraft] = useState({});
  const [loginOpen, setLoginOpen] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const loadUsers = () => api.listUsers().then(setUsers).catch(() => {});
  const loadSessions = () => api.listSessions().then(setSessions).catch(() => {});

  useEffect(() => { loadQuotes(); loadUsers(); loadSessions(); }, []);

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

      {/* ── Data backup ── */}
      <section className="fsec">
        <div className="fsec-head">
          <h3>Data Backup <span className="hint">periodical full export</span></h3>
          <button className="btn primary" disabled={backupBusy} onClick={async () => { setBackupBusy(true); try { await exporter.fullBackup(); flash('Backup downloaded'); } catch (e) { flash(e.message, 'err'); } finally { setBackupBusy(false); } }}>
            {backupBusy ? 'Preparing ZIP…' : '⬇ Download full backup (ZIP)'}
          </button>
        </div>
        <p className="subtle" style={{ fontSize: 12 }}>One ZIP with Excel files of every dataset — invoices, credit/debit notes, clients, staff, attendance, leaves, expenses, tasks, site visits, inventory, all journal entries & ledgers, edit logs, fixed assets, users — plus PDF copies of every invoice/CN/DN. Download periodically and store safely.</p>
      </section>

      {/* ── Website data ── */}
      <section className="fsec">
        <div className="fsec-head">
          <h3 style={{ cursor: 'pointer' }} onClick={() => setLoginOpen((v) => !v)}>Login Screen · About <span className="hint">{loginOpen ? '▲ collapse' : '▼ expand'}</span></h3>
          {loginOpen && <button className="btn xs" onClick={addQuote}>+ Add quote</button>}
        </div>
        {!loginOpen ? <p className="subtle" style={{ fontSize: 12, margin: 0 }}>Thirukkural rotation, heading & static note — click to expand.</p> : (
        <div>
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
                    {u.role !== 'admin' && <button className="btn xs" onClick={() => { setPermsFor(u); setPermDraft(parsePerms(u)); }}>Permissions</button>}
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
              <option value="user">User + Accountant (invoicing, accounting, inventory, reports)</option>
              <option value="staff">Staff (own portal + site visits only)</option>
              <option value="admin">Admin (full access)</option>
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn" onClick={addUser}>+ Add user</button></div>
        </div>
        <p className="subtle" style={{ fontSize: 12 }}>Non-admin logins automatically get a staff file (attendance, leaves, expenses, tasks). Use <b>Permissions</b> on each user to grant per-module access: <b>None</b> (hidden) · <b>User</b> (own data only) · <b>Full</b> (admin-like inside that module).</p>

        {permsFor && (
          <div className="fsec" style={{ borderLeft: '4px solid var(--brand-orange)', marginTop: 10 }}>
            <div className="fsec-head">
              <h3>Module Permissions · {permsFor.username} <span className="hint">{permsFor.role}</span></h3>
              <button className="btn xs" onClick={() => setPermsFor(null)}>Close</button>
            </div>
            <div className="perm-grid">
              {MODULES.map(([key, label]) => (
                <div className="perm-row" key={key}>
                  <span className="perm-name">{label}</span>
                  {['none', 'user', 'full'].map((lvl) => (
                    <button key={lvl}
                      className={`seg-toggle ${permDraft[key] === lvl ? 'on' : ''}`}
                      title={lvl === 'none' ? 'Hidden completely' : lvl === 'user' ? 'Own data only' : 'Admin-like full access'}
                      onClick={() => setPermDraft((p) => ({ ...p, [key]: lvl }))}>
                      {lvl === 'none' ? 'None' : lvl === 'user' ? 'User' : 'Full'}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={async () => {
                try { await api.updateUser(permsFor.id, { perms: permDraft }); await loadUsers(); setPermsFor(null); flash('Permissions saved — applies on their next request'); }
                catch (e) { flash(e.message, 'err'); }
              }}>Save permissions</button>
              <span className="subtle" style={{ fontSize: 12, alignSelf: 'center' }}>e.g. give one employee Site Visits "User" — they see only visits/tasks assigned to them, fully isolated from admin data.</span>
            </div>
          </div>
        )}
      </section>

      {/* ── Active sessions ── */}
      <section className="fsec">
        <div className="fsec-head">
          <h3>Login Sessions <span className="hint">auto-logout after 60 min idle</span></h3>
          <button className="btn xs" onClick={loadSessions}>↻ Refresh</button>
        </div>
        {sessions.length === 0 ? <p className="subtle">No sessions yet.</p> : (
          <table className="data-table">
            <thead><tr><th>User</th><th>IP</th><th>Device</th><th>Logged in</th><th>Last activity</th><th>Status</th></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="strong">{s.username} <span className="subtle">· {s.role === 'user' ? 'accountant' : s.role}</span></td>
                  <td className="mono" style={{ fontSize: 12 }}>{s.ip || '—'}</td>
                  <td style={{ maxWidth: 220, fontSize: 12 }} className="subtle">{(s.userAgent || '—').slice(0, 60)}</td>
                  <td style={{ fontSize: 12 }}>{new Date(s.loginAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ fontSize: 12 }}>{new Date(s.lastSeen).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td><span className={`badge ${s.status === 'active' ? 'rq-approved' : s.status === 'expired' ? 'rq-pending' : 'deleted'}`}>{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Payment Terms ── */}
      <section className="fsec">
        <div className="fsec-head">
          <h3>Payment Terms <span className="hint">dropdown choices in Invoice editor</span></h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newTerm} onChange={(e) => setNewTerm(e.target.value)} placeholder="e.g. Net 30" style={{ width: 180 }} />
            <button className="btn xs" onClick={async () => {
              if (!newTerm.trim()) return;
              try { await api.createPaymentTerm({ label: newTerm.trim() }); setNewTerm(''); await loadTerms(); flash('Term added'); }
              catch (e) { flash(e.message, 'err'); }
            }}>+ Add</button>
          </div>
        </div>
        <p className="subtle" style={{ fontSize: 12 }}>These appear as a dropdown when creating invoices. Toggle active/inactive to show or hide without deleting.</p>
        {terms.length === 0 ? <p className="subtle">No payment terms yet.</p> : (
          <table className="data-table">
            <thead><tr><th>Label</th><th>Active</th><th className="r">Actions</th></tr></thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t.id}>
                  <td className="strong">{t.label}</td>
                  <td>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={t.active} onChange={async (e) => {
                        try { await api.updatePaymentTerm(t.id, { active: e.target.checked }); await loadTerms(); }
                        catch (err) { flash(err.message, 'err'); }
                      }} />
                      {t.active ? 'Active' : 'Inactive'}
                    </label>
                  </td>
                  <td className="r">
                    <button className="btn xs danger" onClick={async () => {
                      if (!confirm(`Delete "${t.label}"?`)) return;
                      try { await api.deletePaymentTerm(t.id); await loadTerms(); flash('Deleted'); }
                      catch (e) { flash(e.message, 'err'); }
                    }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
