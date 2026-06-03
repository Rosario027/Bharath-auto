const API = '/api';

async function req(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
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
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch(API + path);
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
