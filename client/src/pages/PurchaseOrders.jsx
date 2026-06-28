import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';

const fmtD = (s) => { if (!s) return '—'; const d = new Date(s); if (isNaN(d)) return '—'; return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
const STATUS_LABELS = { open: 'Open', invoiced: 'Invoiced', closed: 'Closed', cancelled: 'Cancelled' };

// Purchase Orders — a document type inside the billing module. POs are
// commitments: they hold no books entry and move no stock until converted
// into a tax invoice (open → invoiced), or are closed / cancelled.
export default function PurchaseOrders() {
  const nav = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState('');
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await api.listInvoices();
      setOrders(all.filter((i) => i.docType === 'purchase-order' && i.status !== 'deleted'));
    } catch (e) { flash(e.message, 'err'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (po, status) => {
    if (status === 'cancelled' && !confirm(`Cancel purchase order ${po.invoiceNo}?`)) return;
    setBusy(`s${po.id}`);
    try { await api.setPoStatus(po.id, status); flash(`PO marked ${status}`); await load(); }
    catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };

  const convert = async (po) => {
    if (!confirm(`Convert ${po.invoiceNo} into a tax invoice? Stock will be deducted and it will post to the books.`)) return;
    setBusy(`c${po.id}`);
    try { const inv = await api.convertPoToInvoice(po.id); flash(`Invoice ${inv.invoiceNo} created`); nav(`/invoice/${inv.id}`); }
    catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };

  const count = (s) => orders.filter((o) => o.poStatus === s).length;
  const view = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return orders.filter((o) =>
      (filter === 'all' || o.poStatus === filter) &&
      (!ql || (o.invoiceNo || '').toLowerCase().includes(ql) || (o.buyerName || '').toLowerCase().includes(ql) || (o.poRefNo || '').toLowerCase().includes(ql)));
  }, [orders, q, filter]);

  const openValue = orders.filter((o) => o.poStatus === 'open').reduce((s, o) => s + (o.grandTotal || 0), 0);

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <h1>Purchase Orders</h1>
          <p className="subtle">Customer orders with their own serial numbers. Convert an open PO into a tax invoice in one click.</p>
        </div>
        <button className="btn primary" onClick={() => nav('/purchase-orders/new')}>+ New Purchase Order</button>
      </header>

      <div className="stat-row">
        <div className="stat-card"><div className="stat-label">Total POs</div><div className="stat-value">{orders.length}</div></div>
        <div className="stat-card"><div className="stat-label">Open</div><div className="stat-value">{count('open')}</div></div>
        <div className="stat-card"><div className="stat-label">Invoiced</div><div className="stat-value">{count('invoiced')}</div></div>
        <div className="stat-card"><div className="stat-label">Open Order Value</div><div className="stat-value sm">₹ {formatINR(openValue)}</div></div>
      </div>

      <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="search" placeholder="Search PO no, customer, ref…" value={q} onChange={(e) => setQ(e.target.value)} />
        {['all', 'open', 'invoiced', 'closed', 'cancelled'].map((f) => (
          <button key={f} className={`seg-toggle ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? `All (${orders.length})` : `${STATUS_LABELS[f]} (${count(f)})`}
          </button>
        ))}
      </div>

      <div className="card table-card">
        {loading ? <div className="empty">Loading…</div> : view.length === 0 ? (
          <div className="empty">
            {orders.length === 0 ? (
              <>
                <p>No purchase orders yet.</p>
                <button className="btn primary" onClick={() => nav('/purchase-orders/new')}>Raise your first purchase order</button>
              </>
            ) : <p>No purchase orders match the current filters.</p>}
          </div>
        ) : (
          <table className="data-table">
            <thead><tr><th>PO No</th><th>Date</th><th>Customer</th><th>Expected</th><th className="r">Value</th><th>Status</th><th className="r">Actions</th></tr></thead>
            <tbody>
              {view.map((o) => (
                <tr key={o.id}>
                  <td className="mono row-click" onClick={() => nav(`/invoice/${o.id}`)}><b>{o.invoiceNo}</b></td>
                  <td>{fmtD(o.invoiceDate)}</td>
                  <td>{o.buyerName || '—'}</td>
                  <td>{fmtD(o.expectedDate)}</td>
                  <td className="r strong">₹ {formatINR(o.grandTotal)}</td>
                  <td>
                    <span className={`badge po-${o.poStatus}`}>{STATUS_LABELS[o.poStatus] || o.poStatus}</span>
                    {o.convertedToNo && <div className="subtle" style={{ fontSize: 11 }}>→ {o.convertedToNo}</div>}
                  </td>
                  <td className="r">
                    <div className="row-actions">
                      <button className="btn xs" onClick={() => nav(`/invoice/${o.id}`)}>Open</button>
                      {o.poStatus === 'open' && (
                        <>
                          <button className="btn xs primary" disabled={busy === `c${o.id}`} onClick={() => convert(o)}>{busy === `c${o.id}` ? '…' : 'Convert'}</button>
                          <button className="btn xs" disabled={busy === `s${o.id}`} onClick={() => setStatus(o, 'closed')}>Close</button>
                          <button className="btn xs danger" disabled={busy === `s${o.id}`} onClick={() => setStatus(o, 'cancelled')}>Cancel</button>
                        </>
                      )}
                      {o.poStatus === 'closed' && <button className="btn xs" disabled={busy === `s${o.id}`} onClick={() => setStatus(o, 'open')}>Reopen</button>}
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
