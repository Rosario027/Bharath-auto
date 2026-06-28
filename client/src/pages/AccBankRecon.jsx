import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, exporter } from '../api.js';
import { formatINR } from '../utils/money.js';

const fmtD = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };

// Bank Reconciliation — import statements, then categorise / map every
// transaction (AR receipts → invoices, AP payments → purchase bills,
// anything else → ledgers or the To Be Verified suspense).
export default function AccBankRecon() {
  const nav = useNavigate();
  const [ledgers, setLedgers] = useState([]);
  const [bankLedgerId, setBankLedgerId] = useState('');
  const [importErrors, setImportErrors] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const [txns, setTxns] = useState([]);
  const [txnTab, setTxnTab] = useState('pending');
  const [unpaid, setUnpaid] = useState([]);
  const [bills, setBills] = useState([]);
  const [catSel, setCatSel] = useState({});
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  const loadAll = useCallback(async () => {
    // Each fetch is independent — one failing call must never blank the rest.
    const [l, t, inv, ob] = await Promise.all([
      api.accLedgers().catch((e) => { flash(`Ledgers: ${e.message}`, 'err'); return null; }),
      api.bankTxns().catch((e) => { flash(`Bank transactions: ${e.message}`, 'err'); return null; }),
      api.listInvoices().catch(() => []),
      api.openBills().catch(() => []),
    ]);
    if (l) {
      setLedgers(l);
      setBankLedgerId((prev) => prev || l.find((x) => x.group?.name === 'Bank Accounts')?.id || '');
    }
    if (t) setTxns(t);
    setUnpaid(inv.filter((i) => i.docType === 'invoice' && i.status !== 'deleted' && (i.amountPaid || 0) < i.grandTotal - 0.5));
    setBills(ob);
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const onBankFile = async (file) => {
    if (!file) return;
    if (!bankLedgerId) return flash('Pick the bank ledger first', 'err');
    setBusy('import'); setImportErrors(null); setImportSummary(null);
    try {
      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch('/api/accounting/bank-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        body: JSON.stringify({ bankLedgerId: Number(bankLedgerId), dataBase64: b64 }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.errors) setImportErrors(j.errors);
        flash(j.error || 'Import failed', 'err');
      } else {
        setImportSummary({ pending: j.pending, posted: j.posted });
        flash('Statement imported');
        setTxnTab(j.pending > 0 ? 'pending' : 'done');
        await loadAll();
      }
    } catch (e) { flash(e.message, 'err'); }
    finally { setBusy(''); }
  };

  const setSel = (id, patch) => setCatSel((p) => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));
  const doCategorize = async (t, toSuspense = false) => {
    const sel = catSel[t.id] || {};
    setBusy(`t${t.id}`);
    try {
      if (sel.invoiceId && !toSuspense) {
        const r = await api.mapTxnToInvoice(t.id, Number(sel.invoiceId));
        flash(r.excess > 0 ? `Mapped — ₹${formatINR(r.applied)} settled, excess ₹${formatINR(r.excess)} parked in "To Be Verified"` : 'Mapped to invoice — AR settled');
      } else if (sel.billId && !toSuspense) {
        const r = await api.mapTxnToBill(t.id, Number(sel.billId));
        flash(r.excess > 0 ? `Mapped — ₹${formatINR(r.applied)} paid against bill, excess ₹${formatINR(r.excess)} parked in "To Be Verified"` : 'Mapped to purchase bill — AP settled');
      } else if (toSuspense) {
        await api.categorizeTxn(t.id, { toSuspense: true });
        flash('Parked in "To Be Verified" — categorise properly later');
      } else {
        if (!sel.ledgerId) return flash('Pick a ledger, an invoice or a purchase bill first', 'err');
        await api.categorizeTxn(t.id, { ledgerId: Number(sel.ledgerId) });
        flash('Categorised & posted to the books');
      }
      await loadAll();
    } catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };

  const pending = txns.filter((t) => t.status === 'pending');
  const done = txns.filter((t) => t.status !== 'pending');
  const txnView = txnTab === 'pending' ? pending : done;
  const inflow = pending.reduce((s, t) => s + (t.credit || 0), 0);
  const outflow = pending.reduce((s, t) => s + (t.debit || 0), 0);
  const partials = txns.filter((t) => t.status === 'partial').length;
  const bankLedgers = ledgers.filter((l) => ['Bank Accounts', 'Cash-in-Hand'].includes(l.group?.name));
  const selectedBank = ledgers.find((l) => l.id === Number(bankLedgerId));

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <button className="btn ghost" onClick={() => nav('/accounting')}>&larr; Accounting</button>
          <h1 style={{ marginTop: 6 }}>Bank Reconciliation</h1>
          <p className="subtle">Import statements → every transaction lands here to be categorised or mapped (AR invoices · AP bills · ledgers).</p>
        </div>
      </header>

      <div className="stat-row">
        <div className="stat-card"><div className="stat-label">To Categorise</div><div className="stat-value" style={pending.length ? { color: '#c0392b' } : {}}>{pending.length}</div></div>
        <div className="stat-card"><div className="stat-label">Uncategorised In / Out</div><div className="stat-value sm">₹ {formatINR(inflow)} / ₹ {formatINR(outflow)}</div></div>
        <div className="stat-card"><div className="stat-label">Reconciled</div><div className="stat-value">{done.length}</div></div>
        <div className="stat-card"><div className="stat-label">Partial (excess parked)</div><div className="stat-value">{partials}</div></div>
        {selectedBank && <div className="stat-card"><div className="stat-label">{selectedBank.name} (book balance)</div><div className="stat-value sm">₹ {formatINR(selectedBank.balance)} {selectedBank.balanceType}</div></div>}
      </div>

      {/* Import */}
      <section className="fsec">
        <div className="fsec-head">
          <h3>1 · Import Bank Statement <span className="hint">Excel</span></h3>
          <button className="btn xs" onClick={() => exporter.bankTemplate().catch((e) => flash(e.message, 'err'))}>⬇ Download template</button>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ minWidth: 220 }}>Bank ledger to post against
            <select value={bankLedgerId} onChange={(e) => setBankLedgerId(e.target.value)}>
              {bankLedgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="btn primary" style={{ cursor: 'pointer' }}>
            {busy === 'import' ? 'Validating & importing…' : '⬆ Upload statement'}
            <input type="file" accept=".xlsx" style={{ display: 'none' }} disabled={busy === 'import'}
              onChange={(e) => { onBankFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <span className="subtle" style={{ fontSize: 12 }}>Rows with a Ledger filled post straight to the books; rows without land below as "to categorise". Indian date formats & comma amounts accepted.</span>
        </div>
        {importSummary && (
          <div className="import-summary">
            ✅ <b>Statement imported.</b>&nbsp;
            {importSummary.pending > 0 && <span><b>{importSummary.pending}</b> transaction(s) are waiting below — categorise or map each one.&nbsp;</span>}
            {importSummary.posted > 0 && <span><b>{importSummary.posted}</b> row(s) had a Ledger filled and were posted straight to the books — see the <a onClick={() => setTxnTab('done')} style={{ textDecoration: 'underline', cursor: 'pointer' }}>Reconciled tab</a> and the Day Book.</span>}
            <button className="btn xs" style={{ marginLeft: 8 }} onClick={() => setImportSummary(null)}>Dismiss</button>
          </div>
        )}
        {importErrors && (
          <div className="import-errors">
            <b>File rejected — fix these rows and re-upload:</b>
            <table className="data-table" style={{ marginTop: 8 }}>
              <thead><tr><th style={{ width: 70 }}>Row</th><th style={{ width: 180 }}>Issue category</th><th>Details</th></tr></thead>
              <tbody>{importErrors.map((er, i) => <tr key={i}><td className="strong">#{er.row}</td><td><span className="badge rq-rejected">{er.category}</span></td><td>{er.issue}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      {/* Categorisation */}
      <section className="fsec">
        <div className="fsec-head">
          <h3>2 · Categorise & Map <span className="hint">AR / AP reconciliation</span></h3>
          <div className="fsec-tools">
            <button className={`seg-toggle ${txnTab === 'pending' ? 'on' : ''}`} onClick={() => setTxnTab('pending')}>To Categorise ({pending.length})</button>
            <button className={`seg-toggle ${txnTab === 'done' ? 'on' : ''}`} onClick={() => setTxnTab('done')}>Reconciled ({done.length})</button>
            <button className="btn xs" onClick={() => loadAll()}>↻ Refresh</button>
          </div>
        </div>
        {txnView.length === 0 ? (
          <p className="subtle">{txns.length === 0 ? 'No bank transactions yet — import a statement above.' : txnTab === 'pending' ? 'Nothing pending — every transaction is reconciled. ✓' : 'No reconciled transactions yet.'}</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Description</th><th className="r">In</th><th className="r">Out</th><th>Bank</th>{txnTab === 'pending' ? <th style={{ minWidth: 330 }}>Categorise as</th> : <th>Categorised as</th>}<th className="r">{txnTab === 'pending' ? 'Action' : 'Status'}</th></tr></thead>
            <tbody>
              {txnView.map((t) => {
                const sel = catSel[t.id] || {};
                return (
                  <tr key={t.id}>
                    <td>{fmtD(t.date)}</td>
                    <td style={{ maxWidth: 240 }}>{t.description || '—'}</td>
                    <td className="r" style={{ color: '#1f8f4e' }}>{t.credit ? formatINR(t.credit) : ''}</td>
                    <td className="r" style={{ color: '#c0392b' }}>{t.debit ? formatINR(t.debit) : ''}</td>
                    <td>{t.bankName}</td>
                    {txnTab === 'pending' ? (
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <select value={sel.ledgerId || ''} onChange={(e) => setSel(t.id, { ledgerId: e.target.value, invoiceId: '', billId: '' })}>
                            <option value="">— Ledger (expense / income / cash…) —</option>
                            {ledgers.filter((l) => l.id !== t.bankLedgerId).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.group?.name})</option>)}
                          </select>
                          {t.credit > 0 && unpaid.length > 0 && (
                            <select value={sel.invoiceId || ''} onChange={(e) => setSel(t.id, { invoiceId: e.target.value, ledgerId: '', billId: '' })}>
                              <option value="">— or map to unpaid invoice (AR) —</option>
                              {unpaid.map((i) => <option key={i.id} value={i.id}>{i.invoiceNo} · {i.buyerName} · ₹{formatINR(i.grandTotal - (i.amountPaid || 0))} due</option>)}
                            </select>
                          )}
                          {t.debit > 0 && bills.length > 0 && (
                            <select value={sel.billId || ''} onChange={(e) => setSel(t.id, { billId: e.target.value, ledgerId: '', invoiceId: '' })}>
                              <option value="">— or map to purchase bill (AP) —</option>
                              {bills.map((b) => <option key={b.id} value={b.id}>{b.voucherNo} · {b.creditor} · ₹{formatINR(b.outstanding)} due</option>)}
                            </select>
                          )}
                        </div>
                      </td>
                    ) : (
                      <td><b>{t.categorizedAs}</b>{t.status === 'partial' && <span className="badge rq-pending" style={{ marginLeft: 6 }}>excess parked</span>}</td>
                    )}
                    <td className="r">
                      {txnTab === 'pending' ? (
                        <div className="row-actions">
                          <button className="btn xs primary" disabled={busy === `t${t.id}`} onClick={() => doCategorize(t)}>Post</button>
                          <button className="btn xs" title="Park in To Be Verified (Suspense)" disabled={busy === `t${t.id}`} onClick={() => doCategorize(t, true)}>?</button>
                        </div>
                      ) : <span className={`badge ${t.status === 'partial' ? 'rq-pending' : 'rq-approved'}`}>{t.status}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
