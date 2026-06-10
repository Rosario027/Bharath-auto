import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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
import Inventory from './pages/Inventory.jsx';
import Reports from './pages/Reports.jsx';
import Overview from './pages/Overview.jsx';
import Accounting from './pages/Accounting.jsx';
import AccVoucherEntry from './pages/AccVoucherEntry.jsx';
import AccLedgers from './pages/AccLedgers.jsx';
import AccReports from './pages/AccReports.jsx';
import AccAssets from './pages/AccAssets.jsx';

// ── 60-min inactivity logout with a 30-second "continue?" warning ──
const IDLE_LIMIT_MS = 60 * 60 * 1000;
const WARN_BEFORE_MS = 30 * 1000;

function useIdleTimeout(active, onExpire) {
  const lastActivity = useRef(Date.now());
  const lastPing = useRef(Date.now());
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    if (!active) return;
    const bump = () => { lastActivity.current = Date.now(); };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const timer = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      // keep the server session alive while the user is active
      if (idle < 5 * 60 * 1000 && Date.now() - lastPing.current > 10 * 60 * 1000) {
        lastPing.current = Date.now();
        api.ping().catch(() => {});
      }
      if (idle >= IDLE_LIMIT_MS) {
        setWarning(false);
        onExpire();
      } else if (idle >= IDLE_LIMIT_MS - WARN_BEFORE_MS) {
        setWarning(true);
        setSecondsLeft(Math.max(0, Math.ceil((IDLE_LIMIT_MS - idle) / 1000)));
      } else {
        setWarning(false);
      }
    }, 1000);

    return () => { events.forEach((e) => window.removeEventListener(e, bump)); clearInterval(timer); };
  }, [active, onExpire]);

  const extend = () => {
    lastActivity.current = Date.now();
    lastPing.current = Date.now();
    setWarning(false);
    api.ping().catch(() => {});
  };
  return { warning, secondsLeft, extend };
}

const IconMonitor = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
);
const IconPhone = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
);

// ── Sidebar icons — crisp white strokes (emojis were too dim on the dark bar) ──
const NI = ({ children }) => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const IcHome = () => <NI><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></NI>;
const IcInvoice = () => <NI><path d="M7 2h10a1 1 0 0 1 1 1v19l-3-2-3 2-3-2-3 2V3a1 1 0 0 1 1-1z" /><path d="M9 7h6M9 11h6M9 15h4" /></NI>;
const IcBook = () => <NI><path d="M4 4a2 2 0 0 1 2-2h14v18H6a2 2 0 0 0-2 2V4z" /><path d="M20 16H6a2 2 0 0 0-2 2" /><path d="M9 6h7M9 9.5h7" /></NI>;
const IcUsers = () => <NI><circle cx="9" cy="8" r="3.4" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5S14.9 16.4 15.5 20" /><circle cx="17.5" cy="9.5" r="2.6" /><path d="M16 14.7c2.9.2 4.9 1.9 5.5 4.8" /></NI>;
const IcStaff = () => <NI><circle cx="12" cy="7" r="3.5" /><path d="M5 21c.7-4.2 3.6-6.5 7-6.5s6.3 2.3 7 6.5" /><path d="M9 14.8 12 18l3-3.2" /></NI>;
const IcPin = () => <NI><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.6" /></NI>;
const IcBox = () => <NI><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></NI>;
const IcChart = () => <NI><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5M12 16V8M16 16v-3M20 16V6" /></NI>;
const IcUser = () => <NI><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20.5c.8-4.3 3.9-6.5 7.5-6.5s6.7 2.2 7.5 6.5" /></NI>;
const IcGear = () => <NI><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" /></NI>;

