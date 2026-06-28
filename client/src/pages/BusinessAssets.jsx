import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const STATUS_COLORS = {
  available: { bg: '#e7f6ec', color: '#1f8f4e' },
  allocated: { bg: '#fef3ec', color: '#b9651a' },
  in_demo: { bg: '#e8f4fd', color: '#2471a3' },
  maintenance: { bg: '#fef9e7', color: '#9a7d0a' },
  disposed: { bg: '#f3f4f6', color: '#6b7280' },
};
const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s); if (isNaN(d)) return s; return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; };
const fmtCur = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

const blank = {
  name: '', assetCode: '', assetType: 'standard', category: '',
  description: '', purchaseDate: '', cost: '', depRate: 15,
  assignedEmployeeId: '', notes: '',
};

export default function BusinessAssets() {
  const { isAdmin } = useAuth();
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(blank);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [checkoutForm, setCheckoutForm] = useState({ employeeId: '', notes: '' });
  const [checkinNotes, setCheckinNotes] = useState('');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState('');
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = [];
      if (filterType !== 'all') params.push(`assetType=${filterType}`);
      if (filterStatus !== 'all') params.push(`status=${filterStatus}`);
      setAssets(await api.listBusinessAssets(params.length ? `?${params.join('&')}` : ''));
    } finally { setLoading(false); }
  }, [filterType, filterStatus]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isAdmin) api.listEmployees().then(setEmployees).catch(() => {}); }, [isAdmin]);

  const selectAsset = async (a) => {
    setSelected(a);
    try { setHistory(await api.getBusinessAssetHistory(a.id)); } catch { setHistory([]); }
  };

  const openEdit = (a) => {
    setEditId(a.id);
    setForm({
      name: a.name, assetCode: a.assetCode || '', assetType: a.assetType,
      category: a.category || '', description: a.description || '',
      purchaseDate: a.purchaseDate || '', cost: a.cost || '', depRate: a.depRate || 15,
      assignedEmployeeId: a.assignedEmployeeId || '', notes: a.notes || '',
    });
    setShowForm(true);
  };

  const openNew = () => { setEditId(null); setForm(blank); setShowForm(true); };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return flash('Asset name is required', 'err');
    setBusy('save');
    try {
      const payload = { ...form, cost: Number(form.cost) || 0, depRate: Number(form.depRate) || 15, assignedEmployeeId: form.assignedEmployeeId ? Number(form.assignedEmployeeId) : null };
      if (editId) await api.updateBusinessAsset(editId, payload);
      else await api.createBusinessAsset(payload);
      flash(editId ? 'Asset updated' : 'Asset created');
      setShowForm(false); setEditId(null); setForm(blank);
      await load();
      if (selected && editId === selected.id) setSelected(null);
    } catch (err) { flash(err.message, 'err'); }
    finally { setBusy(''); }
  };

  const checkout = async () => {
    if (!selected || !checkoutForm.employeeId) return flash('Select an employee to check out to', 'err');
    setBusy('checkout');
    try {
      const updated = await api.checkoutAsset(selected.id, { employeeId: Number(checkoutForm.employeeId), notes: checkoutForm.notes });
      flash('Asset checked out');
      setSelected(updated);
      setCheckoutForm({ employeeId: '', notes: '' });
      await load();
      selectAsset(updated);
    } catch (e) { flash(e.message, 'err'); }
    finally { setBusy(''); }
  };

  const checkin = async () => {
    if (!selected) return;
    setBusy('checkin');
    try {
      const updated = await api.checkinAsset(selected.id, { notes: checkinNotes });
      flash('Asset returned');
      setSelected(updated);
      setCheckinNotes('');
      await load();
      selectAsset(updated);
    } catch (e) { flash(e.message, 'err'); }
    finally { setBusy(''); }
  };

  const empName = (id) => employees.find((e) => e.id === id)?.name || `#${id}`;

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div><h1>Business Assets</h1><p className="subtle">Standard assets (laptops, tools) and demo units tracking.</p></div>
        {isAdmin && <button className="btn primary" onClick={openNew}>+ Add Asset</button>}
      </header>

      {showForm && isAdmin && (
        <section className="fsec">
          <h3>{editId ? 'Edit Asset' : 'New Asset'}</h3>
          <form onSubmit={save}>
            <div className="grid2">
              <label>Asset Name *<input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></label>
              <label>Asset Code<input value={form.assetCode} onChange={(e) => setForm((p) => ({ ...p, assetCode: e.target.value }))} placeholder="e.g. BA-2024-001" /></label>
              <label>Asset Type
                <select value={form.assetType} onChange={(e) => setForm((p) => ({ ...p, assetType: e.target.value }))}>
                  <option value="standard">Standard (permanent allocation)</option>
                  <option value="demo">Demo unit (check-in / check-out)</option>
                </select>
              </label>
              <label>Category<input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} placeholder="e.g. Laptop, Tool, Vehicle" /></label>
              <label>Purchase Date<input type="date" value={form.purchaseDate} onChange={(e) => setForm((p) => ({ ...p, purchaseDate: e.target.value }))} /></label>
              <label>Cost (₹)<input type="number" step="any" value={form.cost} onChange={(e) => setForm((p) => ({ ...p, cost: e.target.value }))} /></label>
              <label>Depreciation Rate (%)<input type="number" step="any" value={form.depRate} onChange={(e) => setForm((p) => ({ ...p, depRate: e.target.value }))} /></label>
              <label>Assign to Employee (optional)
                <select value={form.assignedEmployeeId} onChange={(e) => setForm((p) => ({ ...p, assignedEmployeeId: e.target.value }))}>
                  <option value="">— Unallocated —</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </label>
              <label className="full">Description<textarea rows={2} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></label>
              <label className="full">Notes<textarea rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></label>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button className="btn primary" type="submit" disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save Asset'}</button>
              <button type="button" className="btn" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 16 }}>
        <div>
          <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {['all', 'standard', 'demo'].map((t) => (
                <button key={t} className={`seg-toggle ${filterType === t ? 'on' : ''}`} onClick={() => setFilterType(t)}>
                  {t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {['all', 'available', 'allocated', 'in_demo', 'maintenance', 'disposed'].map((s) => (
                <button key={s} className={`seg-toggle ${filterStatus === s ? 'on' : ''}`} onClick={() => setFilterStatus(s)}>
                  {s === 'all' ? 'All Status' : s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="card table-card">
            {loading ? <div className="empty">Loading…</div> : assets.length === 0 ? (
              <div className="empty"><p>No assets yet.</p>{isAdmin && <button className="btn primary" onClick={openNew}>Add the first asset</button>}</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Asset</th><th>Code</th><th>Type</th><th>Category</th><th>Assigned To</th><th>Cost</th><th>Status</th>{isAdmin && <th className="r">Actions</th>}</tr></thead>
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.id} className={`row-click ${selected?.id === a.id ? 'selected' : ''}`} onClick={() => selectAsset(a)}>
                      <td className="strong">{a.name}</td>
                      <td className="mono">{a.assetCode || '—'}</td>
                      <td><span className="badge" style={{ background: a.assetType === 'demo' ? '#e8f4fd' : '#f3f4f6', color: a.assetType === 'demo' ? '#2471a3' : '#374151' }}>{a.assetType}</span></td>
                      <td>{a.category || '—'}</td>
                      <td>{a.assignedEmployee?.name || '—'}</td>
                      <td>{fmtCur(a.cost)}</td>
                      <td><span className="badge" style={STATUS_COLORS[a.status] || {}}>{a.status?.replace('_', ' ')}</span></td>
                      {isAdmin && (
                        <td className="r" onClick={(e) => e.stopPropagation()}>
                          <button className="btn xs" onClick={() => openEdit(a)}>Edit</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {selected && (
          <div className="fsec" style={{ alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>{selected.name}</h3>
              <button className="btn xs" onClick={() => setSelected(null)}>✕</button>
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              {selected.assetCode && <div><b>Code:</b> {selected.assetCode}</div>}
              <div><b>Type:</b> {selected.assetType}</div>
              {selected.category && <div><b>Category:</b> {selected.category}</div>}
              {selected.purchaseDate && <div><b>Purchased:</b> {fmtDate(selected.purchaseDate)}</div>}
              {selected.cost > 0 && <div><b>Cost:</b> {fmtCur(selected.cost)} · Dep {selected.depRate}%/yr</div>}
              {selected.assignedEmployee && <div><b>With:</b> {selected.assignedEmployee.name}</div>}
              <div><b>Status:</b> <span className="badge" style={STATUS_COLORS[selected.status] || {}}>{selected.status?.replace('_', ' ')}</span></div>
              {selected.description && <div style={{ marginTop: 4 }}>{selected.description}</div>}
            </div>

            {isAdmin && selected.assetType === 'demo' && (
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 12 }}>
                {selected.status !== 'in_demo' ? (
                  <>
                    <b style={{ display: 'block', marginBottom: 8 }}>Check Out (Demo)</b>
                    <label>Assign to Employee
                      <select value={checkoutForm.employeeId} onChange={(e) => setCheckoutForm((p) => ({ ...p, employeeId: e.target.value }))}>
                        <option value="">— Select —</option>
                        {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </label>
                    <label style={{ display: 'block', marginTop: 6 }}>Notes<input value={checkoutForm.notes} onChange={(e) => setCheckoutForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Customer site, purpose…" /></label>
                    <button className="btn primary" style={{ marginTop: 8 }} onClick={checkout} disabled={busy === 'checkout'}>{busy === 'checkout' ? '…' : 'Check Out'}</button>
                  </>
                ) : (
                  <>
                    <b style={{ display: 'block', marginBottom: 8 }}>Check In (Return)</b>
                    <label>Return Notes<input value={checkinNotes} onChange={(e) => setCheckinNotes(e.target.value)} placeholder="Condition on return…" /></label>
                    <button className="btn" style={{ marginTop: 8 }} onClick={checkin} disabled={busy === 'checkin'}>{busy === 'checkin' ? '…' : 'Check In'}</button>
                  </>
                )}
              </div>
            )}

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 12 }}>
              <b>Custody History</b>
              {history.length === 0 ? <p className="subtle" style={{ fontSize: 12 }}>No history yet.</p> : (
                <ul style={{ paddingLeft: 16, margin: '8px 0 0', fontSize: 12, lineHeight: 1.8 }}>
                  {history.map((h) => (
                    <li key={h.id}>
                      <b>{h.action}</b> — {fmtDate(h.createdAt)}
                      {h.fromEmployeeId ? ` from ${empName(h.fromEmployeeId)}` : ''}
                      {h.toEmployeeId ? ` → ${empName(h.toEmployeeId)}` : ''}
                      {h.notes ? <span className="subtle"> · {h.notes}</span> : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
