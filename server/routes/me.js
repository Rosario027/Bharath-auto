// Staff self-service: clock in/out, attendance calendar, leave requests,
// expense claims and assigned tasks. Any logged-in user with a linked
// Employee profile can use these — they only ever see their OWN data.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';
import { localDate, isValidDate } from '../lib/dates.js';

const router = Router();
router.use(authRequired);

// Resolve the employee linked to the logged-in user (or 404).
async function myEmployee(req, res) {
  const user = await prisma.user.findUnique({
    where: { username: req.user.username },
    include: { employee: true },
  });
  if (!user?.employee) {
    res.status(404).json({ error: 'No staff profile is linked to this login.' });
    return null;
  }
  return user.employee;
}

function dataUrlBytes(dataUrl) {
  const i = (dataUrl || '').indexOf(',');
  if (i < 0) return Infinity;
  return Math.floor(((dataUrl.length - i - 1) * 3) / 4);
}

// ── Profile + today's attendance ──
router.get('/profile', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const todayRec = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: emp.id, date: localDate() } },
    });
    res.json({
      employee: { id: emp.id, name: emp.name },
      today: todayRec || null,
      date: localDate(),
    });
  } catch (e) { next(e); }
});

// ── Attendance calendar (one month) ──
router.get('/attendance', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : localDate().slice(0, 7);
    const records = await prisma.attendance.findMany({
      where: { employeeId: emp.id, date: { startsWith: month } },
      orderBy: { date: 'asc' },
    });
    res.json({ month, records });
  } catch (e) { next(e); }
});

// ── Clock in ──
router.post('/clock-in', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const d = localDate();
    const existing = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: d } } });
    if (existing?.clockIn) return res.status(400).json({ error: 'Already clocked in today.' });
    const rec = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: emp.id, date: d } },
      create: { employeeId: emp.id, date: d, present: true, clockIn: new Date() },
      update: { present: true, clockIn: new Date(), manual: false },
    });
    res.json(rec);
  } catch (e) { next(e); }
});

// ── Clock out (mandatory work summary) ──
router.post('/clock-out', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const summary = (req.body?.workSummary || '').trim();
    if (!summary) return res.status(400).json({ error: 'Please add a brief description of the tasks you did today.' });
    const d = localDate();
    const existing = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: d } } });
    if (!existing?.clockIn) return res.status(400).json({ error: 'Clock in first (or mark a full day).' });
    if (existing.clockOut) return res.status(400).json({ error: 'Already clocked out today.' });
    const rec = await prisma.attendance.update({
      where: { employeeId_date: { employeeId: emp.id, date: d } },
      data: { clockOut: new Date(), workSummary: summary },
    });
    res.json(rec);
  } catch (e) { next(e); }
});

// ── Manual full-day attendance (missed clock in/out) — summary mandatory ──
router.post('/full-day', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const summary = (req.body?.workSummary || '').trim();
    if (!summary) return res.status(400).json({ error: 'A brief description of the day\'s work is required.' });
    const d = isValidDate(req.body?.date) ? req.body.date : localDate();
    if (d > localDate()) return res.status(400).json({ error: 'Cannot mark attendance for a future date.' });
    const rec = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: emp.id, date: d } },
      create: { employeeId: emp.id, date: d, present: true, manual: true, workSummary: summary },
      update: { present: true, manual: true, workSummary: summary },
    });
    res.json(rec);
  } catch (e) { next(e); }
});

// ── Attendance day detail + missed-day update requests ──
router.get('/attendance/:date', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const date = req.params.date;
    if (!isValidDate(date)) return res.status(400).json({ error: 'Invalid date' });
    const [record, request] = await Promise.all([
      prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date } } }),
      prisma.attendanceRequest.findUnique({ where: { employeeId_date: { employeeId: emp.id, date } } }),
    ]);
    res.json({ date, record, request });
  } catch (e) { next(e); }
});

