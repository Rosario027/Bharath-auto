import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';

// Guided Accounting workflow — a stepwise hub modelled on the banking flow in
// Zoho Books / QuickBooks: import the statement, match & categorise every
// payment, record any manual vouchers, then review the books and pull reports.
// Each step shows live status so the user always knows what is left to do.
export default function AccWorkflow() {
  const nav = useNavigate();
  const [overview, setOverview] = useState(null);
  const [pending, setPending] = useState(0);
  const [txnTotal, setTxnTotal] = useState(0);
  const [vouchers, setVouchers] = useState(0);
  const [autoPosted, setAutoPosted] = useState(0);
  const [openBills, setOpenBills] = useState(0);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    const [ov, txAll, txPend, vs, ob] = await Promise.all([
      api.accOverview().catch(() => null),
      api.bankTxns().catch(() => []),
      api.bankTxns('pending').catch(() => []),
      api.accVouchers().catch(() => []),
      api.openBills().catch(() => []),
    ]);
    setOverview(ov);
    setTxnTotal(txAll.length);
    setPending(txPend.length);
    setVouchers(vs.length);
    setAutoPosted(vs.filter((v) => v.sourceInvoiceId).length);
    setOpenBills(ob.length);
  }, []);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setBusy('sync');
    try { const r = await api.accSyncInvoices(); flash(`Synced — ${r.posted} new document(s) posted from billing`); await load(); }
    catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };

  const steps = [
    {
      n: 1, title: 'Import Bank Statement', icon: '🏦',
      desc: 'Upload your bank statement (Excel). Every line becomes a transaction waiting to be matched or categorised.',
      status: txnTotal > 0 ? { text: `${txnTotal} imported`, tone: 'ok' } : { text: 'Nothing imported yet', tone: 'idle' },
      cta: 'Import statement', go: '/accounting/bank-recon',
    },
    {
      n: 2, title: 'Match & Categorise Payments', icon: '🔗',
      desc: 'Match money-in to unpaid invoices (AR), money-out to purchase bills (AP), or categorise to any ledger.',
      status: pending > 0 ? { text: `${pending} to categorise`, tone: 'warn' } : txnTotal > 0 ? { text: 'All reconciled ✓', tone: 'done' } : { text: 'Waiting on import', tone: 'idle' },
      cta: pending > 0 ? `Categorise ${pending}` : 'Open reconciliation', go: '/accounting/bank-recon',
    },
    {
      n: 3, title: 'Record Vouchers & Journals', icon: '✍️',
      desc: 'Pass any entry the bank feed does not cover — cash payments, journals, contra, opening balances.',
      status: { text: `${vouchers} voucher(s)`, tone: 'ok' },
      cta: '+ New voucher', go: '/accounting/voucher/new',
    },
    {
      n: 4, title: 'Purchases & Bills', icon: '🧾',
      desc: 'Record supplier bills and track what you owe. Open bills are settled automatically from the bank feed.',
      status: openBills > 0 ? { text: `${openBills} open bill(s)`, tone: 'warn' } : { text: 'No open bills', tone: 'done' },
      cta: 'Open purchases', go: '/accounting/purchases',
    },
    {
      n: 5, title: 'Review the Day Book', icon: '📖',
      desc: 'Every voucher across the books in one place — sales, purchases, payments, receipts, contra & journals.',
      status: { text: `${vouchers} entries`, tone: 'ok' },
      cta: 'Open Day Book', go: '/accounting/daybook',
    },
    {
      n: 6, title: 'Statements & Reports', icon: '📊',
      desc: 'Trial Balance, Profit & Loss, Balance Sheet and Cash Flow — plus the financials pack for filing.',
      status: { text: 'Always up to date', tone: 'ok' },
      cta: 'View statements', go: '/accounting/reports',
    },
  ];

  const done = steps.filter((s) => s.status.tone === 'done').length;
  const actionable = steps.filter((s) => s.status.tone === 'warn').length;

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <h1>Accounting</h1>
          <p className="subtle">Your books, step by step — import, match, record, review and report. Follow the flow top to bottom.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy === 'sync'} onClick={sync}>{busy === 'sync' ? 'Syncing…' : '⟳ Sync from billing'}</button>
          <button className="btn primary" onClick={() => nav('/accounting/voucher/new')}>+ New Voucher</button>
        </div>
      </header>

      {/* Live financial snapshot */}
      {overview && (
        <div className="acc-kpis">
          <button className="acc-kpi" onClick={() => nav('/accounting/reports')}><span>Income</span><b style={{ color: '#1f8f4e' }}>₹ {formatINR(overview.income)}</b></button>
          <button className="acc-kpi" onClick={() => nav('/accounting/reports')}><span>Expenses</span><b style={{ color: '#c0392b' }}>₹ {formatINR(overview.expense)}</b></button>
          <button className="acc-kpi" onClick={() => nav('/accounting/reports')}><span>{overview.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</span><b>₹ {formatINR(Math.abs(overview.netProfit))}</b></button>
          <button className="acc-kpi" onClick={() => nav('/accounting/ledgers')}><span>Cash & Bank</span><b>₹ {formatINR(overview.cashBank)}</b></button>
          <button className="acc-kpi" onClick={() => nav('/accounting/ledgers')}><span>Receivables</span><b>₹ {formatINR(overview.debtors)}</b></button>
          <button className="acc-kpi" onClick={() => nav('/accounting/ledgers')}><span>Payables</span><b>₹ {formatINR(overview.creditors)}</b></button>
        </div>
      )}

      {/* Progress banner */}
      <div className="wf-banner">
        <div>
          <b>{actionable > 0 ? `${actionable} step${actionable === 1 ? '' : 's'} need your attention` : 'Your books are up to date ✓'}</b>
          <span className="subtle"> · {autoPosted} document(s) auto-posted from billing</span>
        </div>
        {pending > 0 && (
          <button className="btn xs primary" onClick={() => nav('/accounting/bank-recon')}>Resolve {pending} pending →</button>
        )}
      </div>

      {/* The guided steps */}
      <div className="wf-steps">
        {steps.map((s) => (
          <div key={s.n} className={`wf-step tone-${s.status.tone}`} onClick={() => nav(s.go)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') nav(s.go); }}>
            <div className="wf-num">{s.n}</div>
            <div className="wf-body">
              <div className="wf-step-head">
                <h3>{s.icon} {s.title}</h3>
                <span className={`wf-badge ${s.status.tone}`}>{s.status.text}</span>
              </div>
              <p className="subtle">{s.desc}</p>
            </div>
            <button className="btn wf-cta" onClick={(e) => { e.stopPropagation(); nav(s.go); }}>{s.cta}</button>
          </div>
        ))}
      </div>

      {/* Setup / masters */}
      <section className="fsec">
        <h3>Setup &amp; Masters</h3>
        <div className="wf-setup">
          <button className="wf-chip" onClick={() => nav('/accounting/ledgers')}>📒 Chart of Accounts (Ledgers)</button>
          <button className="wf-chip" onClick={() => nav('/accounting/assets')}>🏗 Fixed Assets &amp; Depreciation</button>
          <button className="wf-chip" onClick={() => nav('/accounting/purchases')}>🚚 Suppliers &amp; Purchases</button>
        </div>
      </section>
    </div>
  );
}
