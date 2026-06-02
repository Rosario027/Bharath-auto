import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { api } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import InvoiceEditor from './pages/InvoiceEditor.jsx';
import Settings from './pages/Settings.jsx';
import Clients from './pages/Clients.jsx';
import ClientDetail from './pages/ClientDetail.jsx';

const SettingsContext = createContext(null);
export const useSettings = () => useContext(SettingsContext);

function TopBar({ onHamburger, view, setView, isMobile }) {
  return (
    <header className="topbar">
      <button className="hamburger" onClick={onHamburger} aria-label="Toggle menu">☰</button>
      <div className="topbar-brand">
        <img src="/logo-mark.svg" alt="logo" />
        <div className="topbar-names">
          <span className="brand-name">BHARATH</span>
          <span className="brand-sub">AUTOMATION</span>
        </div>
      </div>
      <div className="topbar-spacer" />
      <div className="view-toggle" role="group" aria-label="Layout">
        <button className={`vt ${!isMobile ? 'on' : ''}`} onClick={() => setView('web')} title="Desktop layout">🖥</button>
        <button className={`vt ${isMobile ? 'on' : ''}`} onClick={() => setView('mobile')} title="Mobile layout">📱</button>
      </div>
    </header>
  );
}

function Sidebar({ open, onNavigate }) {
  const nav = useNavigate();
  const loc = useLocation();
  const invoiceActive = ['/', '/new', '/settings'].includes(loc.pathname);
  const [invoiceOpen, setInvoiceOpen] = useState(true);

  const sub = (to, label, end) => (
    <NavLink to={to} end={end} onClick={onNavigate} className={({ isActive }) => 'nav-sub-item' + (isActive ? ' active' : '')}>
      {label}
    </NavLink>
  );

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <nav>
        <div className="nav-group">
          <button
            className={`nav-item group-head ${invoiceActive ? 'active' : ''}`}
            onClick={() => { setInvoiceOpen((v) => !v); nav('/'); }}
          >
            <span className="nav-icon">🧾</span>
            <span className="nav-label">Invoice</span>
            <span className={`caret ${invoiceOpen ? 'down' : ''}`}>▾</span>
          </button>
          {invoiceOpen && (
            <div className="nav-sub">
              {sub('/', 'Dashboard', true)}
              {sub('/new', 'New Invoice')}
              {sub('/settings', 'Invoice Settings')}
            </div>
          )}
        </div>

        <NavLink to="/clients" onClick={onNavigate} className={({ isActive }) => 'nav-item' + (isActive || loc.pathname.startsWith('/clients') ? ' active' : '')}>
          <span className="nav-icon">👥</span>
          <span className="nav-label">Clients</span>
        </NavLink>
      </nav>
      <div className="sidebar-foot"><span className="ver">Bharath Automation · Invoicing v1.0</span></div>
    </aside>
  );
}

export default function App() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [view, setViewState] = useState(() => {
    try { return localStorage.getItem('viewMode') || 'auto'; } catch { return 'auto'; }
  });
  const [autoMobile, setAutoMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 900 : false));
  useEffect(() => {
    const onResize = () => setAutoMobile(window.innerWidth < 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isMobile = view === 'mobile' ? true : view === 'web' ? false : autoMobile;
  const setView = (v) => { setViewState(v); try { localStorage.setItem('viewMode', v); } catch { /* ignore */ } };

  // Sidebar open/collapsed. Default: open on desktop, collapsed on mobile.
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 900 : true));

  const refreshSettings = useCallback(async () => {
    try {
      setSettings(await api.getSettings());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { refreshSettings(); }, [refreshSettings]);

  const updateSettingsLocal = useCallback((patch) => setSettings((prev) => ({ ...prev, ...patch })), []);

  if (loading) return <div className="app-loading">Loading Bharath Automation Invoicing…</div>;
  if (error) return <div className="app-loading error">Failed to load: {error}</div>;

  const closeOnMobile = () => { if (isMobile) setSidebarOpen(false); };

  return (
    <SettingsContext.Provider value={{ settings, setSettings, refreshSettings, updateSettingsLocal }}>
      <div className={`app-root ${isMobile ? 'is-mobile' : 'is-web'} ${sidebarOpen ? 'sb-open' : 'sb-closed'}`}>
        <TopBar onHamburger={() => setSidebarOpen((v) => !v)} view={view} setView={setView} isMobile={isMobile} />
        <div className="app-body">
          <Sidebar open={sidebarOpen} onNavigate={closeOnMobile} />
          {isMobile && sidebarOpen && <div className="sb-backdrop" onClick={() => setSidebarOpen(false)} />}
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/new" element={<InvoiceEditor key="new" />} />
              <Route path="/invoice/:id" element={<InvoiceEditor />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/clients/:id" element={<ClientDetail />} />
            </Routes>
          </main>
        </div>
      </div>
    </SettingsContext.Provider>
  );
}