router.get('/attendance-requests', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    res.json(await prisma.attendanceRequest.findMany({ where: { employeeId: emp.id }, orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

router.post('/attendance-requests', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const { date, workSummary } = req.body || {};
    if (!isValidDate(date)) return res.status(400).json({ error: 'Pick a valid date' });
    if (date > localDate()) return res.status(400).json({ error: 'Cannot request attendance for a future date' });
    if (!(workSummary || '').trim()) return res.status(400).json({ error: 'Describe the work you did that day' });
    const existing = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date } } });
    if (existing?.present) return res.status(400).json({ error: 'You are already marked present on that day' });
    const reqRow = await prisma.attendanceRequest.upsert({
      where: { employeeId_date: { employeeId: emp.id, date } },
      create: { employeeId: emp.id, date, workSummary: workSummary.trim() },
      update: { workSummary: workSummary.trim(), status: 'pending', adminComment: '' },
    });
    res.status(201).json(reqRow);
  } catch (e) { next(e); }
});

// ── Leave requests ──
router.get('/leaves', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    res.json(await prisma.leaveRequest.findMany({ where: { employeeId: emp.id }, orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

router.post('/leaves', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const { fromDate, toDate, reason } = req.body || {};
    if (!isValidDate(fromDate) || !isValidDate(toDate)) return res.status(400).json({ error: 'Pick valid from/to dates.' });
    if (toDate < fromDate) return res.status(400).json({ error: '"To" date cannot be before "From" date.' });
    if (!(reason || '').trim()) return res.status(400).json({ error: 'Please give a reason for the leave.' });
    const leave = await prisma.leaveRequest.create({
      data: { employeeId: emp.id, fromDate, toDate, reason: reason.trim() },
    });
    res.status(201).json(leave);
  } catch (e) { next(e); }
});

// ── Expense claims ──
router.get('/expenses', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const list = await prisma.expenseClaim.findMany({
      where: { employeeId: emp.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, date: true, category: true, amount: true, description: true, status: true, adminComment: true, createdAt: true },
    });
    const withReceipt = await prisma.expenseClaim.findMany({
      where: { employeeId: emp.id, receipt: { not: null } },
      select: { id: true },
    });
    const ids = new Set(withReceipt.map((r) => r.id));
    res.json(list.map((x) => ({ ...x, hasReceipt: ids.has(x.id) })));
  } catch (e) { next(e); }
});

router.post('/expenses', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const b = req.body || {};
    if (!isValidDate(b.date)) return res.status(400).json({ error: 'Pick a valid expense date.' });
    if (!(Number(b.amount) > 0)) return res.status(400).json({ error: 'Enter the claim amount.' });
    if (!(b.description || '').trim()) return res.status(400).json({ error: 'Describe the expense in detail.' });
    if (b.receipt) {
      if (!b.receipt.startsWith('data:image/')) return res.status(400).json({ error: 'Receipt must be an image file.' });
      if (dataUrlBytes(b.receipt) > 2 * 1024 * 1024) return res.status(400).json({ error: 'Receipt image exceeds 2 MB.' });
    }
    const claim = await prisma.expenseClaim.create({
      data: {
        employeeId: emp.id,
        date: b.date,
        category: (b.category || 'Travel').trim(),
        amount: Number(b.amount),
        description: b.description.trim(),
        receipt: b.receipt || null,
      },
    });
    res.status(201).json({ ...claim, receipt: undefined, hasReceipt: !!claim.receipt });
  } catch (e) { next(e); }
});

router.get('/expenses/:id/receipt', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const claim = await prisma.expenseClaim.findFirst({ where: { id: Number(req.params.id), employeeId: emp.id }, select: { receipt: true } });
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    res.json({ dataUrl: claim.receipt || null });
  } catch (e) { next(e); }
});

// ── Assigned tasks ──
router.get('/tasks', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    res.json(await prisma.staffTask.findMany({ where: { employeeId: emp.id }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] }));
  } catch (e) { next(e); }
});

router.put('/tasks/:id', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const task = await prisma.staffTask.findFirst({ where: { id: Number(req.params.id), employeeId: emp.id } });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const b = req.body || {};
    const data = {};
    if (b.status !== undefined) {
      if (!['assigned', 'processing', 'completed'].includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
      data.status = b.status;
    }
    if (b.staffComment !== undefined) data.staffComment = String(b.staffComment);
    const updated = await prisma.staffTask.update({ where: { id: task.id }, data });
    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
