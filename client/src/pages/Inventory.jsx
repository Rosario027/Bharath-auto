import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const blank = { name: '', sku: '', hsnCode: '', quantity: '', unit: 'Nos', location: '', notes: '' };

export default function Inventory() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [showMoves, setShowMoves] = useState(false);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...blank });
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    try { setItems(await api.listInventory()); } catch (e) { flash(e.message, 'err'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadMoves = async () => {
    try { setMovements(await api.stockMovements()); setShowMoves(true); } catch (e) { flash(e.message, 'err'); }
  };

  const add = async (e) => {
    e.preventDefault();
    setBusy('add');
    try {
      await api.createInventory({ ...form, quantity: Number(form.quantity) || 0 });
      setForm({ ...blank }); setAdding(false); await load(); flash('Item added to inventory');
    } catch (e2) { flash(e2.message, 'err'); } finally { setBusy(''); }
  };

  const edit = (id, patch) => setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));
  const save = async (it) => {
    const e = edits[it.id];
    if (!e) return;
    setBusy(`s${it.id}`);
    try {
      await api.updateInventory(it.id, { ...e, ...(e.quantity !== undefined ? { quantity: Number(e.quantity) || 0 } : {}) });
      setEdits((p) => { const n = { ...p }; delete n[it.id]; return n; });
      await load(); flash('Stock updated');
    } catch (e2) { flash(e2.message, 'err'); } finally { setBusy(''); }
  };

  const remove = async (it) => {
    if (!confirm(`Delete "${it.name}" from inventory?`)) return;
    try { await api.deleteInventory(it.id); await load(); } catch (e) { flash(e.message, 'err'); }
  };

  const view = items.filter((i) => !q.trim() || i.name.toLowerCase().includes(q.toLowerCase()) || (i.location || '').toLowerCase().includes(q.toLowerCase()) || (i.sku || '').toLowerCase().includes(q.toLowerCase()));
  const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const lowStock = items.filter((i) => i.quantity <= 2).length;

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div><h1>Inventory & Stock</h1><p className="subtle">Add items, update quantities and locations — invoice lines can draw from stock.</p></div>
        <button className="btn primary" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : '+ Add item'}</button>
      </header>

      <div className="stat-row">
        <div className="stat-card"><div className="stat-label">Items</div><div className="stat-value">{items.length}</div></div>
        <div className="stat-card"><div className="stat-label">Total Units</div><div className="stat-value">{totalQty}</div></div>
        <div className="stat-card"><div className="stat-label">Low Stock (≤2)</div><div className="stat-value">{lowStock}</div></div>
      </div>

      {adding && (
        <form className="fsec" onSubmit={add}>
          <h3>New Item</h3>
          <div className="grid2">
            <label>Name *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>SKU / Code<input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></label>
            <label>HSN<input value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} /></label>
            <label>Opening Quantity<input type="number" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
            <label>Unit<input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></label>
            <label>Location<input value={form.location} placeholder="e.g. Godown A, Rack 3" onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
            <label className="full">Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
          <div style={{ marginTop: 12 }}><button className="btn primary" type="submit" disabled={busy === 'add' || !form.name.trim()}>{busy === 'add' ? 'Saving…' : 'Add to inventory'}</button></div>
        </form>
      )}

      <div className="toolbar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input className="search" placeholder="Search item, SKU, location…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={showMoves ? () => setShowMoves(false) : loadMoves}>{showMoves ? 'Hide movements' : '📜 Stock movements'}</button>
      </div>

      {showMoves && (
        <div className="card table-card" style={{ marginBottom: 16 }}>
          <table className="data-table">
            <thead><tr><th>When</th><th>Item</th><th className="r">In / Out</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{m.item?.name}</td>
                  <td className={`r strong ${m.delta < 0 ? 'exp-soon' : ''}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                  <td>{m.reason}</td>
                  <td>{m.byUsername}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card table-card">
        {view.length === 0 ? <div className="empty"><p>No inventory yet — add your first item.</p></div> : (
          <table className="data-table">
            <thead><tr><th>Item</th><th>SKU</th><th>HSN</th><th style={{ width: 110 }}>Quantity</th><th>Unit</th><th style={{ width: 180 }}>Location</th><th className="r">Actions</th></tr></thead>
            <tbody>
              {view.map((it) => {
                const e = edits[it.id] || {};
                return (
                  <tr key={it.id} className={it.quantity <= 2 ? 'low-stock' : ''}>
                    <td className="strong">{it.name}{it.notes ? <div className="subtle" style={{ fontSize: 11 }}>{it.notes}</div> : null}</td>
                    <td className="mono">{it.sku || '—'}</td>
                    <td className="mono">{it.hsnCode || '—'}</td>
                    <td><input type="number" step="any" value={e.quantity ?? it.quantity} onChange={(ev) => edit(it.id, { quantity: ev.target.value })} /></td>
                    <td>{it.unit}</td>
                    <td><input value={e.location ?? it.location} onChange={(ev) => edit(it.id, { location: ev.target.value })} /></td>
                    <td className="r">
                      <div className="row-actions">
                        <button className="btn xs primary" disabled={!edits[it.id] || busy === `s${it.id}`} onClick={() => save(it)}>Save</button>
                        {isAdmin && <button className="btn xs danger" onClick={() => remove(it)}>✕</button>}
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
