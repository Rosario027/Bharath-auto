import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSettings } from '../App.jsx';
import { formatINR } from '../utils/money.js';

const blankClient = { name: '', addressLines: [], contactPerson: '', contactPhone: '', email: '', gstn: '', stateCode: '' };

export default function Clients() {
  const nav = useNavigate();
  const { settings } = useSettings();
  const sym = settings?.currencySymbol || '₹';

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blankClient);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setClients(await api.listCustomers()); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => {
    let list = clients.filter((c) =>
      !q.trim() ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (c.gstn || '').toLowerCase().includes(q.toLowerCase()) ||
      (c.contactPhone || '').includes(q));
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'invoices') return (b.invoiceCount || 0) - (a.invoiceCount || 0);
      if (sort === 'billed') return (b.totalBilled || 0) - (a.totalBilled || 0);
      return 0;
    });
    return list;
  }, [clients, q, sort]);

  const addClient = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await api.createCustomer(form);
      setForm(blankClient);
      setAdding(false);
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Clients</h1>
          <p className="subtle">All customers you've billed — search, sort and open for full history.</p>
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

      <div className="toolbar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input className="search" placeholder="Search name, GSTIN, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 'auto' }}>
          <option value="name">Sort: Name</option>
          <option value="invoices">Sort: Most invoices</option>
          <option value="billed">Sort: Highest billed</option>
        </select>
      </div>

      <div className="card table-card">
        {loading ? <div className="empty">Loading…</div> : view.length === 0 ? (
          <div className="empty"><p>No clients yet. They're added automatically when you raise an invoice, or add one above.</p></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>GSTIN</th><th>Phone</th><th className="r">Invoices</th><th className="r">Total Billed</th></tr></thead>
            <tbody>
              {view.map((c) => (
                <tr key={c.id} className="row-click" onClick={() => nav(`/clients/${c.id}`)}>
                  <td className="strong">{c.name}</td>
                  <td className="mono">{c.gstn || '—'}</td>
                  <td>{c.contactPhone || '—'}</td>
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
