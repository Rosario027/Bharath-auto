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

// Haversine distance in metres between two GPS coordinates
function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function checkGeofence(lat, lng) {
  if (!lat || !lng) return { withinZone: false, nearestZone: null, distanceM: null };
  const zones = await prisma.geofenceZone.findMany({ where: { active: true } });
  let nearest = null, minDist = Infinity;
  for (const z of zones) {
    const d = haversineMetres(lat, lng, z.lat, z.lng);
    if (d < minDist) { minDist = d; nearest = z; }
  }
  if (!nearest) return { withinZone: true, nearestZone: null, distanceM: null }; // no zones = unrestricted
  return { withinZone: minDist <= nearest.radiusM, nearestZone: nearest.name, distanceM: Math.round(minDist) };
}

// ── Clock in ──
router.post('/clock-in', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const d = localDate();
    const existing = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: d } } });
    if (existing?.clockIn) return res.status(400).json({ error: 'Already clocked in today.' });

    // Geofence check (BRD §3.2)
    const lat = req.body?.lat ? parseFloat(req.body.lat) : null;
    const lng = req.body?.lng ? parseFloat(req.body.lng) : null;
    const { withinZone, nearestZone, distanceM } = await checkGeofence(lat, lng);

    // Fetch geofence enforcement setting (if blockOutsideZone = true, reject; else flag)
    const settings = await prisma.companySettings.findUnique({ where: { id: 1 }, select: { id: true } }).catch(() => null);
    // We'll store as 'unverified' flag in the manual field for now (can be enhanced with a dedicated field)
    const flaggedOutside = !withinZone && lat !== null;

    const rec = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: emp.id, date: d } },
      create: { employeeId: emp.id, date: d, present: true, clockIn: new Date(), manual: flaggedOutside },
      update: { present: true, clockIn: new Date(), manual: flaggedOutside },
    });

    res.json({
      ...rec,
      geofence: { withinZone, nearestZone, distanceM, flaggedOutside },
    });
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
    // BRD §6.1: staff cannot edit dueDate directly
    if (b.status !== undefined) {
      if (!['assigned', 'processing', 'completed'].includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
      data.status = b.status;
    }
    if (b.staffComment !== undefined) data.staffComment = String(b.staffComment);
    const updated = await prisma.staffTask.update({ where: { id: task.id }, data });
    res.json(updated);
  } catch (e) { next(e); }
});

// ── Task Deadline Change Requests (BRD §6.1) ──
router.get('/task-deadline-requests', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const requests = await prisma.taskDeadlineRequest.findMany({
      where: { employeeId: emp.id },
      orderBy: { createdAt: 'desc' },
      include: { task: { select: { id: true, title: true, dueDate: true } } },
    });
    res.json(requests);
  } catch (e) { next(e); }
});

router.post('/task-deadline-requests', async (req, res, next) => {
  try {
    const emp = await myEmployee(req, res);
    if (!emp) return;
    const { taskId, proposedDate, reason } = req.body || {};
    if (!taskId) return res.status(400).json({ error: 'Task ID is required' });
    if (!proposedDate) return res.status(400).json({ error: 'Proposed date is required' });
    if (!(reason || '').trim()) return res.status(400).json({ error: 'Reason is required' });

    const task = await prisma.staffTask.findFirst({ where: { id: Number(taskId), employeeId: emp.id } });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status === 'completed') return res.status(400).json({ error: 'Cannot request deadline change for a completed task' });

    const reqRow = await prisma.$transaction(async (tx) => {
      const dr = await tx.taskDeadlineRequest.create({
        data: {
          taskId: task.id,
          employeeId: emp.id,
          originalDate: task.dueDate || '',
          proposedDate,
          reason: reason.trim(),
          status: 'pending',
        },
      });
      // Lock the task into pending_deadline_approval status
      await tx.staffTask.update({ where: { id: task.id }, data: { status: 'pending_deadline_approval' } });
      return dr;
    });
    res.status(201).json(reqRow);
  } catch (e) { next(e); }
});

export default router;
