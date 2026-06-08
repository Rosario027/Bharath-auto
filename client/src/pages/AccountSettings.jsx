import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

export default function AccountSettings() {
  const { user } = useAuth();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [cf, setCf] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000); };

  const submit = async (e) => {
    e.preventDefault();
    if (nw !== cf) return flash('New passwords do not match', 'err');
    if (nw.length < 4) return flash('New password must be at least 4 characters', 'err');
    setBusy(true);
    try {
      await api.changePassword(cur, nw);
      setCur(''); setNw(''); setCf('');
      flash('Password updated');
    } catch (e2) { flash(e2.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div><h1>My Account</h1><p className="subtle">Signed in as <b>{user.username}</b> · {user.role}</p></div>
      </header>

      <section className="fsec" style={{ maxWidth: 480 }}>
        <h3>Change Password</h3>
        <form onSubmit={submit} className="grid2">
          <label className="full">Current Password<input type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></label>
          <label className="full">New Password<input type="password" value={nw} onChange={(e) => setNw(e.target.value)} /></label>
          <label className="full">Confirm New Password<input type="password" value={cf} onChange={(e) => setCf(e.target.value)} /></label>
          <div className="full"><button className="btn primary" type="submit" disabled={busy || !cur || !nw}>{busy ? 'Updating…' : 'Update password'}</button></div>
        </form>
      </section>
    </div>
  );
}
