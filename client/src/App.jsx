import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { api, setAuth, getStoredUser } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import InvoiceEditor from './pages/InvoiceEditor.jsx';
import Settings from './pages/Settings.jsx';
import Clients from './pages/Clients.jsx';
import ClientDetail from './pages/ClientDetail.jsx';
import Login from './pages/Login.jsx';
import Staff from './pages/Staff.jsx';
import EmployeeEdit from './pages/EmployeeEdit.jsx';
import AppSettings from './pages/AppSettings.jsx';
import AccountSettings from './pages/AccountSettings.jsx';
import StaffHome from './pages/StaffHome.jsx';
import StaffTasksAdmin from './pages/StaffTasksAdmin.jsx';
import StaffApprovals from './pages/StaffApprovals.jsx';
import SiteVisits from './pages/SiteVisits.jsx';
import SiteVisitNew from './pages/SiteVisitNew.jsx';
import SiteVisitDetail from './pages/SiteVisitDetail.jsx';

const IconMonitor = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
);
const IconPhone = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
);

const SettingsContext = createContext(null);
export const useSettings = () => useContext(SettingsContext);
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function TopBar({ onHamburger, view, setView, isMobile, user, onLogout }) {
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
        <button className={`vt ${!isMobile ? 'on' : ''}`} onClick={() => setView('web')} title="Desktop view" aria-label="Desktop view"><IconMonitor /></button>
        <button className={`vt ${isMobile ? 'on' : ''}`} onClick={() => setView('mobile')} title="Mobile view" aria-label="Mobile view"><IconPhone /></button>
      </div>
      <div className="topbar-user">
        <span className={`user-chip role-${user.role}`}>{user.username} · {user.role}</span>
        <button className="btn xs ghost-light" onClick={onLogout}>Logout</button>
      </div>
    </header>
  );
}

function Sidebar({ onNavigate, isAdmin, isStaff }) {
  const nav = useNavigate();
  const loc = useLocation();
  const invoiceActive = ['/', '/new', '/settings', '/invoices'].includes(loc.pathname) || loc.pathname.startsWith('/invoice');
  const [invoiceOpen, setInvoiceOpen] = useState(!isStaff);

  const sub = (to, label, end) => (
    <NavLink to={to} end={end} onClick={onNavigate} className={({ isActive }) => 'nav-sub-item' + (isActive ? ' active' : '')}>
      {label}
    </NavLink>
  );

  const staffActive = loc.pathname.startsWith('/staff');
  const [staffOpen, setStaffOpen] = useState(false);

  return (
    <aside className="sidebar open">
      <nav>
        {isStaff && (
          <NavLink to="/me" onClick={onNavigate} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <span className="nav-icon">🏠</span>
            <span className="nav-label">My Workspace</span>
          </NavLink>
        )}
        {isStaff && (
          <NavLink to="/my-visits" onClick={onNavigate} className={() => 'nav-item' + (loc.pathname.startsWith('/my-visits') || loc.pathname.startsWith('/site-visits') ? ' active' : '')}>
            <span className="nav-icon">📍</span>
            <span className="nav-label">Site Visits</span>
          </NavLink>
        )}

        <div className="nav-group">
          <button
            className={`nav-item group-head ${invoiceActive ? 'active' : ''}`}
            onClick={() => { setInvoiceOpen((v) => !v); nav(isStaff ? '/invoices' : '/'); }}
          >
            <span className="nav-icon">🧾</span>
            <span className="nav-label">Invoice</span>
            <span className={`caret ${invoiceOpen ? 'down' : ''}`}>▾</span>
          </button>
          {invoiceOpen && (
            <div className="nav-sub">
              {sub(isStaff ? '/invoices' : '/', 'Dashboard', true)}
              {sub('/new', 'New Invoice')}
              {isAdmin && sub('/settings', 'Invoice Settings')}
            </div>
          )}
        </div>

        {isAdmin && (
          <NavLink to="/clients" onClick={onNavigate} className={() => 'nav-item' + (loc.pathname.startsWith('/clients') ? ' active' : '')}>
            <span className="nav-icon">👥</span>
            <span className="nav-label">Clients</span>
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/site-visits" onClick={onNavigate} className={() => 'nav-item' + (loc.pathname.startsWith('/site-visits') ? ' active' : '')}>
            <span className="nav-icon">📍</span>
            <span className="nav-label">Site Visits</span>
          </NavLink>
        )}
        {isAdmin && (
          <div className="nav-group">
            <button
              className={`nav-item group-head ${staffActive ? 'active' : ''}`}
              onClick={() => { setStaffOpen((v) => !v); nav('/staff'); }}
            >
              <span className="nav-icon">🧑‍💼</span>
              <span className="nav-label">Staff</span>
              <span className={`caret ${staffOpen ? 'down' : ''}`}>▾</span>
            </button>
            {staffOpen && (
              <div className="nav-sub">
                {sub('/staff', 'Employees', true)}
                {sub('/staff-tasks', 'Tasks')}
                {sub('/staff-approvals', 'Approvals')}
              </div>
            )}
          </div>
        )}
        <NavLink to="/account" onClick={onNavigate} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <span className="nav-icon">👤</span>
          <span className="nav-label">My Account</span>
        </NavLink>
      </nav>
      <div className="sidebar-foot">
        {isAdmin && (
          <NavLink to="/app-settings" onClick={onNavigate} className={({ isActive }) => 'nav-item settings-item' + (isActive ? ' active' : '')}>
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">Settings</span>
          </NavLink>
        )}
        <span className="ver">Bharath Automation · Invoicing v1.0</span>
      </div>
    </aside>
  );
}

