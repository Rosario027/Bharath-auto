import { useState } from 'react';
import { api, setAuth } from '../api.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api.login(username, password);
      setAuth(r.token, r.user);
      onLogin(r.user);
    } catch (e2) {
      setErr(e2.message || 'Login failed');
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      {/* Decorative animated brand background */}
      <div className="login-bg">
        <span className="blob blob-saffron" />
        <span className="blob blob-green" />
        <span className="blob blob-dark" />
        <div className="login-grid" />
      </div>

      <div className="login-wrap">
        <div className="login-hero">
          <img src="/logo-mark.svg" alt="Bharath Automation" className="login-logo" />
          <div className="login-word">
            <span className="lw-1">BHARATH</span>
            <span className="lw-2">AUTOMATION</span>
          </div>
          <p className="login-tag">Sales • Service • Automation</p>
          <p className="login-sub">Smart GST invoicing — fast, branded, on any device.</p>
        </div>

        <form className="login-card" onSubmit={submit}>
          <h2>Welcome back</h2>
          <p className="login-card-sub">Sign in to the invoicing portal</p>

          <label className="login-field">
            <span>User ID</span>
            <input value={username} autoFocus autoComplete="username" placeholder="e.g. Admin" onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="login-field">
            <span>Password</span>
            <input type="password" value={password} autoComplete="current-password" placeholder="••••••••" onChange={(e) => setPassword(e.target.value)} />
          </label>

          {err && <div className="login-err">{err}</div>}

          <button className="login-btn" type="submit" disabled={busy || !username || !password}>
            {busy ? 'Signing in…' : 'Sign in →'}
          </button>

          <div className="login-foot">Bharath Automation · Invoicing v1.0</div>
        </form>
      </div>
    </div>
  );
}
