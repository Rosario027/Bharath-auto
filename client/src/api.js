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
  clockIn: (lat, lng) => req('/me/clock-in', { method: 'POST', body: JSON.stringify({ lat, lng }) }),
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
  accCreateGroup: (data) => req('/accounting/groups', { method: 'POST', body: JSON.stringify(data) }),
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
  bankTxns: (status) => req(`/accounting/bank-txns${status ? `?status=${status}` : ''}`),
  categorizeTxn: (id, data) => req(`/accounting/bank-txns/${id}/categorize`, { method: 'POST', body: JSON.stringify(data) }),
  mapTxnToInvoice: (id, invoiceId) => req(`/accounting/bank-txns/${id}/map-invoice`, { method: 'POST', body: JSON.stringify({ invoiceId }) }),
  mapTxnToBill: (id, voucherId) => req(`/accounting/bank-txns/${id}/map-bill`, { method: 'POST', body: JSON.stringify({ voucherId }) }),
  openBills: () => req('/accounting/open-bills'),
  updateUser: (id, data) => req(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  myAttendanceDay: (date) => req(`/me/attendance/${date}`),
  myAttendanceRequests: () => req('/me/attendance-requests'),
  requestAttendance: (date, workSummary) => req('/me/attendance-requests', { method: 'POST', body: JSON.stringify({ date, workSummary }) }),
  adminAttendanceRequests: () => req('/staff-admin/attendance-requests'),
  decideAttendanceRequest: (id, status, adminComment) => req(`/staff-admin/attendance-requests/${id}`, { method: 'PUT', body: JSON.stringify({ status, adminComment }) }),
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

  // purchases + supplier register (under the accounting grant)
  listSuppliers: () => req('/purchases/suppliers'),
  createSupplier: (data) => req('/purchases/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplier: (id, data) => req(`/purchases/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSupplier: (id) => req(`/purchases/suppliers/${id}`, { method: 'DELETE' }),
  listPurchases: () => req('/purchases'),
  getPurchase: (id) => req(`/purchases/${id}`),
  createPurchase: (data) => req('/purchases', { method: 'POST', body: JSON.stringify(data) }),
  updatePurchase: (id, data) => req(`/purchases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePurchase: (id) => req(`/purchases/${id}`, { method: 'DELETE' }),

  // customers / clients
  listCustomers: () => req('/customers'),
  getCustomer: (id) => req(`/customers/${id}`),
  createCustomer: (data) => req('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id, data) => req(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomer: (id) => req(`/customers/${id}`, { method: 'DELETE' }),
  searchCustomers: (q) => req(`/customers/search?q=${encodeURIComponent(q)}`),
  getCustomerOutstanding: (id) => req(`/customers/${id}/outstanding`),

  // payment terms (BRD §1.3)
  listPaymentTerms: (params = '') => req(`/payment-terms${params}`),
  createPaymentTerm: (data) => req('/payment-terms', { method: 'POST', body: JSON.stringify(data) }),
  updatePaymentTerm: (id, data) => req(`/payment-terms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePaymentTerm: (id) => req(`/payment-terms/${id}`, { method: 'DELETE' }),

  // delivery challans (BRD §1.1)
  listDeliveryChallans: (params = '') => req(`/delivery-challans${params}`),
  getDeliveryChallan: (id) => req(`/delivery-challans/${id}`),
  createDeliveryChallan: (data) => req('/delivery-challans', { method: 'POST', body: JSON.stringify(data) }),
  updateDeliveryChallan: (id, data) => req(`/delivery-challans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // RMA (BRD §5.1)
  listRma: (params = '') => req(`/rma${params}`),
  getRma: (id) => req(`/rma/${id}`),
  createRma: (data) => req('/rma', { method: 'POST', body: JSON.stringify(data) }),
  updateRma: (id, data) => req(`/rma/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  resolveRma: (id, data) => req(`/rma/${id}/resolve`, { method: 'POST', body: JSON.stringify(data) }),

  // business assets (BRD §5.2)
  listBusinessAssets: (params = '') => req(`/business-assets${params}`),
  getBusinessAsset: (id) => req(`/business-assets/${id}`),
  getBusinessAssetHistory: (id) => req(`/business-assets/${id}/history`),
  createBusinessAsset: (data) => req('/business-assets', { method: 'POST', body: JSON.stringify(data) }),
  updateBusinessAsset: (id, data) => req(`/business-assets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  checkoutAsset: (id, data) => req(`/business-assets/${id}/checkout`, { method: 'POST', body: JSON.stringify(data) }),
  checkinAsset: (id, data) => req(`/business-assets/${id}/checkin`, { method: 'POST', body: JSON.stringify(data) }),

  // staff goals / career development (BRD §4.2)
  listGoals: (params = '') => req(`/staff-goals${params}`),
  getMyGoals: () => req('/staff-goals/my'),
  createGoal: (data) => req('/staff-goals', { method: 'POST', body: JSON.stringify(data) }),
  updateGoal: (id, data) => req(`/staff-goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGoal: (id) => req(`/staff-goals/${id}`, { method: 'DELETE' }),

  // feedback (BRD §4.3)
  submitFeedback: (data) => req('/feedback', { method: 'POST', body: JSON.stringify(data) }),
  listFeedback: (params = '') => req(`/feedback${params}`),
  markFeedbackRead: (id) => req(`/feedback/${id}/read`, { method: 'PUT' }),
  markAllFeedbackRead: () => req('/feedback/mark-all-read', { method: 'PUT' }),

  // task deadline requests (BRD §6.1)
  myDeadlineRequests: () => req('/me/task-deadline-requests'),
  requestDeadlineChange: (data) => req('/me/task-deadline-requests', { method: 'POST', body: JSON.stringify(data) }),
  adminDeadlineRequests: (params = '') => req(`/staff-admin/deadline-requests${params}`),
  decideDeadlineRequest: (id, data) => req(`/staff-admin/deadline-requests/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // salary slip (BRD §3.3)
  staffSalary: (employeeId, month) => req(`/staff-admin/salary/${employeeId}?month=${month}`),

  // employee extended (BRD §4.1)
  setEmployeePhoto: (id, dataUrl, type) => req(`/employees/${id}/photo`, { method: 'PUT', body: JSON.stringify({ dataUrl, type }) }),
  addInsuranceDoc: (id, dataUrl) => req(`/employees/${id}/insurance-docs`, { method: 'POST', body: JSON.stringify({ dataUrl }) }),
  removeInsuranceDoc: (id, idx) => req(`/employees/${id}/insurance-docs/${idx}`, { method: 'DELETE' }),
  addAcademicDoc: (id, dataUrl) => req(`/employees/${id}/academic-docs`, { method: 'POST', body: JSON.stringify({ dataUrl }) }),
  removeAcademicDoc: (id, idx) => req(`/employees/${id}/academic-docs/${idx}`, { method: 'DELETE' }),

  // geofence (BRD §3.2)
  geofenceZones: () => req('/staff-admin/geofence-zones'),
  createGeofenceZone: (data) => req('/staff-admin/geofence-zones', { method: 'POST', body: JSON.stringify(data) }),
  updateGeofenceZone: (id, data) => req(`/staff-admin/geofence-zones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGeofenceZone: (id) => req(`/staff-admin/geofence-zones/${id}`, { method: 'DELETE' }),

  // site visit with category support (BRD §2.1)
  listSiteVisitsByCategory: (category, status) => req(`/site-visits?visitCategory=${category}${status ? `&status=${status}` : ''}`),
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
  tripleCopyById: (id, name) => downloadGet(`/export/${id}/triple-copy`, name || `invoice-${id}-3copy.pdf`),
  salesReport: (from, to) => downloadGet(`/reports/sales?from=${from}&to=${to}`, 'GST-Sales.xlsx'),
  bankTemplate: () => downloadGet('/accounting/bank-template', 'Bank-Import-Template.xlsx'),
  ledgerStatementXlsx: (id, name) => downloadGet(`/accounting/ledgers/${id}/statement.xlsx`, name || 'Ledger.xlsx'),
  ledgerStatementPdf: (id, name) => downloadGet(`/accounting/ledgers/${id}/statement.pdf`, name || 'Ledger.pdf'),
  financialsXlsx: (params = '') => downloadGet(`/accounting/reports/financials.xlsx${params}`, 'Financials.xlsx'),
  fullBackup: () => downloadGet('/backup', 'Bharath-Backup.zip'),
  employeeReport: (month) => downloadGet(`/reports/employees?month=${month}`, 'Employee-Report.xlsx'),
  stockReport: (from, to) => downloadGet(`/reports/stock?from=${from}&to=${to}`, 'Stock-Report.xlsx'),
  salarySlip: (employeeId, month) => downloadGet(`/staff-admin/salary/${employeeId}/slip?month=${month}`, `SalarySlip-${employeeId}-${month}.pdf`),
};

export default api;
