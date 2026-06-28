import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';

const fmtD = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const blankSupplier = { name: '', group: '', contactPerson: '', phone: '', altPhone: '', email: '', gstn: '', stateCode: '', addressLines: [], notes: '' };
const blankItem = () => ({ description: '', hsnCode: '', qty: 1, unit: 'Nos', price: '', gstRate: 18, inventoryItemId: '', addToStock: true, notes: '' });
const blankBill = () => ({ supplierId: '', billNo: '', billDate: todayStr(), taxMode: 'intra', storeTo: 'warehouse', warehouseLocation: '', deliverTo: '', notes: '', items: [blankItem()] });

// Purchases — supplier register + purchase bills. Bills stock-in inventory
// and auto-post to the books (Dr Purchase + GST Input / Cr Supplier).
export default function AccPurchases() {
  const nav = useNavigate();
  const [tab, setTab] = useState('bills');
  const [bills, setBills] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [openAp, setOpenAp] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 4000); };

  // bill form
  const [billing, setBilling] = useState(false);
  const [editId, setEditId] = useState(null);
  const [bill, setBill] = useState(blankBill());
  const setB = (patch) => setBill((p) => ({ ...p, ...patch }));

  // supplier form
  const [addingSup, setAddingSup] = useState(false);
  const [supForm, setSupForm] = useState({ ...blankSupplier });
  const [supEditId, setSupEditId] = useState(null);

  // filters / sort
  const [q, setQ] = useState('');
  const [supplierF, setSupplierF] = useState('all');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [supQ, setSupQ] = useState('');
  const [supSort, setSupSort] = useState({ key: 'name', dir: 'asc' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s, inv, ap] = await Promise.all([
        api.listPurchases().catch((e) => { flash(`Bills: ${e.message}`, 'err'); return []; }),
        api.listSuppliers().catch(() => []),
        api.listInventory().catch(() => []),
        api.openBills().catch(() => []),
      ]);
      setBills(b); setSuppliers(s); setInventory(inv); setOpenAp(ap);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── bill items helpers ──
  const setItem = (i, patch) => setBill((p) => ({ ...p, items: p.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));
  const addItem = () => setBill((p) => ({ ...p, items: [...p.items, blankItem()] }));
  const removeItem = (i) => setBill((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

  const totals = useMemo(() => {
    const items = bill.items.filter((it) => (it.description || '').trim() || Number(it.qty) * Number(it.price));
    const sub = r2(items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0));
    const tax = r2(items.reduce((s, it) => s + ((Number(it.qty) || 0) * (Number(it.price) || 0) * (Number(it.gstRate) || 0)) / 100, 0));
    return { sub, tax, grand: r2(sub + tax) };
  }, [bill.items]);

  const startEdit = (b) => {
    setEditId(b.id);
    setBill({
      supplierId: b.supplierId, billNo: b.billNo, billDate: b.billDate, taxMode: b.taxMode,
      storeTo: b.storeTo, warehouseLocation: b.warehouseLocation, deliverTo: b.deliverTo, notes: b.notes,
      items: b.items.map((it) => ({ ...it, inventoryItemId: it.inventoryItemId || '' })),
    });
    setBilling(true);
    window.scrollTo({ top: 0 });
  };

  const saveBill = async () => {
    setBusy('bill');
    try {
      const payload = { ...bill, supplierId: Number(bill.supplierId), items: bill.items.map((it) => ({ ...it, inventoryItemId: it.inventoryItemId || null })) };
      if (editId) { await api.updatePurchase(editId, payload); flash('Purchase bill updated — books & stock re-synced'); }
      else { const created = await api.createPurchase(payload); flash(`Saved ${created.refNo} — stocked-in & posted to the books`); }
      setBill(blankBill()); setBilling(false); setEditId(null);
      await load();
    } catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };

  const removeBill = async (b) => {
    if (!confirm(`Delete purchase ${b.refNo}${b.billNo ? ` (${b.billNo})` : ''}?\n\nStock taken in by this bill is reversed and its voucher is removed from the books.`)) return;
    setBusy(`d${b.id}`);
    try { await api.deletePurchase(b.id); flash('Purchase deleted — stock & books reversed'); await load(); }
    catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };

  // ── suppliers ──
  const saveSupplier = async () => {
    setBusy('sup');
    try {
      if (supEditId) { await api.updateSupplier(supEditId, supForm); flash('Supplier updated'); }
      else { await api.createSupplier(supForm); flash('Supplier added to the register'); }
      setSupForm({ ...blankSupplier }); setAddingSup(false); setSupEditId(null);
      await load();
    } catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };
  const editSupplier = (s) => { setSupEditId(s.id); setSupForm({ ...blankSupplier, ...s, addressLines: s.addressLines || [] }); setAddingSup(true); setTab('suppliers'); window.scrollTo({ top: 0 }); };
  const removeSupplier = async (s) => {
    if (!confirm(`Delete supplier "${s.name}"?`)) return;
    try { await api.deleteSupplier(s.id); await load(); } catch (e) { flash(e.message, 'err'); }
  };

  // ── derived views ──
  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const arrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
  const apByVoucher = useMemo(() => new Map(openAp.map((b) => [b.id, b])), [openAp]);

  const billView = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const filtered = bills.filter((b) =>
      (supplierF === 'all' || String(b.supplierId) === supplierF) &&
      (!ql ||
        (b.refNo || '').toLowerCase().includes(ql) ||
        (b.billNo || '').toLowerCase().includes(ql) ||
        (b.supplier?.name || '').toLowerCase().includes(ql) ||
        (b.warehouseLocation || '').toLowerCase().includes(ql) ||
        b.items.some((it) => (it.description || '').toLowerCase().includes(ql))));
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (b) => {
      switch (sort.key) {
        case 'ref': return b.refNo || '';
        case 'supplier': return (b.supplier?.name || '').toLowerCase();
        case 'amount': return b.grandTotal || 0;
        case 'due': return b.voucherId && apByVoucher.get(b.voucherId) ? apByVoucher.get(b.voucherId).outstanding : 0;
        default: return b.billDate || '';
      }
    };
    return [...filtered].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * dir);
  }, [bills, q, supplierF, sort, apByVoucher]);

  const supView = useMemo(() => {
    const ql = supQ.trim().toLowerCase();
    const filtered = suppliers.filter((s) =>
      !ql || s.name.toLowerCase().includes(ql) || (s.group || '').toLowerCase().includes(ql) ||
      (s.gstn || '').toLowerCase().includes(ql) || (s.phone || '').includes(ql));
    const dir = supSort.dir === 'asc' ? 1 : -1;
    const val = (s) => {
      switch (supSort.key) {
        case 'group': return (s.group || '').toLowerCase();
        case 'bills': return s.billCount || 0;
        case 'total': return s.totalPurchased || 0;
        default: return s.name.toLowerCase();
      }
    };
    return [...filtered].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * dir);
  }, [suppliers, supQ, supSort]);
  const supSortBy = (key) => setSupSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const supArrow = (key) => (supSort.key === key ? (supSort.dir === 'asc' ? ' ▲' : ' ▼') : '');

  const activeBills = bills.filter((b) => b.status !== 'deleted');
  const totalPurchases = r2(activeBills.reduce((s, b) => s + (b.grandTotal || 0), 0));
  const totalOutstanding = r2(openAp.reduce((s, b) => s + b.outstanding, 0));

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <button className="btn ghost" onClick={() => nav('/accounting')}>&larr; Accounting</button>
          <h1 style={{ marginTop: 6 }}>Purchases</h1>
          <p className="subtle">Supplier register + purchase bills — every bill stocks-in inventory and posts to the books (Dr Purchase + GST Input / Cr Supplier). Pay bills from Bank Reconciliation.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'bills'
            ? <button className="btn primary" onClick={() => { setBilling((v) => !v); setEditId(null); setBill(blankBill()); }}>{billing ? 'Cancel' : '+ New Purchase Bill'}</button>
            : <button className="btn primary" onClick={() => { setAddingSup((v) => !v); setSupEditId(null); setSupForm({ ...blankSupplier }); }}>{addingSup ? 'Cancel' : '+ Add Supplier'}</button>}
        </div>
      </header>

      <div className="stat-row">
        <div className="stat-card"><div className="stat-label">Purchase Bills</div><div className="stat-value">{activeBills.length}</div></div>
        <div className="stat-card"><div className="stat-label">Total Purchases</div><div className="stat-value sm">₹ {formatINR(totalPurchases)}</div></div>
        <div className="stat-card"><div className="stat-label">Payable Outstanding (AP)</div><div className="stat-value sm" style={totalOutstanding > 0 ? { color: '#c0392b' } : {}}>₹ {formatINR(totalOutstanding)}</div></div>
      </div>

      <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className={`seg-toggle ${tab === 'bills' ? 'on' : ''}`} onClick={() => setTab('bills')}>Purchase Bills ({activeBills.length})</button>
        <button className={`seg-toggle ${tab === 'suppliers' ? 'on' : ''}`} onClick={() => setTab('suppliers')}>Suppliers ({suppliers.length})</button>
      </div>

      {/* ── New / edit purchase bill ── */}
      {tab === 'bills' && billing && (
        <section className="fsec" style={{ borderLeft: '4px solid var(--brand-orange)' }}>
          <h3>{editId ? `Edit Purchase (books & stock re-sync on save)` : 'New Purchase Bill'}</h3>
          <div className="grid2">
            <label>Supplier *
              <select value={bill.supplierId} onChange={(e) => setB({ supplierId: e.target.value })}>
                <option value="">Select supplier…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.group ? ` (${s.group})` : ''}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" className="btn xs" onClick={() => { setTab('suppliers'); setAddingSup(true); setSupEditId(null); setSupForm({ ...blankSupplier }); }}>＋ New supplier (register first, then come back)</button>
            </div>
            <label>Supplier Bill No<input value={bill.billNo} placeholder="e.g. SM/2026/118" onChange={(e) => setB({ billNo: e.target.value })} /></label>
            <label>Bill Date<input type="date" value={bill.billDate} onChange={(e) => setB({ billDate: e.target.value })} /></label>
            <label>Tax Mode
              <select value={bill.taxMode} onChange={(e) => setB({ taxMode: e.target.value })}>
                <option value="intra">Intra-state (CGST + SGST input)</option>
                <option value="inter">Inter-state (IGST input)</option>
              </select>
            </label>
            <label>Goods go to
              <select value={bill.storeTo} onChange={(e) => setB({ storeTo: e.target.value })}>
                <option value="warehouse">Warehouse / store (stock-in inventory)</option>
                <option value="customer">Directly to customer site (no stock-in)</option>
              </select>
            </label>
            {bill.storeTo === 'warehouse'
              ? <label>Warehouse / storage location<input value={bill.warehouseLocation} placeholder="e.g. Main godown — Rack B" onChange={(e) => setB({ warehouseLocation: e.target.value })} /></label>
              : <label>Deliver to (customer / site)<input value={bill.deliverTo} placeholder="e.g. ABC Mills, Annur site" onChange={(e) => setB({ deliverTo: e.target.value })} /></label>}
            <label>Purchase Notes<input value={bill.notes} placeholder="terms, transport, warranty…" onChange={(e) => setB({ notes: e.target.value })} /></label>
          </div>

          <h3 style={{ marginTop: 18 }}>Items</h3>
          {bill.items.map((it, i) => (
            <div key={i} className="purchase-item-row">
              <label className="pi-desc">Item / description
                <input value={it.description} placeholder="e.g. Sliding gate motor 600kg" onChange={(e) => setItem(i, { description: e.target.value })} />
              </label>
              <label>HSN<input value={it.hsnCode} onChange={(e) => setItem(i, { hsnCode: e.target.value })} /></label>
              <label>Qty<input type="number" step="any" min="0" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} /></label>
              <label>Unit<input value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} /></label>
              <label>Purchase Price (₹)<input type="number" step="any" min="0" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} /></label>
              <label>GST %
                <select value={it.gstRate} onChange={(e) => setItem(i, { gstRate: e.target.value })}>
                  {[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}
                </select>
              </label>
              <div className="pi-amount"><span>Amount</span><b>₹ {formatINR(r2((Number(it.qty) || 0) * (Number(it.price) || 0)))}</b></div>
              <button type="button" className="btn xs danger" disabled={bill.items.length === 1} title="Remove line" onClick={() => removeItem(i)}>✕</button>
              {bill.storeTo === 'warehouse' && (
                <div className="pi-stock">
                  <select value={it.inventoryItemId} onChange={(e) => setItem(i, { inventoryItemId: e.target.value, addToStock: true })}>
                    <option value="">🆕 Stock as new/matched item (by name)</option>
                    {inventory.map((s) => <option key={s.id} value={s.id}>📦 Add to existing: {s.name} (now {s.quantity} {s.unit})</option>)}
                  </select>
                  <label className="pi-check"><input type="checkbox" checked={it.addToStock !== false} onChange={(e) => setItem(i, { addToStock: e.target.checked })} /> stock this line in</label>
                  <input value={it.notes} placeholder="line notes (brand, model…)" onChange={(e) => setItem(i, { notes: e.target.value })} />
                </div>
              )}
            </div>
          ))}
          <button type="button" className="btn xs" onClick={addItem}>+ Add line</button>

          <div className="vtotals ok" style={{ marginTop: 14 }}>
            <span>Taxable: <b>₹ {formatINR(totals.sub)}</b></span>
            <span>{bill.taxMode === 'inter' ? 'IGST' : 'CGST + SGST'}: <b>₹ {formatINR(totals.tax)}</b></span>
            <span>Bill Total: <b>₹ {formatINR(totals.grand)}</b></span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <button className="btn primary" disabled={busy === 'bill' || !bill.supplierId || totals.grand <= 0} onClick={saveBill}>
              {busy === 'bill' ? 'Saving…' : editId ? 'Save changes' : '✓ Save — stock-in & post to books'}
            </button>
            {!bill.supplierId && <span className="subtle" style={{ alignSelf: 'center', fontSize: 12 }}>Pick a supplier to enable saving</span>}
          </div>
        </section>
      )}

      {/* ── Bills table ── */}
      {tab === 'bills' && (
        <>
          <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="search" placeholder="Search ref, bill no, supplier, item, location…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={supplierF} onChange={(e) => setSupplierF(e.target.value)} style={{ width: 'auto', padding: '8px 10px' }}>
              <option value="all">All suppliers</option>
              {suppliers.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>
          <div className="card table-card">
            {loading ? <div className="empty">Loading…</div> : billView.length === 0 ? (
              <div className="empty">
                {bills.length === 0
                  ? <><p>No purchases yet. Register a supplier, then raise your first purchase bill.</p><button className="btn primary" onClick={() => setBilling(true)}>+ New Purchase Bill</button></>
                  : <p>No bills match the current filters.</p>}
              </div>
            ) : (
              <table className="data-table">
                <thead><tr>
                  <th className="sortable" onClick={() => sortBy('ref')}>Ref{arrow('ref')}</th>
                  <th>Bill No</th>
                  <th className="sortable" onClick={() => sortBy('date')}>Date{arrow('date')}</th>
                  <th className="sortable" onClick={() => sortBy('supplier')}>Supplier{arrow('supplier')}</th>
                  <th>Items</th>
                  <th>Goods To</th>
                  <th className="r sortable" onClick={() => sortBy('amount')}>Amount{arrow('amount')}</th>
                  <th className="r sortable" onClick={() => sortBy('due')}>Due (AP){arrow('due')}</th>
                  <th className="r">Actions</th>
                </tr></thead>
                <tbody>
                  {billView.map((b) => {
                    const deleted = b.status === 'deleted';
                    const ap = b.voucherId ? apByVoucher.get(b.voucherId) : null;
                    return (
                      <tr key={b.id} className={deleted ? 'row-deleted' : ''}>
                        <td className="mono">{b.refNo}</td>
                        <td className="mono">{b.billNo || '—'}</td>
                        <td>{fmtD(b.billDate)}</td>
                        <td className="strong">{b.supplier?.name}{b.supplier?.group ? <span className="hint">{b.supplier.group}</span> : null}</td>
                        <td style={{ maxWidth: 240 }}>
                          {b.items.slice(0, 2).map((it, i) => <div key={i} style={{ fontSize: 12 }}>{it.qty} {it.unit} × {it.description}</div>)}
                          {b.items.length > 2 && <div className="subtle" style={{ fontSize: 11 }}>+{b.items.length - 2} more</div>}
                        </td>
                        <td style={{ fontSize: 12 }}>{b.storeTo === 'customer' ? <>🚚 {b.deliverTo || 'customer site'}</> : <>🏬 {b.warehouseLocation || 'warehouse'}</>}</td>
                        <td className="r strong">₹ {formatINR(b.grandTotal)}</td>
                        <td className="r">{deleted ? '—' : ap ? <span style={{ color: '#c0392b' }}>₹ {formatINR(ap.outstanding)}</span> : <span className="badge rq-approved">paid</span>}</td>
                        <td className="r">
                          <div className="row-actions">
                            {!deleted && <button className="btn xs" onClick={() => startEdit(b)}>Edit</button>}
                            {!deleted && <button className="btn xs danger" disabled={busy === `d${b.id}`} onClick={() => removeBill(b)}>✕</button>}
                            {deleted && <span className="badge cancelled">deleted</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── Suppliers register ── */}
      {tab === 'suppliers' && (
        <>
          {addingSup && (
            <section className="fsec" style={{ borderLeft: '4px solid var(--brand-green)' }}>
              <h3>{supEditId ? 'Edit Supplier' : 'New Supplier'}</h3>
              <div className="grid2">
                <label>Name *<input value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} /></label>
                <label>Supplier Group<input value={supForm.group} placeholder="e.g. Motors, Electricals, Hardware" onChange={(e) => setSupForm({ ...supForm, group: e.target.value })} /></label>
                <label>Contact Person<input value={supForm.contactPerson} onChange={(e) => setSupForm({ ...supForm, contactPerson: e.target.value })} /></label>
                <label>Phone<input value={supForm.phone} onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })} /></label>
                <label>Alt Phone<input value={supForm.altPhone} onChange={(e) => setSupForm({ ...supForm, altPhone: e.target.value })} /></label>
                <label>Email<input value={supForm.email} onChange={(e) => setSupForm({ ...supForm, email: e.target.value })} /></label>
                <label>GSTIN<input value={supForm.gstn} onChange={(e) => setSupForm({ ...supForm, gstn: e.target.value })} /></label>
                <label>State Code<input value={supForm.stateCode} placeholder="e.g. 33" onChange={(e) => setSupForm({ ...supForm, stateCode: e.target.value })} /></label>
                <label className="full">Address<textarea rows={2} value={(supForm.addressLines || []).join('\n')} placeholder="One line per row" onChange={(e) => setSupForm({ ...supForm, addressLines: e.target.value.split('\n') })} /></label>
                <label className="full">Supplier Notes<textarea rows={2} value={supForm.notes} placeholder="payment terms, lead time, quality notes…" onChange={(e) => setSupForm({ ...supForm, notes: e.target.value })} /></label>
              </div>
              <div style={{ marginTop: 12 }}>
                <button className="btn primary" disabled={busy === 'sup' || !supForm.name.trim()} onClick={saveSupplier}>{busy === 'sup' ? 'Saving…' : supEditId ? 'Save supplier' : 'Add to register'}</button>
              </div>
            </section>
          )}

          <div className="toolbar">
            <input className="search" placeholder="Search name, group, GSTIN, phone…" value={supQ} onChange={(e) => setSupQ(e.target.value)} />
          </div>
          <div className="card table-card">
            {supView.length === 0 ? (
              <div className="empty"><p>{suppliers.length === 0 ? 'No suppliers in the register yet — add your first one.' : 'No suppliers match the search.'}</p></div>
            ) : (
              <table className="data-table">
                <thead><tr>
                  <th className="sortable" onClick={() => supSortBy('name')}>Supplier{supArrow('name')}</th>
                  <th className="sortable" onClick={() => supSortBy('group')}>Group{supArrow('group')}</th>
                  <th>Contact</th>
                  <th>GSTIN</th>
                  <th>Notes</th>
                  <th className="r sortable" onClick={() => supSortBy('bills')}>Bills{supArrow('bills')}</th>
                  <th className="r sortable" onClick={() => supSortBy('total')}>Total Purchased{supArrow('total')}</th>
                  <th className="r">Actions</th>
                </tr></thead>
                <tbody>
                  {supView.map((s) => (
                    <tr key={s.id}>
                      <td className="strong">{s.name}</td>
                      <td>{s.group || '—'}</td>
                      <td style={{ fontSize: 12 }}>{s.contactPerson}{s.contactPerson && s.phone ? ' · ' : ''}{s.phone || (s.contactPerson ? '' : '—')}</td>
                      <td className="mono">{s.gstn || '—'}</td>
                      <td className="subtle" style={{ maxWidth: 200, fontSize: 12 }}>{s.notes || '—'}</td>
                      <td className="r">{s.billCount || 0}</td>
                      <td className="r strong">₹ {formatINR(s.totalPurchased || 0)}</td>
                      <td className="r">
                        <div className="row-actions">
                          <button className="btn xs" onClick={() => editSupplier(s)}>Edit</button>
                          <button className="btn xs" onClick={() => { setTab('bills'); setBilling(true); setEditId(null); setBill({ ...blankBill(), supplierId: s.id }); window.scrollTo({ top: 0 }); }}>+ Bill</button>
                          {s.billCount > 0
                            ? <button className="btn xs danger" disabled title="Supplier has purchase bills — delete those first">✕</button>
                            : <button className="btn xs danger" onClick={() => removeSupplier(s)}>✕</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
