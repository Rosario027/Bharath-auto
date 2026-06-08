import { useEffect, useState } from 'react';
import { api, setAuth } from '../api.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';        // 12 AM – 11:59 AM
  if (h < 16) return 'Good afternoon';       // 12 PM – 3:59 PM
  return 'Good evening';                      // 4 PM – 11:59 PM
}

function MeditationArt() {
  return (
    <svg className="med-svg" viewBox="0 0 420 380" role="img" aria-label="Person meditating">
      <g className="med-aura" fill="none" stroke="#7DC04E" strokeWidth="3.5" strokeLinecap="round">
        <path d="M250 120 q70 -30 120 20" opacity=".7" />
        <path d="M170 120 q-70 -30 -120 20" opacity=".7" />
        <path d="M120 150 Q210 30 300 150" opacity=".45" />
        <path d="M95 180 Q210 15 325 180" opacity=".3" />
      </g>
      <circle cx="210" cy="150" r="120" fill="#Dff0d0" opacity=".5" />
      <g className="med-figure">
        <ellipse cx="210" cy="322" rx="120" ry="26" fill="#cfe8bd" stroke="#1b1b1b" strokeWidth="3" />
        <path d="M120 322 q20 -20 45 -6 M300 322 q-20 -20 -45 -6" fill="none" stroke="#1b1b1b" strokeWidth="2.5" opacity=".6" />
        <path d="M120 312 Q150 270 210 272 Q270 270 300 312 Q255 332 210 330 Q165 332 120 312 Z" fill="#eef7e4" stroke="#1b1b1b" strokeWidth="3" />
        <path d="M180 300 q30 -16 60 0" fill="none" stroke="#1b1b1b" strokeWidth="2.5" />
        <path d="M163 300 Q150 210 210 196 Q270 210 257 300 Z" fill="#7DC04E" stroke="#1b1b1b" strokeWidth="3" />
        <path d="M210 238 c-6 -10 -22 -6 -22 6 c0 10 14 18 22 24 c8 -6 22 -14 22 -24 c0 -12 -16 -16 -22 -6 z" fill="#fff" opacity=".9" />
        <path d="M168 250 Q130 286 152 306" fill="none" stroke="#1b1b1b" strokeWidth="3" />
        <path d="M252 250 Q290 286 268 306" fill="none" stroke="#1b1b1b" strokeWidth="3" />
        <circle cx="150" cy="306" r="11" fill="#F3D9C0" stroke="#1b1b1b" strokeWidth="2.5" />
        <circle cx="270" cy="306" r="11" fill="#F3D9C0" stroke="#1b1b1b" strokeWidth="2.5" />
        <rect x="200" y="180" width="20" height="22" rx="8" fill="#F3D9C0" stroke="#1b1b1b" strokeWidth="3" />
        <circle cx="210" cy="158" r="34" fill="#F3D9C0" stroke="#1b1b1b" strokeWidth="3" />
        <path d="M178 156 Q176 120 210 118 Q244 120 242 156 Q236 138 210 136 Q184 138 178 156 Z" fill="#1b1b1b" />
        <circle cx="210" cy="116" r="9" fill="#1b1b1b" />
        <path d="M196 158 q6 6 12 0 M212 158 q6 6 12 0" fill="none" stroke="#1b1b1b" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M201 172 q9 7 18 0" fill="none" stroke="#1b1b1b" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g className="leaf leaf1" fill="#7DC04E"><path d="M60 110 q14 -10 26 2 q-14 10 -26 -2 z" /></g>
      <g className="leaf leaf2" fill="#cfe8bd"><path d="M350 90 q14 -10 26 2 q-14 10 -26 -2 z" /></g>
      <g className="leaf leaf3" fill="#E8732B"><circle cx="70" cy="250" r="5" /></g>
      <g className="leaf leaf2" fill="#7DC04E"><circle cx="360" cy="240" r="6" /></g>
    </svg>
  );
}

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [content, setContent] = useState(null);

  useEffect(() => { api.getLoginContent().then(setContent).catch(() => {}); }, []);

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
    <div className="login3">
      {/* full-screen glow wallpaper */}
      <div className="login3-bg">
        <span className="glow glow-green" />
        <span className="glow glow-saffron" />
      </div>

      <div className="login3-logo">
        <img src="/logo-mark.svg" alt="" />
        <span className="l3-brand"><b>BHARATH</b><i>AUTOMATION</i></span>
      </div>

      <div className="login3-inner">
        {/* transparent glass card */}
        <form className="login3-card" onSubmit={submit}>
          <h1>{greeting()}</h1>
          <p className="l3-tag">Let’s get things done ✨</p>

          <label className="l2-field">
            <input value={username} autoFocus autoComplete="username" placeholder="User ID" onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="l2-field l2-pass">
            <input type={show ? 'text' : 'password'} value={password} autoComplete="current-password" placeholder="Password" onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="l2-eye" onClick={() => setShow((s) => !s)} aria-label="Toggle password">{show ? '🙈' : '👁'}</button>
          </label>

          {err && <div className="l2-err">{err}</div>}

          <button className="l3-btn" type="submit" disabled={busy || !username || !password}>
            {busy ? 'Signing in…' : 'Login'}
          </button>
        </form>

        {/* calm figure — to the right, clearly visible */}
        <div className="login3-art"><MeditationArt /></div>
      </div>

      {/* daily Thirukkural / static note at the bottom center */}
      {content && (content.showQuote || content.note) && (
        <div className="login3-quote">
          {content.showQuote && content.quote && (
            <>
              <div className="lq-heading">{content.heading || 'Thirukural of the day'}</div>
              <div className="lq-text">{content.quote.text.split('\n').map((ln, i) => <div key={i}>{ln}</div>)}</div>
              {content.quote.meaning && <div className="lq-meaning">{content.quote.meaning}</div>}
            </>
          )}
          {content.note && <div className="lq-note">{content.note}</div>}
        </div>
      )}
    </div>
  );
}
