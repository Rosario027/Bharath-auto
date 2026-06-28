import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';
import { VTYPE_LABELS } from './Accounting.jsx';

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const blankLine = () => ({ ledgerId: '', side: 'dr', amount: '' });
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export default function AccVoucherEntry() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const isEdit = !!id;

  const [ledgers, setLedgers] = useState([]);
  const [vtype, setVtype] = useState(params.get('type') || 'journal');
  const [date, setDate] = useState(todayStr());
  const [narration, setNarration] = useState('');
  const [refNo, setRefNo] = useState('');
  const [voucherNo, setVoucherNo] = useState('');
  const [lines, setLines] = useState([blankLine(), { ...blankLine(), side: 'cr' }]);
  const [edits, setEdits] = useState([]);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => { api.accLedgers().then(setLedgers).catch(() => {}); }, []);
  useEffect(() => {
    if (!isEdit) return;
    api.accVoucher(id).then((v) => {
      setVtype(v.vtype); setDate(v.date); setNarration(v.narration); setRefNo(v.refNo); setVoucherNo(v.voucherNo);
      setAuto(!!v.sourceInvoiceId); setEdits(v.edits || []);
      setLines(v.lines.map((l) => ({ ledgerId: l.ledgerId, side: l.debit > 0 ? 'dr' : 'cr', amount: l.debit > 0 ? l.debit : l.credit })));
    }).catch((e) => flash(e.message, 'err'));
  }, [id, isEdit]);

  const setLine = (i, patch) => setLines((p) => p.map((l, x) => (x === i ? { ...l, ...patch } : l)));
  const addLine = (side) => setLines((p) => [...p, { ...blankLine(), side }]);
  const removeLine = (i) => setLines((p) => (p.length > 2 ? p.filter((_, x) => x !== i) : p));

  const drTotal = useMemo(() => r2(lines.filter((l) => l.side === 'dr').reduce((s, l) => s + (Number(l.amount) || 0), 0)), [lines]);
  const crTotal = useMemo(() => r2(lines.filter((l) => l.side === 'cr').reduce((s, l) => s + (Number(l.amount) || 0), 0)), [lines]);
  const balanced = drTotal === crTotal && drTotal > 0;

  const save = async () => {
    if (!balanced) return flash(`Voucher must balance — Dr ₹${formatINR(drTotal)} vs Cr ₹${formatINR(crTotal)}`, 'err');
    setBusy(true);
    const payload = {
      vtype, date, narration, refNo,
      lines: lines.map((l) => ({ ledgerId: l.ledgerId, debit: l.side === 'dr' ? Number(l.amount) || 0 : 0, credit: l.side === 'cr' ? Number(l.amount) || 0 : 0 })),
    };
    try {
      if (isEdit) { await api.accUpdateVoucher(id, payload); flash('Voucher updated — change recorded in the audit log'); const v = await api.accVoucher(id); setEdits(v.edits || []); }
      else { const v = await api.accCreateVoucher(payload); flash(`Saved ${v.voucherNo}`); nav(`/accounting/voucher/${v.id}`, { replace: true }); }
    } catch (e) { flash(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const fmtDT = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <button className="btn ghost" onClick={() => nav('/accounting')}>&larr; Accounting</button>
          <h1 style={{ marginTop: 6 }}>{isEdit ? `${voucherNo} · ${VTYPE_LABELS[vtype]}` : 'New Voucher'}</h1>
          {auto && <p className="subtle">Auto-posted from billing — edits here are logged but the source invoice stays unchanged.</p>}
        </div>
        <button className="btn primary" disabled={busy || !balanced} onClick={save}>{busy ? 'Saving…' : (isEdit ? 'Update (logs change)' : 'Save Voucher')}</button>
      </header>

      <section className="fsec">
        <h3>Voucher Details</h3>
        <div className="grid2">
          <label>Type
            <select value={vtype} disabled={isEdit} onChange={(e) => setVtype(e.target.value)}>
              {Object.entries(VTYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Reference / Bill No<input value={refNo} onChange={(e) => setRefNo(e.target.value)} /></label>
          <label className="full">Narration<input value={narration} placeholder="Being …" onChange={(e) => setNarration(e.target.value)} /></label>
        </div>
      </section>

      <section className="fsec">
        <div className="fsec-head">
          <h3>Entries <span className="hint">double entry — Dr must equal Cr</span></h3>
          <div className="fsec-tools">
            <button className="btn xs" onClick={() => addLine('dr')}>+ Dr line</button>
            <button className="btn xs" onClick={() => addLine('cr')}>+ Cr line</button>
          </div>
        </div>
        <div className="vline-head"><span>Dr/Cr</span><span>Ledger (Particulars)</span><span className="r">Amount (₹)</span><span></span></div>
        {lines.map((l, i) => (
          <div className="vline" key={i}>
            <div className="drcr-toggle">
              <button className={l.side === 'dr' ? 'on dr' : ''} onClick={() => setLine(i, { side: 'dr' })}>Dr</button>
              <button className={l.side === 'cr' ? 'on cr' : ''} onClick={() => setLine(i, { side: 'cr' })}>Cr</button>
            </div>
            <select value={l.ledgerId} onChange={(e) => setLine(i, { ledgerId: Number(e.target.value) })}>
              <option value="">Select ledger…</option>
              {ledgers.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.group?.name})</option>)}
            </select>
            <input type="number" step="any" className="r" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} />
            <button className="btn xs danger" disabled={lines.length <= 2} onClick={() => removeLine(i)}>✕</button>
          </div>
        ))}
        <div className={`vtotals ${balanced ? 'ok' : 'bad'}`}>
          <span>Dr Total: <b>₹ {formatINR(drTotal)}</b></span>
          <span>Cr Total: <b>₹ {formatINR(crTotal)}</b></span>
          <span>{balanced ? '✓ Balanced' : `✕ Difference ₹ ${formatINR(Math.abs(drTotal - crTotal))}`}</span>
        </div>
      </section>

      {isEdit && edits.length > 0 && (
        <section className="fsec">
          <h3>Audit Trail <span className="hint">MCA Rule 11(g) — every change is recorded</span></h3>
          <ul className="edit-log">
            {edits.map((e) => (
              <li key={e.id}><span className="el-time">{fmtDT(e.changedAt)}</span><span className="el-sum">{e.summary} — by {e.byUsername}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
