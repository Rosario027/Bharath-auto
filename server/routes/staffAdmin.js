// Admin oversight of everything staff submit: attendance logs, leave
// requests (approve/reject), expense claims (approve/reject + receipt view)
// and task assignment.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { adminRequired } from '../lib/auth.js';
import { isValidDate } from '../lib/dates.js';

const router = Router();
router.use(adminRequired);

const EMP_SEL = { select: { id: true, name: true } };

// ── Attendance log (per employee or all, latest first) ──
router.get('/attendance', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.employeeId) where.employeeId = Number(req.query.employeeId);
    if (/^\d{4}-\d{2}$/.test(req.query.month || '')) where.date = { startsWith: req.query.month };
    const records = await prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 120,
      include: { employee: EMP_SEL },
    });
    res.json(records);
  } catch (e) { next(e); }
});

// ── Leave requests ──
router.get('/leaves', async (req, res, next) => {
  try {
    const where = req.query.status ? { status: req.query.status } : {};
    const leaves = await prisma.leaveRequest.findMany({
      where, orderBy: [{ status: 'desc' }, { createdAt: 'desc' }], include: { employee: EMP_SEL },
    });
    res.json(leaves);
  } catch (e) { next(e); }
});

router.put('/leaves/:id', async (req, res, next) => {
  try {
    const { status, adminComment } = req.body || {};
    if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const leave = await prisma.leaveRequest.update({
      where: { id: Number(req.params.id) },
      data: { status, adminComment: adminComment ?? '' },
      include: { employee: EMP_SEL },
    });
    res.json(leave);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Leave request not found' });
    next(e);
  }
});

// ── Expense claims ──
router.get('/expenses', async (req, res, next) => {
  try {
    const where = req.query.status ? { status: req.query.status } : {};
    const claims = await prisma.expenseClaim.findMany({
      where,
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true, date: true, category: true, amount: true, description: true,
        status: true, adminComment: true, createdAt: true, employee: EMP_SEL,
      },
    });
    const withReceipt = await prisma.expenseClaim.findMany({ where: { receipt: { not: null } }, select: { id: true } });
    const ids = new Set(withReceipt.map((r) => r.id));
    res.json(claims.map((c) => ({ ...c, hasReceipt: ids.has(c.id) })));
  } catch (e) { next(e); }
});

router.get('/expenses/:id/receipt', async (req, res, next) => {
  try {
    const claim = await prisma.expenseClaim.findUnique({ where: { id: Number(req.params.id) }, select: { receipt: true } });
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    res.json({ dataUrl: claim.receipt || null });
  } catch (e) { next(e); }
});

router.put('/expenses/:id', async (req, res, next) => {
  try {
    const { status, adminComment } = req.body || {};
    if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const claim = await prisma.expenseClaim.update({
      where: { id: Number(req.params.id) },
      data: { status, adminComment: adminComment ?? '' },
      select: { id: true, status: true, adminComment: true },
    });
    res.json(claim);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Claim not found' });
    next(e);
  }
});

// ── Task assignment ──
router.get('/tasks', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.employeeId) where.employeeId = Number(req.query.employeeId);
    if (req.query.status) where.status = req.query.status;
    const tasks = await prisma.staffTask.findMany({
      where, orderBy: { createdAt: 'desc' }, include: { employee: EMP_SEL },
    });
    res.json(tasks);
  } catch (e) { next(e); }
});

router.post('/tasks', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!(b.title || '').trim()) return res.status(400).json({ error: 'Task title is required' });
    // employeeId empty/0 → the admin's own task ("self")
    let employeeId = null;
    if (b.employeeId) {
      const emp = await prisma.employee.findUnique({ where: { id: Number(b.employeeId) } });
      if (!emp) return res.status(404).json({ error: 'Employee not found' });
      employeeId = emp.id;
    }
    const task = await prisma.staffTask.create({
      data: {
        employeeId,
        title: b.title.trim(),
        description: (b.description || '').trim(),
        dueDate: isValidDate(b.dueDate) ? b.dueDate : null,
        priority: ['low', 'medium', 'high'].includes(b.priority) ? b.priority : 'medium',
        assignedBy: req.user.username,
      },
      include: { employee: EMP_SEL },
    });
    res.status(201).json(task);
  } catch (e) { next(e); }
});

