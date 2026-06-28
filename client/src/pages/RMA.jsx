import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const STATUS_MAP = {
  pending: { label: 'Pending', bg: '#fef9e7', color: '#b9651a' },
  under_inspection: { label: 'Under Inspection', bg: '#e8f4fd', color: '#2471a3' },
  replacement: { label: 'Replacement', bg: '#e7f6ec', color: '#1f8f4e' },
  repair: { label: 'Repair', bg: '#f0e6ff', color: '#7b3fa0' },
  scrapped: { label: 'Scrapped', bg: '#fde8e8', color: '#c0392b' },
  closed: { label: 'Closed', bg: '#f3f4f6', color: '#6b7280' },
};
const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; };

export default function RMA() {
  const { isAdmin } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState('');
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  const [form, setForm] = useState({
    invoiceId: '', customerId: '',
    items: [{ description: '', qty: 1, unit: 'Nos', issueDetails: '', inventoryItemId: '' }],
  });
  const [resolveForm, setResolveForm] = useState({ route: 'repair', creditNoteNarration: '' });
  const [statusUpdate, setStatusUpdate] = useState({ status: '', qaFindings: '', resolutionRoute: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      setTickets(await api.listRma(q));
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (isAdmin) {
      api.listInventory().then(setInventory).catch(() => {});
      api.listCustomers().then(setCustomers).catch(() => {});
      api.listInvoices().then(setInvoices).catch(() => {});
    }
  }, [isAdmin]);

  const loadDetail = async (id) => {
    try {
      const d = await api.getRma(id);
      setDetail(d);
      setStatusUpdate({ status: d.status, qaFindings: d.qaFindings || '', resolutionRoute: d.resolutionRoute || '' });
    } catch (e) { flash(e.message, 'err'); }
  };

  const selectTicket = (t) => { setSelected(t.id); loadDetail(t.id); };

  const setItem = (i, patch) => setForm((p) => ({
    ...p, items: p.items.map((it, idx) => idx === i ? { ...it, ...patch } : it),
  }));
  const addItem = () => setForm((p) => ({ ...p, items: [...p.items, { description: '', qty: 1, unit: 'Nos', issueDetails: '', inventoryItemId: '' }] }));
  const removeItem = (i) => setForm((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

  const submitCreate = async (e) => {
    e.preventDefault();
    setBusy('create');
    try {
      await api.createRma({
        invoiceId: form.invoiceId ? Number(form.invoiceId) : null,
        customerId: form.customerId ? Number(form.customerId) : null,
        items: form.items.filter((it) => it.description.trim()).map((it) => ({
          description: it.description,
          qty: Number(it.qty) || 1,
          unit: it.unit || 'Nos',
          issueDetails: it.issueDetails,
          inventoryItemId: it.inventoryItemId ? Number(it.inventoryItemId) : null,
        })),
      });
      flash('RMA ticket raised');
      setForm({ invoiceId: '', customerId: '', items: [{ description: '', qty: 1, unit: 'Nos', issueDetails: '', inventoryItemId: '' }] });
      setShowCreate(false);
      await load();
    } catch (err) { flash(err.message, 'err'); }
    finally { setBusy(''); }
  };

  const saveUpdate = async () => {
    if (!detail) return;
    setBusy('update');
    try {
      await api.updateRma(detail.id, { status: statusUpdate.status, qaFindings: statusUpdate.qaFindings });
      flash('Ticket updated');
      await loadDetail(detail.id);
      await load();
    } catch (e) { flash(e.message, 'err'); }
    finally { setBusy(''); }
  };

  const resolve = async () => {
    if (!detail) return;
    if (!confirm(`Resolve ticket via "${resolveForm.route}"? This will update inventory/accounting.`)) return;
    setBusy('resolve');
    try {
      await api.resolveRma(detail.id, resolveForm);
      flash('RMA resolved');
      await loadDetail(detail.id);
      await load();
    } catch (e) { flash(e.message, 'err'); }
    finally { setBusy(''); }
  };

  const view = statusFilter === 'all' ? tickets : tickets.filter((t) => t.status === statusFilter);

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div><h1>RMA — Returns & Repairs</h1><p className="subtle">Return merchandise authorisation — full lifecycle from receipt to resolution.</p></div>
        <button className="btn primary" onClick={() => setShowCreate((v) => !v)}>{showCreate ? '✕ Close' : '+ Raise RMA'}</button>
      </header>

      {showCreate && (
        <section className="fsec">
          <h3>Raise new RMA ticket</h3>
          <form onSubmit={submitCreate}>
            <div className="grid2">
              <label>Linked Invoice (optional)
                <select value={form.invoiceId} onChange={(e) => setForm((p) => ({ ...p, invoiceId: e.target.value }))}>
                  <option value="">— No invoice link —</option>
                  {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.invoiceNo} · {inv.buyerName}</option>)}
                </select>
              </label>
              <label>Customer (optional)
                <select value={form.customerId} onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))}>
                  <option value="">— Select customer —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <b>Returned Items</b>
                <button type="button" className="btn xs" onClick={addItem}>+ Add item</button>
              </div>
              {form.items.map((it, i) => (
                <div key={i} className="item-card" style={{ marginBottom: 10 }}>
                  <div className="item-card-fields" style={{ flexWrap: 'wrap' }}>
                    <label style={{ flex: 2 }}>Description<input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} /></label>
                    <label>Qty<input type="number" min="1" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} /></label>
                    <label>Unit<input value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} /></label>
                    {inventory.length > 0 && (
                      <label>Inventory Link
                        <select value={it.inventoryItemId} onChange={(e) => setItem(i, { inventoryItemId: e.target.value })}>
                          <option value="">— None —</option>
                          {inventory.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </label>
                    )}
                    <label style={{ flex: 3 }}>Issue Details<input value={it.issueDetails} placeholder="Describe the defect / reason for return" onChange={(e) => setItem(i, { issueDetails: e.target.value })} /></label>
                    <button type="button" className="btn xs danger" onClick={() => removeItem(i)} disabled={form.items.length === 1}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button className="btn primary" type="submit" disabled={busy === 'create'}>{busy === 'create' ? 'Raising…' : 'Raise RMA'}</button>
              <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: detail ? '1fr 420px' : '1fr', gap: 16 }}>
        <div>
          <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {['all', 'pending', 'under_inspection', 'replacement', 'repair', 'scrapped', 'closed'].map((s) => (
              <button key={s} className={`seg-toggle ${statusFilter === s ? 'on' : ''}`} onClick={() => { setStatusFilter(s); setDetail(null); }}>
                {s === 'all' ? `All (${tickets.length})` : (STATUS_MAP[s]?.label || s) + ` (${tickets.filter((t) => t.status === s).length})`}
              </button>
            ))}
          </div>

          <div className="card table-card">
            {loading ? <div className="empty">Loading…</div> : view.length === 0 ? (
              <div className="empty">No RMA tickets.</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>RMA No</th><th>Customer</th><th>Invoice</th><th>Items</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {view.map((t) => (
                    <tr key={t.id} className={`row-click ${selected === t.id ? 'selected' : ''}`} onClick={() => selectTicket(t)}>
                      <td className="strong mono">{t.rmaNo}</td>
                      <td>{t.customer?.name || '—'}</td>
                      <td>{t.invoice?.invoiceNo || '—'}</td>
                      <td>{t.items?.length || 0}</td>
                      <td>
                        <span className="badge" style={{ background: STATUS_MAP[t.status]?.bg, color: STATUS_MAP[t.status]?.color }}>
                          {STATUS_MAP[t.status]?.label || t.status}
                        </span>
                      </td>
                      <td>{fmtDate(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {detail && (
          <div className="fsec" style={{ alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{detail.rmaNo}</h3>
              <button className="btn xs" onClick={() => setDetail(null)}>✕ Close</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              {detail.customer && <div><b>Customer:</b> {detail.customer.name}{detail.customer.contactPhone ? ` · ${detail.customer.contactPhone}` : ''}</div>}
              {detail.invoice && <div><b>Invoice:</b> {detail.invoice.invoiceNo} — {detail.invoice.buyerName}</div>}
              <div><b>Raised by:</b> {detail.raisedBy} on {fmtDate(detail.createdAt)}</div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <b>Returned Items:</b>
              <ul style={{ margin: '4px 0 0 0', paddingLeft: 18 }}>
                {detail.items?.map((it, i) => (
                  <li key={i} style={{ fontSize: 13 }}>{it.qty} × {it.description}{it.issueDetails ? ` — "${it.issueDetails}"` : ''}</li>
                ))}
              </ul>
            </div>

            {isAdmin && (
              <>
                <div className="grid2" style={{ marginBottom: 10 }}>
                  <label>Status
                    <select value={statusUpdate.status} onChange={(e) => setStatusUpdate((p) => ({ ...p, status: e.target.value }))}>
                      {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </label>
                </div>
                <label style={{ display: 'block', marginBottom: 10 }}>QA Findings
                  <textarea rows={3} value={statusUpdate.qaFindings} onChange={(e) => setStatusUpdate((p) => ({ ...p, qaFindings: e.target.value }))} placeholder="Describe QA inspection findings…" />
                </label>
                <button className="btn primary" onClick={saveUpdate} disabled={busy === 'update'} style={{ marginBottom: 12 }}>
                  {busy === 'update' ? 'Saving…' : 'Save Update'}
                </button>

                {!['replacement', 'repair', 'scrapped', 'closed'].includes(detail.status) && (
                  <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                    <b style={{ display: 'block', marginBottom: 8 }}>Resolve Ticket</b>
                    <label>Resolution Route
                      <select value={resolveForm.route} onChange={(e) => setResolveForm((p) => ({ ...p, route: e.target.value }))}>
                        <option value="repair">Repair — send for service</option>
                        <option value="replacement">Replacement — issue from stock</option>
                        <option value="scrap">Scrap — create credit note</option>
                      </select>
                    </label>
                    {resolveForm.route === 'scrap' && (
                      <label style={{ display: 'block', marginTop: 8 }}>Credit Note Narration
                        <input value={resolveForm.creditNoteNarration} onChange={(e) => setResolveForm((p) => ({ ...p, creditNoteNarration: e.target.value }))} placeholder="Auto-generated if blank" />
                      </label>
                    )}
                    <button className="btn" style={{ marginTop: 8 }} onClick={resolve} disabled={busy === 'resolve'}>
                      {busy === 'resolve' ? 'Processing…' : `Resolve via ${resolveForm.route}`}
                    </button>
                  </div>
                )}

                {detail.creditNote && (
                  <div style={{ marginTop: 10, padding: '8px 10px', background: '#fef9e7', borderRadius: 6, fontSize: 13 }}>
                    Credit Note created: <b>{detail.creditNote.voucherNo}</b>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
