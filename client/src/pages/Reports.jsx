import { useState } from 'react';
import { exporter } from '../api.js';

const d10 = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function presetRange(preset) {
  const now = new Date();
  if (preset === 'today') return { from: d10(now), to: d10(now) };
  if (preset === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - now.getDay());
    return { from: d10(start), to: d10(now) };
  }
  // month
  return { from: `${d10(now).slice(0, 7)}-01`, to: d10(now) };
}

export default function Reports() {
  const [preset, setPreset] = useState('month');
  const [{ from, to }, setRange] = useState(presetRange('month'));
  const [month, setMonth] = useState(d10(new Date()).slice(0, 7));
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000); };

  const pick = (p) => { setPreset(p); if (p !== 'custom') setRange(presetRange(p)); };

  const dl = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'sales') await exporter.salesReport(from, to);
      else if (kind === 'employees') await exporter.employeeReport(month);
      else await exporter.stockReport(from, to);
      flash('Report downloaded');
    } catch (e) { flash(e.message, 'err'); } finally { setBusy(''); }
  };

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div><h1>Reports</h1><p className="subtle">Download Excel reports — sales/GST (GSTR-1), employees and stock.</p></div>
      </header>

      <section className="fsec">
        <h3>Period Filter</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {['today', 'week', 'month', 'custom'].map((p) => (
            <button key={p} className={`seg-toggle ${preset === p ? 'on' : ''}`} onClick={() => pick(p)}>
              {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'Custom'}
            </button>
          ))}
          <label style={{ width: 160 }}>From<input type="date" value={from} onChange={(e) => { setPreset('custom'); setRange({ from: e.target.value, to }); }} /></label>
          <label style={{ width: 160 }}>To<input type="date" value={to} onChange={(e) => { setPreset('custom'); setRange({ from, to: e.target.value }); }} /></label>
        </div>
      </section>

      <div className="staff-grid">
        <section className="fsec">
          <h3>📑 GST / Sales Report (GSTR-1)</h3>
          <p className="subtle" style={{ fontSize: 13 }}>Excel with a summary sheet (total, B2B with GSTIN, B2C, credit & debit notes, tax split), B2B/B2C invoice registers, CN/DN register and an <b>HSN summary</b> with quantities sold.</p>
          <button className="btn primary" disabled={busy === 'sales'} onClick={() => dl('sales')}>{busy === 'sales' ? 'Preparing…' : '⬇ Download GST report'}</button>
        </section>

        <section className="fsec">
          <h3>📦 Stock Report</h3>
          <p className="subtle" style={{ fontSize: 13 }}>Current stock (item, quantity, location) plus all stock movements in the selected period.</p>
          <button className="btn primary" disabled={busy === 'stock'} onClick={() => dl('stock')}>{busy === 'stock' ? 'Preparing…' : '⬇ Download stock report'}</button>
        </section>
      </div>

      <section className="fsec">
        <h3>🧑‍💼 Employee Report (monthly)</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ width: 180 }}>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
          <button className="btn primary" disabled={busy === 'employees'} onClick={() => dl('employees')}>{busy === 'employees' ? 'Preparing…' : '⬇ Download employee report'}</button>
        </div>
        <p className="subtle" style={{ fontSize: 13, marginTop: 8 }}>Present / absent / clocked days per employee + the full daily log with work summaries.</p>
      </section>

    </div>
  );
}
