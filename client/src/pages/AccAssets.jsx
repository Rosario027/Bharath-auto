import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';

const INR = (n) => `₹ ${formatINR(n)}`;
const blank = { name: '', category: 'Plant & Machinery', purchaseDate: '', cost: '', additions: '', accumulatedDep: '', depRate: 15, method: 'WDV', notes: '' };

export default function AccAssets() {
  const nav = useNavigate();
  const [schedule, setSchedule] = useState([]);
  const [totals, setTotals] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...blank });
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    try { const r = await api.accAssets(); setSchedule(r.schedule); setTotals(r.totals); }
    catch (e) { flash(e.message, 'err'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setBusy('add');
    try {
      await api.accCreateAsset(form);
      setForm({ ...blank }); setAdding(false); await load(); flash('Asset added');
    } catch (e2) { flash(e2.message, 'err'); } finally { setBusy(''); }
  };

  const edit = (id, patch) => setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));
  const save = async (a) => {
    const e = edits[a.id];
    if (!e) return;
    setBusy(`s${a.id}`);
    try {
      await api.accUpdateAsset(a.id, e);
      setEdits((p) => { const n = { ...p }; delete n[a.id]; return n; });
      await load(); flash('Asset updated — schedule recalculated');
    } catch (e2) { flash(e2.message, 'err'); } finally { setBusy(''); }
  };

  const remove = async (a) => {
    if (!confirm(`Delete asset "${a.name}"?`)) return;
    try { await api.accDeleteAsset(a.id); await load(); } catch (e) { flash(e.message, 'err'); }
  };

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <button className="btn ghost" onClick={() => nav('/accounting')}>&larr; Day Book</button>
          <h1 style={{ marginTop: 6 }}>Fixed Asset Schedule</h1>
          <p className="subtle">Gross block, additions & depreciation (WDV on opening WDV + additions; SLM on cost + additions).</p>
        </div>
        <button className="btn primary" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : '+ Add asset'}</button>
      </header>

      {adding && (
        <form className="fsec" onSubmit={add}>
          <h3>New Asset</h3>
          <div className="grid2">
            <label>Name *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Category
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {['Plant & Machinery', 'Computers', 'Vehicles', 'Furniture & Fixtures', 'Buildings', 'Office Equipment', 'Other'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>Purchase Date<input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></label>
            <label>Cost / Gross Block (₹) *<input type="number" step="any" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></label>
            <label>Additions this year (₹)<input type="number" step="any" value={form.additions} onChange={(e) => setForm({ ...form, additions: e.target.value })} /></label>
            <label>Opening Accumulated Dep (₹)<input type="number" step="any" value={form.accumulatedDep} onChange={(e) => setForm({ ...form, accumulatedDep: e.target.value })} /></label>
            <label>Depreciation Rate (%)<input type="number" step="any" value={form.depRate} onChange={(e) => setForm({ ...form, depRate: e.target.value })} /></label>
            <label>Method
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                <option value="WDV">WDV (written-down value)</option>
                <option value="SLM">SLM (straight line)</option>
              </select>
            </label>
          </div>
          <div style={{ marginTop: 12 }}><button className="btn primary" type="submit" disabled={busy === 'add' || !form.name.trim()}>{busy === 'add' ? 'Saving…' : 'Add asset'}</button></div>
        </form>
      )}

      <div className="card table-card">
        <table className="data-table">
          <thead>
            <tr><th>Asset</th><th>Category</th><th style={{ width: 110 }}>Cost</th><th style={{ width: 100 }}>Additions</th><th style={{ width: 90 }}>Rate %</th><th>Method</th><th className="r">Opening WDV</th><th className="r">Depreciation</th><th className="r">Closing WDV</th><th className="r">Actions</th></tr>
          </thead>
          <tbody>
            {schedule.map((a) => {
              const e = edits[a.id] || {};
              return (
                <tr key={a.id}>
                  <td className="strong">{a.name}<div className="subtle" style={{ fontSize: 11 }}>{a.purchaseDate || ''}</div></td>
                  <td>{a.category}</td>
                  <td><input type="number" step="any" value={e.cost ?? a.cost} onChange={(ev) => edit(a.id, { cost: ev.target.value })} /></td>
                  <td><input type="number" step="any" value={e.additions ?? a.additions} onChange={(ev) => edit(a.id, { additions: ev.target.value })} /></td>
                  <td><input type="number" step="any" value={e.depRate ?? a.depRate} onChange={(ev) => edit(a.id, { depRate: ev.target.value })} /></td>
                  <td>
                    <select value={e.method ?? a.method} onChange={(ev) => edit(a.id, { method: ev.target.value })}>
                      <option value="WDV">WDV</option><option value="SLM">SLM</option>
                    </select>
                  </td>
                  <td className="r">{INR(a.openingWdv)}</td>
                  <td className="r" style={{ color: '#c0392b' }}>{INR(a.depreciation)}</td>
                  <td className="r strong">{INR(a.closingWdv)}</td>
                  <td className="r">
                    <div className="row-actions">
                      <button className="btn xs primary" disabled={!edits[a.id] || busy === `s${a.id}`} onClick={() => save(a)}>Save</button>
                      <button className="btn xs danger" onClick={() => remove(a)}>✕</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {totals && (
              <tr className="acc-total">
                <td colSpan={2}><b>Total</b></td>
                <td><b>{INR(totals.cost)}</b></td>
                <td><b>{INR(totals.additions)}</b></td>
                <td colSpan={3}></td>
                <td className="r"><b>{INR(totals.depreciation)}</b></td>
                <td className="r"><b>{INR(totals.closingWdv)}</b></td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
