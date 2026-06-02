import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, exporter } from '../api.js';
import { useSettings } from '../App.jsx';
import { formatINR } from '../utils/money.js';

function fmtDate(d) {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
}

export default function ClientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { settings } = useSettings();
  const sym = settings?.currencySymbol || '₹';

  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(() => new Set());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('date');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setClient(await api.getCustomer(id)); } catch (e) { alert(e.message); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const invoices = useMemo(() => {
    if (!client) return [];
    let list = client.invoices.filter((i) => !q.trim() || i.invoiceNo.toLowerCase().includes(q.toLowerCase()));
    list = [...list].sort((a, b) => {
      if (sort === 'date') return new Date(b.invoiceDate) - new Date(a.invoiceDate);
      if (sort === 'amount') return (b.grandTotal || 0) - (a.grandTotal || 0);
      if (sort === 'no') return a.invoiceNo.localeCompare(b.invoiceNo);
      return 0;
    });
    return list;
  }, [client, q, sort]);

  const totalBilled = useMemo(() => (client?.invoices || []).reduce((s, i) => s + (i.grandTotal || 0), 0), [client]);

  const toggle = (iid) => setSel((p) => { const n = new Set(p); n.has(iid) ? n.delete(iid) : n.add(iid); return n; });
  const allSelected = invoices.length > 0 && invoices.every((i) => sel.has(i.id));
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(invoices.map((i) => i.id)));

  const downloadSelected = async (kind) => {
    const ids = invoices.filter((i) => sel.has(i.id));
    if (ids.length === 0) return alert('Select at least one invoice.');
    setBusy(true);
    try {
      for (const inv of ids) {
        await (kind === 'pdf'
          ? exporter.pdfById(inv.id, `${inv.invoiceNo}.pdf`)
          : exporter.docxById(inv.id, `${inv.invoiceNo}.docx`));
        await new Promise((r) => setTimeout(r, 300)); // stagger so the browser allows multiple downloads
      }
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  if (loading) return <div className="page"><div className="empty">Loading…</div></div>;
  if (!client) return <div className="page"><div className="empty">Client not found.</div></div>;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <button className="btn ghost" onClick={() => nav('/clients')}>&larr; Clients</button>
          <h1 style={{ marginTop: 6 }}>{client.name}</h1>
        </div>
        <button className="btn primary" onClick={() => nav(`/new?client=${client.id}`)}>+ New invoice for this client</button>
      </header>

      <div className="client-card card">
        <div className="client-grid">
          <div><span>GSTIN</span><b>{client.gstn || '—'}</b></div>
          <div><span>Contact Person</span><b>{client.contactPerson || '—'}</b></div>
          <div><span>Phone</span><b>{client.contactPhone || '—'}</b></div>
          <div><span>Email</span><b>{client.email || '—'}</b></div>
          <div className="full"><span>Address</span><b>{(client.addressLines || []).join(', ') || '—'}</b></div>
        </div>
        <div className="client-stats">
          <div><span>Invoices</span><b>{client.invoices.length}</b></div>
          <div><span>Total Billed</span><b>{sym} {formatINR(totalBilled)}</b></div>
        </div>
      </div>

      <h3 style={{ margin: '20px 0 10px' }}>Invoices</h3>
      <div className="toolbar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="search" placeholder="Search invoice no…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 'auto' }}>
          <option value="date">Sort: Date</option>
          <option value="amount">Sort: Amount</option>
          <option value="no">Sort: Invoice no</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy || sel.size === 0} onClick={() => downloadSelected('pdf')}>Download selected PDF ({sel.size})</button>
          <button className="btn" disabled={busy || sel.size === 0} onClick={() => downloadSelected('docx')}>Word</button>
        </div>
      </div>

      <div className="card table-card">
        {invoices.length === 0 ? <div className="empty">No invoices for this client yet.</div> : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                <th>Invoice No</th><th>Date</th><th className="r">Amount</th><th>Status</th><th className="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(inv.id)} onChange={() => toggle(inv.id)} /></td>
                  <td className="mono row-click" onClick={() => nav(`/invoice/${inv.id}`)}>{inv.invoiceNo}</td>
                  <td>{fmtDate(inv.invoiceDate)}</td>
                  <td className="r strong">{sym} {formatINR(inv.grandTotal)}</td>
                  <td><span className={`badge ${inv.status}`}>{inv.status}</span></td>
                  <td className="r">
                    <div className="row-actions">
                      <button className="btn xs" onClick={() => exporter.pdfById(inv.id, `${inv.invoiceNo}.pdf`)}>PDF</button>
                      <button className="btn xs" onClick={() => exporter.docxById(inv.id, `${inv.invoiceNo}.docx`)}>Word</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
