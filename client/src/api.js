const API = '/api';

let authToken = '';
try { authToken = localStorage.getItem('token') || ''; } catch { /* ignore */ }

export function setAuth(token, user) {
  authToken = token || '';
  try {
    if (token) { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user || {})); }
    else { localStorage.removeItem('token'); localStorage.removeItem('user'); }
  } catch { /* ignore */ }
}

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}

function authHeaders(extra = {}) {
  return authToken ? { ...extra, Authorization: `Bearer ${authToken}` } : extra;
}

async function req(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    ...opts,
  });
  if (res.status === 401 && authToken) {
    // token expired/invalid — force re-login
    setAuth('');
    if (location.pathname !== '/login') location.assign('/login');
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const j = await res.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

export const api = {
  // auth
  login: (username, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  changePassword: (currentPassword, newPassword) => req('/auth/change-password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
  ping: () => req('/auth/ping', { method: 'POST' }),
  logout: () => req('/auth/logout', { method: 'POST' }),
  listSessions: () => req('/users/sessions'),

  // inventory (admin + accountant)
  listInventory: () => req('/inventory'),
  createInventory: (data) => req('/inventory', { method: 'POST', body: JSON.stringify(data) }),
  updateInventory: (id, data) => req(`/inventory/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInventory: (id) => req(`/inventory/${id}`, { method: 'DELETE' }),
  stockMovements: () => req('/inventory/movements'),

  // public login-screen content
  getLoginContent: () => req('/public/login-content'),

  // login quotes (admin)
  listLoginQuotes: () => req('/login-quotes'),
  createLoginQuote: (data) => req('/login-quotes', { method: 'POST', body: JSON.stringify(data) }),
  updateLoginQuote: (id, data) => req(`/login-quotes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLoginQuote: (id) => req(`/login-quotes/${id}`, { method: 'DELETE' }),

  // settings
  getSettings: () => req('/settings'),
  saveSettings: (data) => req('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // invoices
  listInvoices: (q = '') => req(`/invoices${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getInvoice: (id) => req(`/invoices/${id}`),
  nextNumber: (seriesId, docType) => req(`/invoices/next-number?${seriesId ? `seriesId=${seriesId}&` : ''}docType=${docType || 'invoice'}`),
  staffSalary: (employeeId, month) => req(`/staff-admin/salary/${employeeId}?month=${month}`),
  createInvoice: (data) => req('/invoices', { method: 'POST', body: JSON.stringify(data) }),
  updateInvoice: (id, data) => req(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInvoice: (id) => req(`/invoices/${id}`, { method: 'DELETE' }),

  // invoice series
  listSeries: () => req('/series'),
  createSeries: (data) => req('/series', { method: 'POST', body: JSON.stringify(data) }),
  updateSeries: (id, data) => req(`/series/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSeries: (id) => req(`/series/${id}`, { method: 'DELETE' }),

  // users (admin)
  listUsers: () => req('/users'),
  createUser: (data) => req('/users', { method: 'POST', body: JSON.stringify(data) }),
  resetUserPassword: (id, password) => req(`/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  deleteUser: (id) => req(`/users/${id}`, { method: 'DELETE' }),

  // employees / staff (admin)
  listEmployees: () => req('/employees'),
  getEmployee: (id) => req(`/employees/${id}`),
  createEmployee: (data) => req('/employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (id, data) => req(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmployee: (id) => req(`/employees/${id}`, { method: 'DELETE' }),
  getEmployeeDoc: (id, type) => req(`/employees/${id}/document/${type}`),
  setEmployeeDoc: (id, type, dataUrl) => req(`/employees/${id}/document/${type}`, { method: 'PUT', body: JSON.stringify({ dataUrl }) }),
  deleteEmployeeDoc: (id, type) => req(`/employees/${id}/document/${type}`, { method: 'DELETE' }),
  setAttendance: (id, present) => req(`/employees/${id}/attendance`, { method: 'PUT', body: JSON.stringify({ present }) }),
  createEmployeeLogin: (id, username, password) => req(`/employees/${id}/login`, { method: 'POST', body: JSON.stringify({ username, password }) }),

  // staff self-service (logged-in staff member, own data only)
  getMyProfile: () => req('/me/profile'),
  getMyAttendance: (month) => req(`/me/attendance${month ? `?month=${month}` : ''}`),
  clockIn: () => req('/me/clock-in', { method: 'POST' }),
  clockOut: (workSummary) => req('/me/clock-out', { method: 'POST', body: JSON.stringify({ workSummary }) }),
  markFullDay: (workSummary, date) => req('/me/full-day', { method: 'POST', body: JSON.stringify({ workSummary, date }) }),
  myLeaves: () => req('/me/leaves'),
  requestLeave: (data) => req('/me/leaves', { method: 'POST', body: JSON.stringify(data) }),
  myExpenses: () => req('/me/expenses'),
  claimExpense: (data) => req('/me/expenses', { method: 'POST', body: JSON.stringify(data) }),
  myExpenseReceipt: (id) => req(`/me/expenses/${id}/receipt`),
  myTasks: () => req('/me/tasks'),
  updateMyTask: (id, data) => req(`/me/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // site visits (staff: own; admin: all)
  listSiteVisits: (status) => req(`/site-visits${status ? `?status=${status}` : ''}`),
  getSiteVisit: (id) => req(`/site-visits/${id}`),
  createSiteVisit: (data) => req('/site-visits', { method: 'POST', body: JSON.stringify(data) }),
  updateSiteVisit: (id, data) => req(`/site-visits/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  assignSiteVisit: (id, employeeId) => req(`/site-visits/${id}`, { method: 'PUT', body: JSON.stringify({ assignEmployeeId: employeeId }) }),
  addSiteVisitUpdate: (id, data) => req(`/site-visits/${id}/updates`, { method: 'POST', body: JSON.stringify(data) }),
  deleteSiteVisit: (id) => req(`/site-visits/${id}`, { method: 'DELETE' }),

  // accounting (admin + accountant)
  accGroups: () => req('/accounting/groups'),
  accLedgers: () => req('/accounting/ledgers'),
  accCreateLedger: (data) => req('/accounting/ledgers', { method: 'POST', body: JSON.stringify(data) }),
  accUpdateLedger: (id, data) => req(`/accounting/ledgers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  accDeleteLedger: (id) => req(`/accounting/ledgers/${id}`, { method: 'DELETE' }),
  accLedgerStatement: (id) => req(`/accounting/ledgers/${id}/statement`),
  accVouchers: (params = '') => req(`/accounting/vouchers${params}`),
  accVoucher: (id) => req(`/accounting/vouchers/${id}`),
  accCreateVoucher: (data) => req('/accounting/vouchers', { method: 'POST', body: JSON.stringify(data) }),
  accUpdateVoucher: (id, data) => req(`/accounting/vouchers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  accDeleteVoucher: (id) => req(`/accounting/vouchers/${id}`, { method: 'DELETE' }),
  accSyncInvoices: () => req('/accounting/sync-invoices', { method: 'POST' }),
  accTrialBalance: (params = '') => req(`/accounting/reports/trial-balance${params}`),
  accPnl: (params = '') => req(`/accounting/reports/pnl${params}`),
  accBalanceSheet: (params = '') => req(`/accounting/reports/balance-sheet${params}`),
  accCashFlow: () => req('/accounting/reports/cash-flow'),
  accOverview: (params = '') => req(`/accounting/overview${params}`),
  accBankImport: (bankLedgerId, dataBase64) => req('/accounting/bank-import', { method: 'POST', body: JSON.stringify({ bankLedgerId, dataBase64 }) }),
  getOverview: () => req('/overview'),
  accAssets: () => req('/accounting/assets'),
  accCreateAsset: (data) => req('/accounting/assets', { method: 'POST', body: JSON.stringify(data) }),
  accUpdateAsset: (id, data) => req(`/accounting/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  accDeleteAsset: (id) => req(`/accounting/assets/${id}`, { method: 'DELETE' }),

  // staff admin (approvals, tasks, attendance visibility)
  staffSummary: () => req('/staff-admin/summary'),
  adminAttendance: (params = '') => req(`/staff-admin/attendance${params}`),
  adminLeaves: () => req('/staff-admin/leaves'),
  setLeaveStatus: (id, status, adminComment) => req(`/staff-admin/leaves/${id}`, { method: 'PUT', body: JSON.stringify({ status, adminComment }) }),
  adminExpenses: () => req('/staff-admin/expenses'),
  setExpenseStatus: (id, status, adminComment) => req(`/staff-admin/expenses/${id}`, { method: 'PUT', body: JSON.stringify({ status, adminComment }) }),
  adminExpenseReceipt: (id) => req(`/staff-admin/expenses/${id}/receipt`),
  adminTasks: () => req('/staff-admin/tasks'),
  assignTask: (data) => req('/staff-admin/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => req(`/staff-admin/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id) => req(`/staff-admin/tasks/${id}`, { method: 'DELETE' }),

  // customers / clients
  listCustomers: () => req('/customers'),
  getCustomer: (id) => req(`/customers/${id}`),
  createCustomer: (data) => req('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id, data) => req(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomer: (id) => req(`/customers/${id}`, { method: 'DELETE' }),
};

// File downloads (PDF / Word) — trigger a browser download from a blob.
async function downloadBlob(path, body, fallbackName) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const disp = res.headers.get('content-disposition') || '';
  const m = disp.match(/filename="(.+?)"/);
  const name = m ? m[1] : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadGet(path, fallbackName) {
  const res = await fetch(API + path, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const disp = res.headers.get('content-disposition') || '';
  const m = disp.match(/filename="(.+?)"/);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = m ? m[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const exporter = {
  pdf: (invoice) => downloadBlob('/export/pdf', invoice, `${invoice.invoiceNo || 'invoice'}.pdf`),
  docx: (invoice) => downloadBlob('/export/docx', invoice, `${invoice.invoiceNo || 'invoice'}.docx`),
  pdfById: (id, name) => downloadGet(`/export/${id}/pdf`, name || `invoice-${id}.pdf`),
  docxById: (id, name) => downloadGet(`/export/${id}/docx`, name || `invoice-${id}.docx`),
  salesReport: (from, to) => downloadGet(`/reports/sales?from=${from}&to=${to}`, 'GST-Sales.xlsx'),
  bankTemplate: () => downloadGet('/accounting/bank-template', 'Bank-Import-Template.xlsx'),
  ledgerStatementXlsx: (id, name) => downloadGet(`/accounting/ledgers/${id}/statement.xlsx`, name || 'Ledger.xlsx'),
  ledgerStatementPdf: (id, name) => downloadGet(`/accounting/ledgers/${id}/statement.pdf`, name || 'Ledger.pdf'),
  financialsXlsx: (params = '') => downloadGet(`/accounting/reports/financials.xlsx${params}`, 'Financials.xlsx'),
  employeeReport: (month) => downloadGet(`/reports/employees?month=${month}`, 'Employee-Report.xlsx'),
  stockReport: (from, to) => downloadGet(`/reports/stock?from=${from}&to=${to}`, 'Stock-Report.xlsx'),
};

export default api;
