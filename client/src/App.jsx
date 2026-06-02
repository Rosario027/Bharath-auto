import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { api } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import InvoiceEditor from './pages/InvoiceEditor.jsx';
import Settings from './pages/Settings.jsx';

const SettingsContext = createContext(null);
export const useSettings = () => useContext(SettingsContext);

function Sidebar() {
  const loc = useLocation();
  const item = (to, label, icon, end) => (
    <NavLink to={to} end={end} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="/logo-mark.svg" alt="logo" />
        <div>
          <div className="brand-name">BHARATH</div>
          <div className="brand-sub">AUTOMATION</div>
        </div>
      </div>
      <nav>
        {item('/', 'Dashboard', '▤', true)}
        {item('/new', 'New Invoice', '＋')}
        {item('/settings', 'Settings', '⚙')}
      </nav>
      <div className="sidebar-foot">Invoicing v1.0</div>
    </aside>
  );
}

export default function App() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshSettings = useCallback(async () => {
    try {
      const s = await api.getSettings();
      setSettings(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshSettings(); }, [refreshSettings]);

  // Optimistic local update used by the Settings live-preview.
  const updateSettingsLocal = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  if (loading) {
    return <div className="app-loading">Loading Bharath Automation Invoicing…</div>;
  }
  if (error) {
    return <div className="app-loading error">Failed to load: {error}</div>;
  }

  return (
    <SettingsContext.Provider value={{ settings, setSettings, refreshSettings, updateSettingsLocal }}>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<InvoiceEditor key="new" />} />
            <Route path="/invoice/:id" element={<InvoiceEditor />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </SettingsContext.Provider>
  );
}
