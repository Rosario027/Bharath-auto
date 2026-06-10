import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, exporter } from '../api.js';
import { formatINR } from '../utils/money.js';
import { useSettings, useAuth } from '../App.jsx';

// Simple SVG pie for the task overview.
function TaskPie({ data }) {
  const entries = [
    { label: 'Yet to be taken', value: data.assigned, color: '#e8a13b' },
    { label: 'Processing', value: data.processing, color: '#4f8fd5' },
    { label: 'Completed', value: data.completed, color: '#5B9B36' },
  ];
  const total = entries.reduce((s, e) => s + e.value, 0);
  let acc = 0;
  const R = 15.9155;
  return (
    <div className="pie-wrap">
      <svg viewBox="0 0 42 42" className="pie">
        <circle cx="21" cy="21" r={R} fill="none" stroke="#eef1f5" strokeWidth="7" />
        {total > 0 && entries.map((e, i) => {
          const frac = e.value / total;
          const el = (
            <circle key={i} cx="21" cy="21" r={R} fill="none" stroke={e.color} strokeWidth="7"
              strokeDasharray={`${frac * 100} ${100 - frac * 100}`} strokeDashoffset={25 - acc * 100} />
          );
          acc += frac;
          return el;
        })}
        <text x="21" y="20" textAnchor="middle" fontSize="8" fontWeight="800" fill="#1f2530">{total}</text>
        <text x="21" y="27" textAnchor="middle" fontSize="3.4" fill="#7b8696">tasks</text>
      </svg>
      <div className="pie-legend">
        {entries.map((e, i) => (
          <div key={i}><span className="dot" style={{ background: e.color }} /> {e.label}: <b>{e.value}</b></div>
        ))}
        <div><span className="dot" style={{ background: '#98a2b3' }} /> Admin to-do: <b>{data.adminTodo}</b></div>
        <div><span className="dot" style={{ background: '#E8732B' }} /> Upcoming (due): <b>{data.upcoming}</b></div>
      </div>
    </div>
  );
}

function fmtDate(d) {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
}

export default function Dashboard() {
  const nav = useNavigate();
  const { settings } = useSettings();
  const { isAdmin } = useAuth();
  const [taskStats, setTaskStats] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [nextNo, setNextNo] = useState('');

  const load = useCallback(async (query = '') => {
    setLoading(true);
    try {
      setInvoices(await api.listInvoices(query));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.nextNumber().then((r) => setNextNo(r.invoiceNo)).catch(() => {}); }, [invoices]);
  useEffect(() => { if (isAdmin) api.staffSummary().then((s) => setTaskStats(s.tasks)).catch(() => {}); }, [isAdmin]);

  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  const active = invoices.filter((i) => i.status !== 'deleted');
  const total = active.reduce((s, i) => s + (i.grandTotal || 0), 0);
  const sym = settings?.currencySymbol || '₹';

  const remove = async (inv) => {
    if (!confirm(`Delete invoice ${inv.invoiceNo}?\n\nIt stays in records (greyed out) for the audit trail, and its number is never reused.`)) return;
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
          <div className="stat-label">Active Invoices</div>
          <div className="stat-value">{active.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Value</div>
          <div className="stat-value">{sym} {formatINR(total)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Next Invoice No</div>
          <div className="stat-value sm">{nextNo || '—'}</div>
        </div>
      </div>

      {isAdmin && taskStats && (
        <section className="fsec">
          <div className="fsec-head">
            <h3>Work Overview</h3>
            <button className="btn xs" onClick={() => nav('/staff-tasks')}>Open Tasks →</button>
          </div>
          <TaskPie data={taskStats} />
        </section>
      )}

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
              {invoices.map((inv) => {
                const deleted = inv.status === 'deleted';
                return (
                <tr key={inv.id} className={`row-click ${deleted ? 'row-deleted' : ''}`} onClick={() => nav(`/invoice/${inv.id}`)}>
                  <td className="mono">{inv.invoiceNo}</td>
                  <td>{fmtDate(inv.invoiceDate)}</td>
                  <td>{inv.buyerName}</td>
                  <td className="r strong">{sym} {formatINR(inv.grandTotal)}</td>
                  <td>
                    <span className={`badge ${inv.status}`}>{inv.status}</span>
                    {inv.editCount > 0 && <span className="badge edited" title={`Edited ${inv.editCount} time(s)`}>edited{inv.editCount > 1 ? ` ×${inv.editCount}` : ''}</span>}
                  </td>
                  <td className="r" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button className="btn xs" onClick={() => nav(`/invoice/${inv.id}`)}>Edit</button>
                      <button className="btn xs" disabled={busy === inv.id + 'pdf'} onClick={() => download(inv, 'pdf')}>PDF</button>
                      <button className="btn xs" disabled={busy === inv.id + 'docx'} onClick={() => download(inv, 'docx')}>Word</button>
                      {!deleted && <button className="btn xs danger" disabled={busy === inv.id} onClick={() => remove(inv)}>✕</button>}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
