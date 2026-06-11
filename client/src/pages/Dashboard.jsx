import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, exporter } from '../api.js';
import { formatINR } from '../utils/money.js';
import { useSettings } from '../App.jsx';

function fmtDate(d) {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
}

// Payment-derived status — "draft" meant nothing to anyone. An invoice is
// cancelled (deleted), paid, partly paid or unpaid; CN/DN show their type.
function docStatus(inv) {
  if (inv.status === 'deleted') return { key: 'cancelled', label: 'cancelled' };
  if (inv.docType === 'credit-note') return { key: 'note', label: 'credit note' };
  if (inv.docType === 'debit-note') return { key: 'note', label: 'debit note' };
  const due = (inv.grandTotal || 0) - (inv.amountPaid || 0);
  if (due <= 0.5) return { key: 'paid', label: 'paid' };
  if ((inv.amountPaid || 0) > 0) return { key: 'partial', label: 'partly paid' };
  return { key: 'unpaid', label: 'unpaid' };
}

const STATUS_FILTERS = [
  ['all', 'All'], ['unpaid', 'Unpaid'], ['partial', 'Partly paid'], ['paid', 'Paid'], ['cancelled', 'Cancelled'],
];
const TYPE_FILTERS = [
  ['all', 'All types'], ['invoice', 'Invoices'], ['credit-note', 'Credit notes'], ['debit-note', 'Debit notes'],
];

export default function Dashboard() {
  const nav = useNavigate();
  const { settings } = useSettings();
  const [invoices, setInvoices] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [statusF, setStatusF] = useState('all');
  const [typeF, setTypeF] = useState('all');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });

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

  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const arrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');

  const view = useMemo(() => {
    const filtered = invoices.filter((inv) => {
      const st = docStatus(inv);
      if (statusF !== 'all' && st.key !== statusF) return false;
      if (typeF !== 'all' && inv.docType !== typeF) return false;
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (inv) => {
      switch (sort.key) {
        case 'no': return inv.invoiceNo || '';
        case 'customer': return (inv.buyerName || '').toLowerCase();
        case 'amount': return inv.grandTotal || 0;
        case 'status': return docStatus(inv).key;
        default: return new Date(inv.invoiceDate).getTime();
      }
    };
    return [...filtered].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * dir);
  }, [invoices, statusF, typeF, sort]);

  const active = invoices.filter((i) => i.status !== 'deleted');
  const total = active.reduce((s, i) => s + (i.grandTotal || 0), 0);
  const outstanding = active
    .filter((i) => i.docType === 'invoice')
    .reduce((s, i) => s + Math.max(0, (i.grandTotal || 0) - (i.amountPaid || 0)), 0);
  const sym = settings?.currencySymbol || '₹';
  const countStatus = (key) => invoices.filter((i) => docStatus(i).key === key).length;

  const remove = async (inv) => {
    if (!confirm(`Cancel invoice ${inv.invoiceNo}?\n\nIt stays in records greyed-out (and in the GST documents-issued summary); its number is never reused. Books & stock are reversed.`)) return;
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
          <h1>Invoices</h1>
          <p className="subtle">Create, manage and export invoices for {settings?.companyName}.</p>
        </div>
        <button className="btn primary" onClick={() => nav('/new')}>+ New Invoice</button>
      </header>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Active Documents</div>
          <div className="stat-value">{active.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Value</div>
          <div className="stat-value sm">{sym} {formatINR(total)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Outstanding (unpaid)</div>
          <div className="stat-value sm" style={outstanding > 0 ? { color: '#c0392b' } : {}}>{sym} {formatINR(outstanding)}</div>
        </div>
      </div>

      <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="search" placeholder="Search invoice no or customer…" value={q} onChange={(e) => setQ(e.target.value)} />
        {STATUS_FILTERS.map(([k, label]) => (
          <button key={k} className={`seg-toggle ${statusF === k ? 'on' : ''}`} onClick={() => setStatusF(k)}>
            {label}{k !== 'all' ? ` (${countStatus(k)})` : ` (${invoices.length})`}
          </button>
        ))}
        <select value={typeF} onChange={(e) => setTypeF(e.target.value)} style={{ width: 'auto', padding: '8px 10px' }}>
          {TYPE_FILTERS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>

      <div className="card table-card">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : view.length === 0 ? (
          <div className="empty">
            {invoices.length === 0 ? (
              <>
                <p>No invoices yet.</p>
                <button className="btn primary" onClick={() => nav('/new')}>Create your first invoice</button>
              </>
            ) : <p>No documents match the current filters.</p>}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => sortBy('no')}>Invoice No{arrow('no')}</th>
                <th className="sortable" onClick={() => sortBy('date')}>Date{arrow('date')}</th>
                <th className="sortable" onClick={() => sortBy('customer')}>Customer{arrow('customer')}</th>
                <th className="r sortable" onClick={() => sortBy('amount')}>Amount{arrow('amount')}</th>
                <th className="r">Balance Due</th>
                <th className="sortable" onClick={() => sortBy('status')}>Status{arrow('status')}</th>
                <th className="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              {view.map((inv) => {
                const deleted = inv.status === 'deleted';
                const st = docStatus(inv);
                const due = Math.max(0, (inv.grandTotal || 0) - (inv.amountPaid || 0));
                return (
                <tr key={inv.id} className={`row-click ${deleted ? 'row-deleted' : ''}`} onClick={() => nav(`/invoice/${inv.id}`)}>
                  <td className="mono">{inv.invoiceNo}</td>
                  <td>{fmtDate(inv.invoiceDate)}</td>
                  <td>{inv.buyerName}</td>
                  <td className="r strong">{sym} {formatINR(inv.grandTotal)}</td>
                  <td className="r">{deleted || inv.docType !== 'invoice' ? '—' : due > 0.5 ? `${sym} ${formatINR(due)}` : '✓'}</td>
                  <td>
                    <span className={`badge ${st.key}`}>{st.label}</span>
                    {inv.editCount > 0 && <span className="badge edited" title={`Edited ${inv.editCount} time(s)`}>edited{inv.editCount > 1 ? ` ×${inv.editCount}` : ''}</span>}
                  </td>
                  <td className="r" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      {!deleted && <button className="btn xs" onClick={() => nav(`/invoice/${inv.id}`)}>Edit</button>}
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
