import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, exporter } from '../api.js';
import { formatINR } from '../utils/money.js';

const blank = { name: '', groupId: '', openingBalance: '', openingType: 'dr', gstin: '', notes: '' };
const blankGroup = { name: '', nature: '', parent: '' };
const NATURES = [
  ['asset', 'Asset — something the business owns (stock, deposits, receivables…)'],
  ['liability', 'Liability — something the business owes (loans, payables, taxes…)'],
  ['income', 'Income — money earned (sales, service income, commission…)'],
  ['expense', 'Expense — money spent (rent, salaries, freight…)'],
];
const fmtD = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };

export default function AccLedgers() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [ledgers, setLedgers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...blank });
  const [newGroup, setNewGroup] = useState(null); // null = picking from list; object = creating a group
  const [edits, setEdits] = useState({});
  const [statement, setStatement] = useState(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    try {
      const [l, g] = await Promise.all([api.accLedgers(), api.accGroups()]);
      setLedgers(l); setGroups(g);
    } catch (e) { flash(e.message, 'err'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Drill-down from reports: /accounting/ledgers?sid=<ledgerId>
  useEffect(() => {
    const sid = Number(params.get('sid'));
    if (sid) api.accLedgerStatement(sid).then(setStatement).catch(() => {});
  }, [params]);

  const add = async (e) => {
    e.preventDefault();
    setBusy('add');
    try {
      // Creating a new group inline? Make the group first (with its nature),
      // then put the ledger under it.
      let groupId = form.groupId;
      if (newGroup) {
        if (!newGroup.name.trim()) throw new Error('Enter the new group name');
        if (!newGroup.nature) throw new Error('Pick what the new group is — Asset, Liability, Income or Expense');
        const g = await api.accCreateGroup(newGroup);
        groupId = g.id;
      }
      await api.accCreateLedger({ ...form, groupId, openingBalance: Number(form.openingBalance) || 0 });
      setForm({ ...blank }); setNewGroup(null); setAdding(false); await load(); flash('Ledger created');
    } catch (e2) { flash(e2.message, 'err'); } finally { setBusy(''); }
  };

  const edit = (id, patch) => setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));
  const save = async (l) => {
    const e = edits[l.id];
    if (!e) return;
    setBusy(`s${l.id}`);
    try {
      await api.accUpdateLedger(l.id, { ...e, ...(e.openingBalance !== undefined ? { openingBalance: Number(e.openingBalance) || 0 } : {}) });
      setEdits((p) => { const n = { ...p }; delete n[l.id]; return n; });
      await load(); flash('Ledger saved');
    } catch (e2) { flash(e2.message, 'err'); } finally { setBusy(''); }
  };

  const remove = async (l) => {
    if (!confirm(`Delete ledger "${l.name}"?`)) return;
    try { await api.accDeleteLedger(l.id); await load(); } catch (e) { flash(e.message, 'err'); }
  };

  const openStatement = async (l) => {
    try { setStatement(await api.accLedgerStatement(l.id)); window.scrollTo({ top: 0 }); }
    catch (e) { flash(e.message, 'err'); }
  };

  const view = ledgers.filter((l) => !q.trim() || l.name.toLowerCase().includes(q.toLowerCase()) || (l.group?.name || '').toLowerCase().includes(q.toLowerCase()));

  // running balance for the statement
  let run = statement ? (statement.ledger.openingType === 'cr' ? -1 : 1) * (statement.ledger.openingBalance || 0) : 0;

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <button className="btn ghost" onClick={() => nav('/accounting')}>&larr; Accounting</button>
          <h1 style={{ marginTop: 6 }}>Ledgers</h1>
          <p className="subtle">Chart of accounts — Tally-style groups. Customer ledgers are auto-created when invoices post.</p>
        </div>
        <button className="btn primary" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : '+ Create ledger'}</button>
      </header>

      {statement && (
        <section className="fsec" style={{ borderLeft: '4px solid var(--brand-orange)' }}>
          <div className="fsec-head">
            <h3>Statement · {statement.ledger.name} <span className="hint">{statement.ledger.group?.name}</span></h3>
            <div className="fsec-tools">
              <button className="btn xs" onClick={() => exporter.ledgerStatementPdf(statement.ledger.id, `Ledger-${statement.ledger.name}.pdf`).catch((e) => flash(e.message, 'err'))}>⬇ PDF</button>
              <button className="btn xs" onClick={() => exporter.ledgerStatementXlsx(statement.ledger.id, `Ledger-${statement.ledger.name}.xlsx`).catch((e) => flash(e.message, 'err'))}>⬇ Excel</button>
              <button className="btn xs" onClick={() => setStatement(null)}>Close</button>
            </div>
          </div>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Voucher</th><th>Narration</th><th className="r">Debit</th><th className="r">Credit</th><th className="r">Balance</th></tr></thead>
            <tbody>
              <tr><td colSpan={5}><i>Opening balance</i></td><td className="r strong">₹ {formatINR(statement.ledger.openingBalance || 0)} {statement.ledger.openingType}</td></tr>
              {statement.lines.map((l) => {
                run += (l.debit || 0) - (l.credit || 0);
                return (
                  <tr key={l.id} className="row-click" onClick={() => nav(`/accounting/voucher/${l.voucher.id}`)}>
                    <td>{fmtD(l.voucher.date)}</td>
                    <td className="mono">{l.voucher.voucherNo}</td>
                    <td style={{ maxWidth: 280 }}>{l.voucher.narration || l.voucher.refNo || '—'}</td>
                    <td className="r">{l.debit ? `₹ ${formatINR(l.debit)}` : ''}</td>
                    <td className="r">{l.credit ? `₹ ${formatINR(l.credit)}` : ''}</td>
                    <td className="r strong">₹ {formatINR(Math.abs(run))} {run >= 0 ? 'Dr' : 'Cr'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {adding && (
        <form className="fsec" onSubmit={add}>
          <h3>New Ledger</h3>
          <div className="grid2">
            <label>Name *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Under Group *
              <select value={newGroup ? '__new__' : form.groupId}
                onChange={(e) => {
                  if (e.target.value === '__new__') { setNewGroup({ ...blankGroup }); setForm({ ...form, groupId: '' }); }
                  else { setNewGroup(null); setForm({ ...form, groupId: e.target.value }); }
                }}>
                <option value="">Select…</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.nature})</option>)}
                <option value="__new__">＋ Create a new group…</option>
              </select>
            </label>
            {newGroup && (
              <>
                <label>New Group Name *<input value={newGroup.name} placeholder="e.g. Transport Charges" onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} /></label>
                <label className="full">What is this group? *
                  <select value={newGroup.nature} onChange={(e) => setNewGroup({ ...newGroup, nature: e.target.value })}>
                    <option value="">Select — this decides where it appears in P&L / Balance Sheet…</option>
                    {NATURES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </label>
              </>
            )}
            <label>Opening Balance (₹)<input type="number" step="any" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /></label>
            <label>Dr / Cr
              <select value={form.openingType} onChange={(e) => setForm({ ...form, openingType: e.target.value })}>
                <option value="dr">Debit</option><option value="cr">Credit</option>
              </select>
            </label>
            <label>GSTIN<input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></label>
            <label>Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
          <div style={{ marginTop: 12 }}><button className="btn primary" type="submit" disabled={busy === 'add' || !form.name.trim() || (!form.groupId && !(newGroup?.name?.trim() && newGroup?.nature))}>{busy === 'add' ? 'Saving…' : newGroup ? 'Create group & ledger' : 'Create ledger'}</button></div>
        </form>
      )}

      <div className="toolbar"><input className="search" placeholder="Search ledger or group…" value={q} onChange={(e) => setQ(e.target.value)} /></div>

      <div className="card table-card">
        <table className="data-table">
          <thead><tr><th>Ledger</th><th>Group</th><th style={{ width: 140 }}>Opening (₹)</th><th className="r">Balance</th><th className="r">Actions</th></tr></thead>
          <tbody>
            {view.map((l) => {
              const e = edits[l.id] || {};
              return (
                <tr key={l.id}>
                  <td className="strong">{l.name}{l.isSystem && <span className="hint">core</span>}</td>
                  <td>{l.group?.name}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <input type="number" step="any" value={e.openingBalance ?? l.openingBalance} onChange={(ev) => edit(l.id, { openingBalance: ev.target.value })} />
                    <select value={e.openingType ?? l.openingType} style={{ width: 64 }} onChange={(ev) => edit(l.id, { openingType: ev.target.value })}>
                      <option value="dr">Dr</option><option value="cr">Cr</option>
                    </select>
                  </td>
                  <td className="r strong">₹ {formatINR(l.balance)} <span className="subtle">{l.balanceType}</span></td>
                  <td className="r">
                    <div className="row-actions">
                      <button className="btn xs" onClick={() => openStatement(l)}>Statement</button>
                      <button className="btn xs primary" disabled={!edits[l.id] || busy === `s${l.id}`} onClick={() => save(l)}>Save</button>
                      {/* Delete is only possible for non-core ledgers with no entries —
                          show WHY instead of hiding the button. */}
                      {l.isSystem ? (
                        <button className="btn xs danger" disabled title="Core system ledger (used by auto-posting) — cannot be deleted">✕</button>
                      ) : (l.totalDebit || l.totalCredit) ? (
                        <button className="btn xs danger" disabled title="This ledger has voucher entries — delete those vouchers first (see Statement)">✕</button>
                      ) : (
                        <button className="btn xs danger" title="Delete this ledger" onClick={() => remove(l)}>✕</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
