import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, exporter } from '../api.js';
import { formatINR } from '../utils/money.js';
import { useSettings } from '../App.jsx';

function fmtDate(d) {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
}

export default function Dashboard() {
  const nav = useNavigate();
  const { settings } = useSettings();
  const [invoices, setInvoices] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async (query = '') => {
    setLoading(true);
    try {
      setInvoices(await api.listInvoices(query));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  const total = invoices.reduce((s, i) => s + (i.grandTotal || 0), 0);
  const sym = settings?.currencySymbol || '₹';

  const remove = async (inv) => {
    if (!confirm(`Delete invoice ${inv.invoiceNo}? This cannot be undone.`)) return;
    setBusy(inv.id);
    try {
      await api.deleteInvoice(inv.id);
      await load(q);
    } finally {
      setBusy(null);
    }
  };

  const download = async (inv, kind) => {
    setBusy(inv.id + kind);
    try {
      const full = await api.getInvoice(inv.id);
      if (kind === 'pdf') await exporter.pdf(full);
      else await exporter.docx(full);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="subtle">Create, manage and export invoices for {settings?.companyName}.</p>
        </div>
        <button className="btn primary" onClick={() => nav('/new')}>+ New Invoice</button>
      </header>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total Invoices</div>
          <div className="stat-value">{invoices.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Value</div>
          <div className="stat-value">{sym} {formatINR(total)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Next Invoice No</div>
          <div className="stat-value sm">{settings?.invoicePrefix}{String(settings?.nextInvoiceSeq).padStart(4, '0')}</div>
        </div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Search invoice no or customer…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card table-card">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="empty">
            <p>No invoices yet.</p>
            <button className="btn primary" onClick={() => nav('/new')}>Create your first invoice</button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice No</th><th>Date</th><th>Customer</th><th className="r">Amount</th><th>Status</th><th className="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="row-click" onClick={() => nav(`/invoice/${inv.id}`)}>
                  <td className="mono">{inv.invoiceNo}</td>
                  <td>{fmtDate(inv.invoiceDate)}</td>
                  <td>{inv.buyerName}</td>
                  <td className="r strong">{sym} {formatINR(inv.grandTotal)}</td>
                  <td><span className={`badge ${inv.status}`}>{inv.status}</span></td>
                  <td className="r" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button className="btn xs" disabled={busy === inv.id + 'pdf'} onClick={() => download(inv, 'pdf')}>PDF</button>
                      <button className="btn xs" disabled={busy === inv.id + 'docx'} onClick={() => download(inv, 'docx')}>Word</button>
                      <button className="btn xs danger" disabled={busy === inv.id} onClick={() => remove(inv)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