router.put('/tasks/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const data = {};
    if (b.title !== undefined) data.title = b.title;
    if (b.description !== undefined) data.description = b.description;
    if (b.dueDate !== undefined) data.dueDate = isValidDate(b.dueDate) ? b.dueDate : null;
    if (b.status !== undefined) {
      if (!['assigned', 'processing', 'completed'].includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
      data.status = b.status;
    }
    const task = await prisma.staffTask.update({ where: { id: Number(req.params.id) }, data, include: { employee: EMP_SEL } });
    res.json(task);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Task not found' });
    next(e);
  }
});

router.delete('/tasks/:id', async (req, res, next) => {
  try {
    await prisma.staffTask.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Task not found' });
    next(e);
  }
});

// Counts for the admin staff dashboard + task pie chart.
router.get('/summary', async (req, res, next) => {
  try {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const [pendingLeaves, pendingExpenses, openTasks, assigned, processing, completed, adminTodo, upcoming] = await Promise.all([
      prisma.leaveRequest.count({ where: { status: 'pending' } }),
      prisma.expenseClaim.count({ where: { status: 'pending' } }),
      prisma.staffTask.count({ where: { status: { not: 'completed' } } }),
      prisma.staffTask.count({ where: { status: 'assigned' } }),
      prisma.staffTask.count({ where: { status: 'processing' } }),
      prisma.staffTask.count({ where: { status: 'completed' } }),
      prisma.staffTask.count({ where: { employeeId: null, status: { not: 'completed' } } }),
      prisma.staffTask.count({ where: { status: { not: 'completed' }, dueDate: { gte: todayStr } } }),
    ]);
    res.json({ pendingLeaves, pendingExpenses, openTasks, tasks: { assigned, processing, completed, adminTodo, upcoming } });
  } catch (e) { next(e); }
});

// ── Salary / compensation calculator ──
// Pay = perDay × present-on-working-days + perDay × multiplier × present-on-off-days.
// perDay = monthlySalary / workingDays (off-days per the employee's weekend policy).
router.get('/salary/:employeeId', async (req, res, next) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);

    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const isOff = (day) => {
      const dow = new Date(y, m - 1, day).getDay(); // 0=Sun, 6=Sat
      return (dow === 0 && emp.sunOff) || (dow === 6 && emp.satOff);
    };
    let workingDays = 0;
    for (let d = 1; d <= daysInMonth; d++) if (!isOff(d)) workingDays++;

    const records = await prisma.attendance.findMany({ where: { employeeId, date: { startsWith: month }, present: true } });
    let presentWorking = 0, presentOff = 0;
    for (const r of records) {
      const day = Number(r.date.slice(8));
      if (isOff(day)) presentOff++; else presentWorking++;
    }

    const leaves = await prisma.leaveRequest.count({ where: { employeeId, status: 'approved', fromDate: { lte: `${month}-31` }, toDate: { gte: `${month}-01` } } });

    const perDay = workingDays > 0 ? emp.monthlySalary / workingDays : 0;
    const basePay = perDay * presentWorking;
    const offDayPay = perDay * (emp.sunMultiplier || 1) * presentOff;
    const total = Math.round(basePay + offDayPay);

    res.json({
      month, monthlySalary: emp.monthlySalary, satOff: emp.satOff, sunOff: emp.sunOff, sunMultiplier: emp.sunMultiplier,
      daysInMonth, workingDays, presentWorking, presentOff, approvedLeaveRequests: leaves,
      perDay: Math.round(perDay * 100) / 100, basePay: Math.round(basePay), offDayPay: Math.round(offDayPay), total,
    });
  } catch (e) { next(e); }
});

export default router;
