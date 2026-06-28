import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const STATUS_COLORS = {
  draft: '#f3f4f6', dispatched: '#fef3ec', delivered: '#e7f6ec', cancelled: '#fde8e8',
};
const STATUS_TEXT = {
  draft: '#6b7280', dispatched: '#b9651a', delivered: '#1f8f4e', cancelled: '#c0392b',
};
const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; };

export default function DeliveryChallan() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const preInvoiceId = searchParams.get('invoiceId') ? Number(searchParams.get('invoiceId')) : null;
  const preInvoiceNo = searchParams.get('invoiceNo') || '';

  const [challans, setChallans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(!!preInvoiceId);
  const [invoices, setInvoices] = useState([]);
  const [invItems, setInvItems] = useState([]);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  const blankForm = {
    invoiceId: preInvoiceId || '',
    transporterName: '',
    vehicleNo: '',
    ewayBillNo: '',
    dispatchFrom: '',
    items: [{ description: '', qty: 1, unit: 'Nos', inventoryItemId: '' }],
    notes: '',
  };
  const [form, setForm] = useState(blankForm);

  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const data = await api.listDeliveryChallans(q);
      setChallans(data);
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isAdmin) api.listInvoices().then(setInvoices).catch(() => {});
  }, [isAdmin]);

  const loadInvItems = async (invoiceId) => {
    if (!invoiceId) { setInvItems([]); return; }
    try {
      const inv = await api.getInvoice(invoiceId);
      if (inv?.items) {
        setInvItems(inv.items);
        setForm((p) => ({
          ...p,
          invoiceId,
          items: inv.items.map((it) => ({
            description: it.description,
            qty: it.qty,
            unit: it.unit || 'Nos',
            inventoryItemId: it.inventoryItemId || '',
          })),
        }));
      }
    } catch { /* ignore */ }
  };

  const setItem = (i, patch) => setForm((p) => ({
    ...p, items: p.items.map((it, idx) => idx === i ? { ...it, ...patch } : it),
  }));
  const addItem = () => setForm((p) => ({
    ...p, items: [...p.items, { description: '', qty: 1, unit: 'Nos', inventoryItemId: '' }],
  }));
  const removeItem = (i) => setForm((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.items.some((it) => it.description.trim())) return flash('Add at least one item', 'err');
    setBusy(true);
    try {
      await api.createDeliveryChallan({
        ...form,
        invoiceId: form.invoiceId ? Number(form.invoiceId) : null,
        items: form.items.filter((it) => it.description.trim()).map((it) => ({
          ...it,
          qty: Number(it.qty) || 1,
          inventoryItemId: it.inventoryItemId ? Number(it.inventoryItemId) : null,
        })),
      });
      flash('Delivery Challan created');
      setForm(blankForm);
      setShowForm(false);
      await load();
    } catch (err) { flash(err.message, 'err'); }
    finally { setBusy(false); }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.updateDeliveryChallan(id, { status });
      flash(`Status updated to ${status}`);
      await load();
    } catch (e) { flash(e.message, 'err'); }
  };

  const view = challans;

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <button className="btn ghost" onClick={() => nav('/')}>&larr; Back</button>
          <h1 style={{ marginTop: 6 }}>Delivery Challans</h1>
          <p className="subtle">Track goods dispatched — linked to invoices or standalone.</p>
        </div>
        {isAdmin && <button className="btn primary" onClick={() => setShowForm((v) => !v)}>{showForm ? '✕ Close form' : '+ New DC'}</button>}
      </header>

      {showForm && (
        <section className="fsec">
          <h3>Create Delivery Challan {preInvoiceNo ? `— for Invoice ${preInvoiceNo}` : ''}</h3>
          <form onSubmit={submit}>
            <div className="grid2">
              <label>Linked Invoice (optional)
                <select value={form.invoiceId} onChange={(e) => { setForm((p) => ({ ...p, invoiceId: e.target.value })); loadInvItems(e.target.value); }}>
                  <option value="">— Standalone DC (no invoice link) —</option>
                  {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.invoiceNo} · {inv.buyerName}</option>)}
                </select>
              </label>
              <label>Dispatch From<input value={form.dispatchFrom} onChange={(e) => setForm((p) => ({ ...p, dispatchFrom: e.target.value }))} placeholder="e.g. Warehouse A, Coimbatore" /></label>
              <label>Transporter Name<input value={form.transporterName} onChange={(e) => setForm((p) => ({ ...p, transporterName: e.target.value }))} /></label>
              <label>Vehicle No<input value={form.vehicleNo} onChange={(e) => setForm((p) => ({ ...p, vehicleNo: e.target.value }))} placeholder="e.g. TN 11 AB 1234" /></label>
              <label>E-Way Bill No<input value={form.ewayBillNo} onChange={(e) => setForm((p) => ({ ...p, ewayBillNo: e.target.value }))} /></label>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <b>Items</b>
                <button type="button" className="btn xs" onClick={addItem}>+ Add item</button>
              </div>
              {form.items.map((it, i) => (
                <div key={i} className="item-card" style={{ marginBottom: 10 }}>
                  <div className="item-card-fields">
                    <label style={{ flex: 3 }}>Description
                      <input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                    </label>
                    <label>Qty<input type="number" step="any" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} /></label>
                    <label>Unit<input value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} /></label>
                    <button type="button" className="btn xs danger" onClick={() => removeItem(i)} disabled={form.items.length === 1}>✕</button>
                  </div>
                </div>
              ))}
            </div>

            <label style={{ marginTop: 8, display: 'block' }}>Notes
              <textarea rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </label>

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create DC'}</button>
              <button className="btn" type="button" onClick={() => { setForm(blankForm); setShowForm(false); }}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['all', 'draft', 'dispatched', 'delivered', 'cancelled'].map((s) => (
          <button key={s} className={`seg-toggle ${statusFilter === s ? 'on' : ''}`} onClick={() => setStatusFilter(s)}>
            {s === 'all' ? `All (${challans.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${challans.filter((c) => c.status === s).length})`}
          </button>
        ))}
      </div>

      <div className="card table-card">
        {loading ? <div className="empty">Loading…</div> : view.length === 0 ? (
          <div className="empty">
            <p>No delivery challans yet.</p>
            {isAdmin && <button className="btn primary" onClick={() => setShowForm(true)}>Create the first DC</button>}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>DC No</th><th>Invoice</th><th>Transporter</th><th>Vehicle</th><th>Date</th><th>Status</th>{isAdmin && <th className="r">Actions</th>}</tr>
            </thead>
            <tbody>
              {view.map((c) => (
                <tr key={c.id}>
                  <td className="strong mono">{c.dcNo}</td>
                  <td>{c.invoice ? <span className="badge" style={{ background: '#f0f9ff', color: '#0369a1' }}>{c.invoice.invoiceNo}</span> : <span className="subtle">—</span>}</td>
                  <td>{c.transporterName || '—'}</td>
                  <td className="mono">{c.vehicleNo || '—'}</td>
                  <td>{fmtDate(c.createdAt)}</td>
                  <td>
                    <span className="badge" style={{ background: STATUS_COLORS[c.status] || '#f3f4f6', color: STATUS_TEXT[c.status] || '#374151' }}>
                      {c.status}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="r">
                      <div className="row-actions">
                        {c.status === 'draft' && <button className="btn xs" onClick={() => updateStatus(c.id, 'dispatched')}>Mark Dispatched</button>}
                        {c.status === 'dispatched' && <button className="btn xs" style={{ background: '#e7f6ec', color: '#1f8f4e' }} onClick={() => updateStatus(c.id, 'delivered')}>Mark Delivered</button>}
                        {(c.status === 'draft' || c.status === 'dispatched') && (
                          <button className="btn xs danger" onClick={() => { if (confirm('Cancel this challan? Inventory will be restored.')) updateStatus(c.id, 'cancelled'); }}>Cancel</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