const SettingsContext = createContext(null);
export const useSettings = () => useContext(SettingsContext);
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function TopBar({ onHamburger, view, setView, isMobile, user, onLogout, onBrand }) {
  return (
    <header className="topbar">
      <button className="hamburger" onClick={onHamburger} aria-label="Toggle menu">☰</button>
      <button className="topbar-brand" onClick={onBrand} title="Dashboard">
        <img src="/logo-mark.svg" alt="logo" />
        <div className="topbar-names">
          <span className="brand-name">BHARATH</span>
          <span className="brand-sub">AUTOMATION</span>
        </div>
      </button>
      <div className="topbar-spacer" />
      <div className="view-toggle" role="group" aria-label="Layout">
        <button className={`vt ${!isMobile ? 'on' : ''}`} onClick={() => setView('web')} title="Desktop view" aria-label="Desktop view"><IconMonitor /></button>
        <button className={`vt ${isMobile ? 'on' : ''}`} onClick={() => setView('mobile')} title="Mobile view" aria-label="Mobile view"><IconPhone /></button>
      </div>
      <div className="topbar-user">
        <span className={`user-chip role-${user.role}`}>{user.username} · {user.role === 'user' ? 'accountant' : user.role}</span>
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
  const [accOpen, setAccOpen] = useState(false);

  return (
    <aside className="sidebar open">
      <nav>
        {isAdmin && (
          <NavLink to="/overview" onClick={onNavigate} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <span className="nav-icon"><IcHome /></span>
            <span className="nav-label">Dashboard</span>
          </NavLink>
        )}
        {isStaff && (
          <NavLink to="/me" onClick={onNavigate} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <span className="nav-icon"><IcHome /></span>
            <span className="nav-label">My Workspace</span>
          </NavLink>
        )}
        {isStaff && (
          <NavLink to="/my-visits" onClick={onNavigate} className={() => 'nav-item' + (loc.pathname.startsWith('/my-visits') || loc.pathname.startsWith('/site-visits') ? ' active' : '')}>
            <span className="nav-icon"><IcPin /></span>
            <span className="nav-label">Site Visits</span>
          </NavLink>
        )}

        <div className="nav-group">
          <button
            className={`nav-item group-head ${invoiceActive ? 'active' : ''}`}
            onClick={() => { setInvoiceOpen((v) => !v); nav(isStaff ? '/invoices' : '/'); }}
          >
            <span className="nav-icon"><IcInvoice /></span>
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
            <span className="nav-icon"><IcUsers /></span>
            <span className="nav-label">Clients</span>
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/site-visits" onClick={onNavigate} className={() => 'nav-item' + (loc.pathname.startsWith('/site-visits') ? ' active' : '')}>
            <span className="nav-icon"><IcPin /></span>
            <span className="nav-label">Site Visits</span>
          </NavLink>
        )}
        {isAdmin && (
          <div className="nav-group">
            <button
              className={`nav-item group-head ${staffActive ? 'active' : ''}`}
              onClick={() => { setStaffOpen((v) => !v); nav('/staff'); }}
            >
              <span className="nav-icon"><IcStaff /></span>
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
        <div className="nav-group">
          <button
            className={`nav-item group-head ${loc.pathname.startsWith('/accounting') ? 'active' : ''}`}
            onClick={() => { setAccOpen((v) => !v); nav('/accounting'); }}
          >
            <span className="nav-icon"><IcBook /></span>
            <span className="nav-label">Accounting</span>
            <span className={`caret ${accOpen ? 'down' : ''}`}>▾</span>
          </button>
          {accOpen && (
            <div className="nav-sub">
              {sub('/accounting', 'Day Book', true)}
              {sub('/accounting/voucher/new', 'Voucher Entry')}
              {sub('/accounting/ledgers', 'Ledgers')}
              {sub('/accounting/reports', 'Statements')}
              {sub('/accounting/assets', 'Fixed Assets')}
            </div>
          )}
        </div>

        <NavLink to="/inventory" onClick={onNavigate} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <span className="nav-icon"><IcBox /></span>
          <span className="nav-label">Inventory</span>
        </NavLink>
        <NavLink to="/reports" onClick={onNavigate} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <span className="nav-icon"><IcChart /></span>
          <span className="nav-label">Reports</span>
        </NavLink>
        <NavLink to="/account" onClick={onNavigate} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <span className="nav-icon"><IcUser /></span>
          <span className="nav-label">My Account</span>
        </NavLink>
      </nav>
      <div className="sidebar-foot">
        {isAdmin && (
          <NavLink to="/app-settings" onClick={onNavigate} className={({ isActive }) => 'nav-item settings-item' + (isActive ? ' active' : '')}>
            <span className="nav-icon"><IcGear /></span>
            <span className="nav-label">Settings</span>
          </NavLink>
        )}
        <span className="ver">Bharath Automation · Invoicing v1.0</span>
      </div>
    </aside>
  );
}

export default function App() {
  const navTo = useNavigate();
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

  const logout = useCallback(() => {
    api.logout().catch(() => {});
    setAuth('');
    setUser(null);
    setSettings(null);
  }, []);

  const { warning, secondsLeft, extend } = useIdleTimeout(!!user, logout);

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
          {warning && (
            <div className="idle-overlay">
              <div className="idle-modal">
                <h2>⏰ Still there?</h2>
                <p>You'll be logged out in <b>{secondsLeft}</b> second{secondsLeft === 1 ? '' : 's'} due to inactivity.</p>
                <p className="subtle">Do you want to continue your session?</p>
                <div className="idle-actions">
                  <button className="btn primary" onClick={extend}>Yes, keep me signed in</button>
                  <button className="btn" onClick={logout}>Logout now</button>
                </div>
              </div>
            </div>
          )}
          <TopBar onHamburger={() => setSidebarOpen((v) => !v)} view={view} setView={setView} isMobile={isMobile} user={user} onLogout={logout}
            onBrand={() => navTo(isAdmin ? '/overview' : isStaff ? '/me' : '/')} />
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
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/overview" element={<AdminOnly><Overview /></AdminOnly>} />
                <Route path="/accounting" element={<Accounting />} />
                <Route path="/accounting/voucher/new" element={<AccVoucherEntry key="new" />} />
                <Route path="/accounting/voucher/:id" element={<AccVoucherEntry />} />
                <Route path="/accounting/ledgers" element={<AccLedgers />} />
                <Route path="/accounting/reports" element={<AccReports />} />
                <Route path="/accounting/assets" element={<AccAssets />} />
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
