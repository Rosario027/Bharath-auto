import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSettings } from '../App.jsx';
import { formatINR } from '../utils/money.js';

const blankClient = { name: '', addressLines: [], contactPerson: '', contactPhone: '', email: '', gstn: '', stateCode: '' };

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
}

export default function Clients() {
  const nav = useNavigate();
  const { settings } = useSettings();
  const sym = settings?.currencySymbol || '₹';

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [sel, setSel] = useState(() => new Set());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blankClient);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setClients(await api.listCustomers()); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const arrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');

  const view = useMemo(() => {
    const filtered = clients.filter((c) =>
      !q.trim() ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (c.gstn || '').toLowerCase().includes(q.toLowerCase()) ||
      (c.contactPhone || '').includes(q));
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (c) => {
      switch (sort.key) {
        case 'name': return c.name.toLowerCase();
        case 'added': return new Date(c.createdAt).getTime();
        case 'invoices': return c.invoiceCount || 0;
        case 'billed': return c.totalBilled || 0;
        default: return 0;
      }
    };
    return [...filtered].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * dir);
  }, [clients, q, sort]);

  const allSelected = view.length > 0 && view.every((c) => sel.has(c.id));
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(view.map((c) => c.id)));

  const addClient = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try { await api.createCustomer(form); setForm(blankClient); setAdding(false); await load(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const bulkDelete = async () => {
    if (sel.size === 0) return;
    if (!confirm(`Delete ${sel.size} selected client(s)? Their invoices stay in records.`)) return;
    setBusy(true);
    try {
      for (const id of sel) await api.deleteCustomer(id);
      setSel(new Set());
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Clients</h1>
          <p className="subtle">All customers you've billed — sort by any column, search, select in bulk.</p>
        </div>
        <button className="btn primary" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : '+ Add client'}</button>
      </header>

      {adding && (
        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div className="grid2">
            <label className="full">Name *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="full">Address<textarea rows={2} value={(form.addressLines || []).join('\n')} placeholder="One line per row" onChange={(e) => setForm({ ...form, addressLines: e.target.value.split('\n') })} /></label>
            <label>Contact Person<input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></label>
            <label>Contact Phone<input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></label>
            <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>GSTIN<input value={form.gstn} onChange={(e) => setForm({ ...form, gstn: e.target.value })} /></label>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={addClient} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save client'}</button>
          </div>
        </div>
      )}

      <div className="toolbar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="search" placeholder="Search name, GSTIN, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        {sel.size > 0 && (
          <button className="btn danger" disabled={busy} onClick={bulkDelete}>Delete selected ({sel.size})</button>
        )}
      </div>

      <div className="card table-card">
        {loading ? <div className="empty">Loading…</div> : view.length === 0 ? (
          <div className="empty"><p>No clients yet. They're added automatically when you raise an invoice, or add one above.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                <th className="sortable" onClick={() => sortBy('name')}>Name{arrow('name')}</th>
                <th>GSTIN</th>
                <th>Phone</th>
                <th className="sortable" onClick={() => sortBy('added')}>Added{arrow('added')}</th>
                <th className="r sortable" onClick={() => sortBy('invoices')}>Invoices{arrow('invoices')}</th>
                <th className="r sortable" onClick={() => sortBy('billed')}>Total Billed{arrow('billed')}</th>
              </tr>
            </thead>
            <tbody>
              {view.map((c) => (
                <tr key={c.id} className="row-click" onClick={() => nav(`/clients/${c.id}`)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} /></td>
                  <td className="strong">{c.name}</td>
                  <td className="mono">{c.gstn || '—'}</td>
                  <td>{c.contactPhone || '—'}</td>
                  <td>{fmtDate(c.createdAt)}</td>
                  <td className="r">{c.invoiceCount || 0}</td>
                  <td className="r strong">{sym} {formatINR(c.totalBilled || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
