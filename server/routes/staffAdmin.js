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
    if (!b.employeeId) return res.status(400).json({ error: 'Pick a staff member' });
    if (!(b.title || '').trim()) return res.status(400).json({ error: 'Task title is required' });
    const emp = await prisma.employee.findUnique({ where: { id: Number(b.employeeId) } });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const task = await prisma.staffTask.create({
      data: {
        employeeId: emp.id,
        title: b.title.trim(),
        description: (b.description || '').trim(),
        dueDate: isValidDate(b.dueDate) ? b.dueDate : null,
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

// Counts for the admin staff dashboard.
router.get('/summary', async (req, res, next) => {
  try {
    const [pendingLeaves, pendingExpenses, openTasks] = await Promise.all([
      prisma.leaveRequest.count({ where: { status: 'pending' } }),
      prisma.expenseClaim.count({ where: { status: 'pending' } }),
      prisma.staffTask.count({ where: { status: { not: 'completed' } } }),
    ]);
    res.json({ pendingLeaves, pendingExpenses, openTasks });
  } catch (e) { next(e); }
});

export default router;
