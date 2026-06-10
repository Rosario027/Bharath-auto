import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';

const INR = (n) => `₹ ${formatINR(n)}`;

export default function AccReports() {
  const nav = useNavigate();
  const [tab, setTab] = useState('tb');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tb, setTb] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [bs, setBs] = useState(null);
  const [cf, setCf] = useState(null);
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000); };

  const qp = useCallback(() => {
    const p = [];
    if (from) p.push(`from=${from}`);
    if (to) p.push(`to=${to}`);
    return p.length ? `?${p.join('&')}` : '';
  }, [from, to]);

  const load = useCallback(async () => {
    try {
      const [a, b, c, d] = await Promise.all([api.accTrialBalance(qp()), api.accPnl(qp()), api.accBalanceSheet(qp()), api.accCashFlow()]);
      setTb(a); setPnl(b); setBs(c); setCf(d);
    } catch (e) { flash(e.message, 'err'); }
  }, [qp]);
  useEffect(() => { load(); }, [load]);

  const TabBtn = ({ k, label }) => <button className={`seg-toggle ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>;

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <button className="btn ghost" onClick={() => nav('/accounting')}>&larr; Day Book</button>
          <h1 style={{ marginTop: 6 }}>Financial Statements</h1>
          <p className="subtle">Live from the books — opening balances + all vouchers (auto-posted invoices included).</p>
        </div>
      </header>

      <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <TabBtn k="tb" label="Trial Balance" />
        <TabBtn k="pnl" label="Profit & Loss" />
        <TabBtn k="bs" label="Balance Sheet" />
        <TabBtn k="cf" label="Cash Flow" />
        <span style={{ flex: 1 }} />
        <label style={{ width: 150 }}>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label style={{ width: 150 }}>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      {tab === 'tb' && tb && (
        <div className="card table-card">
          <table className="data-table">
            <thead><tr><th>Ledger</th><th>Group</th><th className="r">Debit Balance</th><th className="r">Credit Balance</th></tr></thead>
            <tbody>
              {tb.rows.map((r) => (
                <tr key={r.id}>
                  <td className="strong">{r.name}</td><td className="subtle">{r.group}</td>
                  <td className="r">{r.drBalance ? INR(r.drBalance) : ''}</td>
                  <td className="r">{r.crBalance ? INR(r.crBalance) : ''}</td>
                </tr>
              ))}
              <tr className="acc-total">
                <td colSpan={2}><b>Total</b></td>
                <td className="r"><b>{INR(tb.totals.dr)}</b></td>
                <td className="r"><b>{INR(tb.totals.cr)}</b></td>
              </tr>
              <tr><td colSpan={4} style={{ textAlign: 'center' }} className={tb.totals.dr === tb.totals.cr ? 'tb-ok' : 'tb-bad'}>
                {tb.totals.dr === tb.totals.cr ? '✓ Trial balance tallies' : '✕ Difference exists — check entries'}
              </td></tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === 'pnl' && pnl && (
        <div className="staff-grid">
          <section className="fsec">
            <h3>Expenses (Dr)</h3>
            <table className="data-table">
              <tbody>
                {pnl.expense.map((r) => <tr key={r.id}><td>{r.name}<div className="subtle" style={{ fontSize: 11 }}>{r.group}</div></td><td className="r">{INR(r.amount)}</td></tr>)}
                {pnl.netProfit > 0 && <tr className="acc-total"><td><b>Net Profit c/d</b></td><td className="r"><b>{INR(pnl.netProfit)}</b></td></tr>}
                <tr className="acc-total"><td><b>Total</b></td><td className="r"><b>{INR(pnl.totalExpense + Math.max(0, pnl.netProfit))}</b></td></tr>
              </tbody>
            </table>
          </section>
          <section className="fsec">
            <h3>Income (Cr)</h3>
            <table className="data-table">
              <tbody>
                {pnl.income.map((r) => <tr key={r.id}><td>{r.name}<div className="subtle" style={{ fontSize: 11 }}>{r.group}</div></td><td className="r">{INR(r.amount)}</td></tr>)}
                {pnl.netProfit < 0 && <tr className="acc-total"><td><b>Net Loss c/d</b></td><td className="r"><b>{INR(-pnl.netProfit)}</b></td></tr>}
                <tr className="acc-total"><td><b>Total</b></td><td className="r"><b>{INR(pnl.totalIncome + Math.max(0, -pnl.netProfit))}</b></td></tr>
              </tbody>
            </table>
          </section>
          <section className="fsec" style={{ gridColumn: '1 / -1' }}>
            <div className={`pl-banner ${pnl.netProfit >= 0 ? 'ok' : 'bad'}`}>
              {pnl.netProfit >= 0 ? `Net Profit: ${INR(pnl.netProfit)}` : `Net Loss: ${INR(-pnl.netProfit)}`}
              <span className="subtle"> · Income {INR(pnl.totalIncome)} − Expenses {INR(pnl.totalExpense)}</span>
            </div>
          </section>
        </div>
      )}

      {tab === 'bs' && bs && (
        <div className="staff-grid">
          <section className="fsec">
            <h3>Liabilities & Capital</h3>
            <table className="data-table">
              <tbody>
                {bs.liabilities.map((r) => <tr key={r.id}><td>{r.name}<div className="subtle" style={{ fontSize: 11 }}>{r.group}</div></td><td className="r">{INR(r.amount)}</td></tr>)}
                <tr><td><b>{bs.netProfit >= 0 ? 'Net Profit (current period)' : 'Net Loss (current period)'}</b></td><td className="r">{INR(bs.netProfit)}</td></tr>
                <tr className="acc-total"><td><b>Total</b></td><td className="r"><b>{INR(bs.totalLiabilities)}</b></td></tr>
              </tbody>
            </table>
          </section>
          <section className="fsec">
            <h3>Assets</h3>
            <table className="data-table">
              <tbody>
                {bs.assets.map((r) => <tr key={r.id}><td>{r.name}<div className="subtle" style={{ fontSize: 11 }}>{r.group}</div></td><td className="r">{INR(r.amount)}</td></tr>)}
                <tr className="acc-total"><td><b>Total</b></td><td className="r"><b>{INR(bs.totalAssets)}</b></td></tr>
              </tbody>
            </table>
          </section>
          <section className="fsec" style={{ gridColumn: '1 / -1' }}>
            <div className={`pl-banner ${Math.abs(bs.totalAssets - bs.totalLiabilities) < 1 ? 'ok' : 'bad'}`}>
              {Math.abs(bs.totalAssets - bs.totalLiabilities) < 1 ? '✓ Balance sheet tallies' : `✕ Difference ${INR(Math.abs(bs.totalAssets - bs.totalLiabilities))}`}
            </div>
          </section>
        </div>
      )}

      {tab === 'cf' && cf && (
        <>
          <section className="fsec">
            <h3>Cash & Bank Flow <span className="hint">{cf.ledgers.join(' · ')}</span></h3>
            <table className="data-table">
              <thead><tr><th>Month</th><th className="r">Inflow</th><th className="r">Outflow</th><th className="r">Net</th></tr></thead>
              <tbody>
                {cf.rows.map((r) => (
                  <tr key={r.month}>
                    <td className="strong">{r.month}</td>
                    <td className="r" style={{ color: '#1f8f4e' }}>{INR(r.inflow)}</td>
                    <td className="r" style={{ color: '#c0392b' }}>{INR(r.outflow)}</td>
                    <td className="r strong">{INR(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="fsec">
            <h3>Recent Cash/Bank Entries</h3>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Voucher</th><th>Ledger</th><th className="r">In</th><th className="r">Out</th><th>Narration</th></tr></thead>
              <tbody>
                {cf.entries.slice().reverse().map((e, i) => (
                  <tr key={i}>
                    <td>{e.date}</td><td className="mono">{e.voucherNo}</td><td>{e.ledger}</td>
                    <td className="r">{e.in ? INR(e.in) : ''}</td><td className="r">{e.out ? INR(e.out) : ''}</td>
                    <td style={{ maxWidth: 260 }} className="subtle">{e.narration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
