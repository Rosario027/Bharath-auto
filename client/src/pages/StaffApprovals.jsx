import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';

const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };

export default function StaffApprovals() {
  const nav = useNavigate();
  const [leaves, setLeaves] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    try {
      const [l, x] = await Promise.all([api.adminLeaves(), api.adminExpenses()]);
      setLeaves(l); setExpenses(x);
    } catch (e) { flash(e.message, 'err'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const decideLeave = async (l, status) => {
    const comment = prompt(`${status === 'approved' ? 'Approve' : 'Reject'} ${l.employee?.name}'s leave — optional comment:`, '') ?? '';
    setBusy(`l${l.id}`);
    try { await api.setLeaveStatus(l.id, status, comment); await load(); flash(`Leave ${status}`); }
    catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };

  const decideExpense = async (x, status) => {
    const comment = prompt(`${status === 'approved' ? 'Approve' : 'Reject'} ₹${x.amount} claim — optional comment:`, '') ?? '';
    setBusy(`x${x.id}`);
    try { await api.setExpenseStatus(x.id, status, comment); await load(); flash(`Claim ${status}`); }
    catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };

  const viewReceipt = async (x) => {
    try {
      const { dataUrl } = await api.adminExpenseReceipt(x.id);
      if (!dataUrl) return flash('No receipt attached', 'err');
      const w = window.open();
      w.document.write(`<title>Receipt — ${x.employee?.name}</title><img src="${dataUrl}" style="max-width:100%">`);
    } catch (e) { flash(e.message, 'err'); }
  };

  const pendingL = leaves.filter((l) => l.status === 'pending').length;
  const pendingX = expenses.filter((x) => x.status === 'pending').length;

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <button className="btn ghost" onClick={() => nav('/staff')}>&larr; Staff</button>
          <h1 style={{ marginTop: 6 }}>Approvals</h1>
          <p className="subtle">{pendingL} leave request(s) and {pendingX} expense claim(s) waiting.</p>
        </div>
      </header>

      <section className="fsec">
        <h3>Leave Requests</h3>
        {leaves.length === 0 ? <p className="subtle">No leave requests yet.</p> : (
          <table className="data-table">
            <thead><tr><th>Staff</th><th>From → To</th><th>Reason</th><th>Status</th><th className="r">Decision</th></tr></thead>
            <tbody>
              {leaves.map((l) => (
                <tr key={l.id}>
                  <td className="strong">{l.employee?.name}</td>
                  <td>{fmtDate(l.fromDate)} → {fmtDate(l.toDate)}</td>
                  <td style={{ maxWidth: 280 }}>{l.reason}{l.adminComment && <div className="subtle" style={{ fontSize: 12 }}>You: {l.adminComment}</div>}</td>
                  <td><span className={`badge rq-${l.status}`}>{l.status}</span></td>
                  <td className="r">
                    {l.status === 'pending' ? (
                      <div className="row-actions">
                        <button className="btn xs" disabled={busy === `l${l.id}`} onClick={() => decideLeave(l, 'approved')}>✓ Approve</button>
                        <button className="btn xs danger" disabled={busy === `l${l.id}`} onClick={() => decideLeave(l, 'rejected')}>✕ Reject</button>
                      </div>
                    ) : <span className="subtle" style={{ fontSize: 12 }}>decided</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="fsec">
        <h3>Expense Claims</h3>
        {expenses.length === 0 ? <p className="subtle">No expense claims yet.</p> : (
          <table className="data-table">
            <thead><tr><th>Staff</th><th>Date</th><th>Category</th><th className="r">Amount</th><th>Details</th><th>Status</th><th className="r">Decision</th></tr></thead>
            <tbody>
              {expenses.map((x) => (
                <tr key={x.id}>
                  <td className="strong">{x.employee?.name}</td>
                  <td>{fmtDate(x.date)}</td>
                  <td>{x.category}</td>
                  <td className="r strong">₹ {formatINR(x.amount)}</td>
                  <td style={{ maxWidth: 260 }}>
                    {x.description}
                    {x.hasReceipt && <button className="btn xs" style={{ marginLeft: 6 }} onClick={() => viewReceipt(x)}>📎 Receipt</button>}
                    {x.adminComment && <div className="subtle" style={{ fontSize: 12 }}>You: {x.adminComment}</div>}
                  </td>
                  <td><span className={`badge rq-${x.status}`}>{x.status}</span></td>
                  <td className="r">
                    {x.status === 'pending' ? (
                      <div className="row-actions">
                        <button className="btn xs" disabled={busy === `x${x.id}`} onClick={() => decideExpense(x, 'approved')}>✓</button>
                        <button className="btn xs danger" disabled={busy === `x${x.id}`} onClick={() => decideExpense(x, 'rejected')}>✕</button>
                      </div>
                    ) : <span className="subtle" style={{ fontSize: 12 }}>decided</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
