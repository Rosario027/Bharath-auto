import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';

export const VTYPE_LABELS = {
  sales: 'Sales', purchase: 'Purchase', payment: 'Payment', receipt: 'Receipt',
  contra: 'Contra', journal: 'Journal', 'credit-note': 'Credit Note', 'debit-note': 'Debit Note',
};
const fmtD = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };

// Day Book — every voucher across the books, filterable by type.
export default function Accounting() {
  const nav = useNavigate();
  const [vouchers, setVouchers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try { setVouchers(await api.accVouchers()); } catch (e) { flash(e.message, 'err'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setBusy('sync');
    try { const r = await api.accSyncInvoices(); await load(); flash(`Synced — ${r.posted} new document(s) posted from billing`); }
    catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };

  const remove = async (v) => {
    if (!confirm(`Delete voucher ${v.voucherNo}? (The MCA edit log is removed with it — for the demo only.)`)) return;
    try { await api.accDeleteVoucher(v.id); await load(); } catch (e) { flash(e.message, 'err'); }
  };

  const view = vouchers.filter((v) => filter === 'all' || v.vtype === filter);
  const totalDr = view.reduce((s, v) => s + (v.total || 0), 0);
  const count = (t) => vouchers.filter((v) => v.vtype === t).length;

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <h1>Accounting · Day Book</h1>
          <p className="subtle">Double-entry books — sales, purchases, payments, receipts, contra & journals. Invoices/CN/DN post here automatically.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy === 'sync'} onClick={sync}>{busy === 'sync' ? 'Syncing…' : '⟳ Sync from billing'}</button>
          <button className="btn primary" onClick={() => nav('/accounting/voucher/new')}>+ New Voucher</button>
        </div>
      </header>

      <div className="stat-row">
        <div className="stat-card"><div className="stat-label">Vouchers</div><div className="stat-value">{vouchers.length}</div></div>
        <div className="stat-card"><div className="stat-label">Shown Total (Dr)</div><div className="stat-value sm">₹ {formatINR(totalDr)}</div></div>
        <div className="stat-card"><div className="stat-label">Auto-posted from billing</div><div className="stat-value">{vouchers.filter((v) => v.sourceInvoiceId).length}</div></div>
      </div>

      <div className="toolbar" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className={`seg-toggle ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All ({vouchers.length})</button>
        {Object.entries(VTYPE_LABELS).map(([k, label]) => (
          <button key={k} className={`seg-toggle ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{label} ({count(k)})</button>
        ))}
      </div>

      <div className="card table-card">
        {loading ? <div className="empty">Loading…</div> : view.length === 0 ? (
          <div className="empty"><p>No vouchers here yet.</p><button className="btn primary" onClick={() => nav('/accounting/voucher/new')}>Pass your first entry</button></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Voucher</th><th>Date</th><th>Type</th><th>Particulars</th><th className="r">Amount</th><th>Ref</th><th className="r">Actions</th></tr></thead>
            <tbody>
              {view.map((v) => (
                <tr key={v.id} className="row-click" onClick={() => nav(`/accounting/voucher/${v.id}`)}>
                  <td className="mono">{v.voucherNo}{v.editCount > 0 && <span className="badge edited" title="Edited (see MCA audit log)">×{v.editCount}</span>}</td>
                  <td>{fmtD(v.date)}</td>
                  <td><span className={`badge vt-${v.vtype}`}>{VTYPE_LABELS[v.vtype]}</span>{v.sourceInvoiceId ? <span className="hint" title="Auto-posted from billing">auto</span> : null}</td>
                  <td style={{ maxWidth: 320 }}>
                    {v.lines.slice(0, 2).map((l, i) => (
                      <div key={i} style={{ fontSize: 12 }}>{l.debit > 0 ? 'Dr' : 'Cr'} {l.ledger?.name} — ₹{formatINR(l.debit || l.credit)}</div>
                    ))}
                    {v.lines.length > 2 && <div className="subtle" style={{ fontSize: 11 }}>+{v.lines.length - 2} more line(s)</div>}
                  </td>
                  <td className="r strong">₹ {formatINR(v.total)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{v.refNo || '—'}</td>
                  <td className="r" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button className="btn xs" onClick={() => nav(`/accounting/voucher/${v.id}`)}>Edit</button>
                      <button className="btn xs danger" onClick={() => remove(v)}>✕</button>
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
