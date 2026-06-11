import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';

const fmtD = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };

// General admin dashboard — KPIs across every module + to-do reminders.
export default function Overview() {
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [acc, setAcc] = useState(null);
  const [added, setAdded] = useState(() => new Set());

  useEffect(() => {
    api.getOverview().then(setD).catch(() => {});
    api.accOverview().then(setAcc).catch(() => {});
  }, []);

  if (!d) return <div className="page"><div className="empty">Loading dashboard…</div></div>;

  const KPI = ({ label, value, sub, to, accent }) => (
    <button className="acc-kpi kpi-big" onClick={() => nav(to)} style={accent ? { borderLeft: `4px solid ${accent}` } : {}}>
      <span>{label}</span><b>{value}</b>{sub && <i className="kpi-sub">{sub}</i>}
    </button>
  );

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Dashboard</h1><p className="subtle">Everything at a glance — click any card to open the module.</p></div>
        <button className="btn primary" onClick={() => nav('/new')}>+ New Invoice</button>
      </header>

      <div className="acc-kpis kpi-grid">
        <KPI label="Invoices" value={d.invoices.count} sub={`₹ ${formatINR(d.invoices.value)}`} to="/" accent="#E8732B" />
        {d.unpaidInvoices && <KPI label="Awaiting Payment (AR)" value={d.unpaidInvoices.count} sub={`₹ ${formatINR(d.unpaidInvoices.value)} outstanding`} to="/" accent={d.unpaidInvoices.count ? '#c0392b' : '#5B9B36'} />}
        <KPI label="Clients" value={d.clients} to="/clients" accent="#5B9B36" />
        <KPI label="Staff Present Today" value={`${d.presentToday} / ${d.employees}`} to="/staff" accent="#4f8fd5" />
        <KPI label="Approvals Pending" value={d.approvalsPending} sub="leaves + expenses" to="/staff-approvals" accent={d.approvalsPending ? '#c0392b' : '#5B9B36'} />
        <KPI label="Open Tasks" value={d.openTasks} to="/staff-tasks" accent="#e8a13b" />
        <KPI label="Site Visits (open)" value={d.siteVisitsOpen} to="/site-visits" accent="#7d3cb5" />
        <KPI label="Stock Items" value={d.stock.items} sub={d.stock.low ? `${d.stock.low} low stock` : 'all healthy'} to="/inventory" accent={d.stock.low ? '#c0392b' : '#5B9B36'} />
        <KPI label="Vouchers in Books" value={d.vouchers} to="/accounting" accent="#2a6fb0" />
        {acc && <KPI label={acc.netProfit >= 0 ? 'Net Profit (books)' : 'Net Loss (books)'} value={`₹ ${formatINR(Math.abs(acc.netProfit))}`} to="/accounting/reports" accent={acc.netProfit >= 0 ? '#5B9B36' : '#c0392b'} />}
        {acc && <KPI label="Cash & Bank" value={`₹ ${formatINR(acc.cashBank)}`} to="/accounting/ledgers" accent="#1f8f4e" />}
      </div>

      {/* Today's site-visit outcomes — assign follow-ups as tasks in one click */}
      {d.todayVisitOutcomes?.length > 0 && (
        <section className="fsec">
          <div className="fsec-head">
            <h3>Today's Site Visit Outcomes</h3>
            <button className="btn xs" onClick={() => nav('/site-visits')}>All visits →</button>
          </div>
          {d.todayVisitOutcomes.map((o) => (
            <div className="todo-row" key={o.id}>
              <div style={{ cursor: 'pointer' }} onClick={() => nav(`/site-visits/${o.visitId}`)}>
                <b>{o.customer || o.refNo}</b> <span className={`badge sv-${o.status || 'open'}`}>{o.status}</span>
                <div className="subtle" style={{ fontSize: 12 }}>T#{o.tranche} by {o.by} — {o.summary?.slice(0, 90)}{o.nextFollowUp ? ` · follow-up ${fmtD(o.nextFollowUp)}` : ''}</div>
              </div>
              {(o.status === 'follow-up' || o.nextFollowUp) && o.employeeId && (
                <button className="btn xs primary" disabled={added.has(o.id)} onClick={async () => {
                  try {
                    await api.assignTask({ employeeId: o.employeeId, title: `Follow-up visit: ${o.customer || o.refNo}`, description: `${o.refNo} — ${o.summary || ''}`, dueDate: o.nextFollowUp || '', priority: 'high' });
                    setAdded((p) => new Set([...p, o.id]));
                  } catch (e) { alert(e.message); }
                }}>{added.has(o.id) ? '✓ Task added' : `+ Task → ${o.employeeName || 'staff'}`}</button>
              )}
            </div>
          ))}
        </section>
      )}

      <div className="staff-grid">
        <section className="fsec">
          <div className="fsec-head">
            <h3>To-do & Reminders</h3>
            <button className="btn xs" onClick={() => nav('/staff-tasks')}>Open Tasks →</button>
          </div>
          {d.todos.length === 0 ? <p className="subtle">Nothing pending — all clear! 🎉</p> : (
            <div className="task-list">
              {d.todos.map((t) => (
                <div className={`todo-row pr-bd-${t.priority}`} key={t.id}>
                  <div>
                    <b>{t.title}</b>
                    <div className="subtle" style={{ fontSize: 12 }}>{t.who}{t.dueDate ? ` · due ${fmtD(t.dueDate)}` : ''}</div>
                  </div>
                  <span className={`badge pr-${t.priority}`}>{t.priority}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="fsec">
          <div className="fsec-head">
            <h3>Upcoming Follow-ups</h3>
            <button className="btn xs" onClick={() => nav('/site-visits')}>Site Visits →</button>
          </div>
          {d.followUps.length === 0 ? <p className="subtle">No follow-ups scheduled.</p> : (
            d.followUps.map((f) => (
              <div className="todo-row" key={f.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/site-visits/${f.id}`)}>
                <div><b>{f.customerName || f.refNo}</b><div className="subtle" style={{ fontSize: 12 }}>{f.refNo}</div></div>
                <span className="badge sv-follow-up">{fmtD(f.nextFollowUp)}</span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
