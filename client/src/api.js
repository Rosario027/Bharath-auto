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
  nextNumber: (seriesId) => req(`/invoices/next-number${seriesId ? `?seriesId=${seriesId}` : ''}`),
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
};

export default api;