export default function App() {
  const [user, setUser] = useState(() => getStoredUser());
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
  useEffect(() => { if (user) refreshSettings(); }, [user, refreshSettings]);

  // Older sessions may not carry the employee link — resolve it once from the server.
  useEffect(() => {
    if (!user || user.role === 'admin' || user.employeeId !== undefined) return;
    api.getMyProfile()
      .then((p) => {
        const u = { ...user, employeeId: p.employee.id, employeeName: p.employee.name };
        setUser(u);
        try { localStorage.setItem('user', JSON.stringify(u)); } catch { /* ignore */ }
      })
      .catch(() => {
        const u = { ...user, employeeId: null };
        setUser(u);
        try { localStorage.setItem('user', JSON.stringify(u)); } catch { /* ignore */ }
      });
  }, [user]);

  const updateSettingsLocal = useCallback((patch) => setSettings((prev) => ({ ...prev, ...patch })), []);

  const logout = () => { setAuth(''); setUser(null); setSettings(null); };

  // Not signed in → show the login screen.
  if (!user) return <Login onLogin={(u) => { setUser(u); setLoading(true); }} />;

  if (loading) return <div className="app-loading">Loading Bharath Automation Invoicing…</div>;
  if (error) return <div className="app-loading error">Failed to load: {error} <button className="btn" onClick={logout} style={{ marginLeft: 12 }}>Sign out</button></div>;

  const isAdmin = user.role === 'admin';
  const isStaff = !isAdmin && !!user.employeeId;
  const closeOnMobile = () => { if (isMobile) setSidebarOpen(false); };
  const AdminOnly = ({ children }) => (isAdmin ? children : <Navigate to="/" replace />);

  return (
    <AuthContext.Provider value={{ user, isAdmin, isStaff, logout }}>
      <SettingsContext.Provider value={{ settings, setSettings, refreshSettings, updateSettingsLocal }}>
        <div className={`app-root ${isMobile ? 'is-mobile' : 'is-web'} ${sidebarOpen ? 'sb-open' : 'sb-closed'}`}>
          <TopBar onHamburger={() => setSidebarOpen((v) => !v)} view={view} setView={setView} isMobile={isMobile} user={user} onLogout={logout} />
          <div className="app-body">
            {sidebarOpen && <Sidebar onNavigate={closeOnMobile} isAdmin={isAdmin} isStaff={isStaff} />}
            {isMobile && sidebarOpen && <div className="sb-backdrop" onClick={() => setSidebarOpen(false)} />}
            <main className="app-main">
              <Routes>
                <Route path="/" element={isStaff ? <Navigate to="/me" replace /> : <Dashboard />} />
                <Route path="/invoices" element={<Dashboard />} />
                <Route path="/me" element={isStaff ? <StaffHome /> : <Navigate to="/" replace />} />
                <Route path="/new" element={<InvoiceEditor key="new" />} />
                <Route path="/invoice/:id" element={<InvoiceEditor />} />
                <Route path="/settings" element={<AdminOnly><Settings /></AdminOnly>} />
                <Route path="/clients" element={<AdminOnly><Clients /></AdminOnly>} />
                <Route path="/clients/:id" element={<AdminOnly><ClientDetail /></AdminOnly>} />
                <Route path="/staff" element={<AdminOnly><Staff /></AdminOnly>} />
                <Route path="/staff/new" element={<AdminOnly><EmployeeEdit key="new" /></AdminOnly>} />
                <Route path="/staff/:id" element={<AdminOnly><EmployeeEdit /></AdminOnly>} />
                <Route path="/staff-tasks" element={<AdminOnly><StaffTasksAdmin /></AdminOnly>} />
                <Route path="/staff-approvals" element={<AdminOnly><StaffApprovals /></AdminOnly>} />
                <Route path="/site-visits" element={<SiteVisits />} />
                <Route path="/my-visits" element={<SiteVisits />} />
                <Route path="/site-visits/new" element={<SiteVisitNew />} />
                <Route path="/my-visits/new" element={<SiteVisitNew />} />
                <Route path="/site-visits/:id" element={<SiteVisitDetail />} />
                <Route path="/app-settings" element={<AdminOnly><AppSettings /></AdminOnly>} />
                <Route path="/account" element={<AccountSettings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </div>
      </SettingsContext.Provider>
    </AuthContext.Provider>
  );
}
