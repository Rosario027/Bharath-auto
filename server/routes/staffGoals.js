import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { adminRequired, authRequired } from '../lib/auth.js';
import { isValidDate } from '../lib/dates.js';

const router = Router();
router.use(authRequired);

const EMP_SEL = { select: { id: true, name: true } };

async function myEmployee(req) {
  const user = await prisma.user.findUnique({ where: { username: req.user.username }, include: { employee: true } });
  return user?.employee || null;
}

// Admin: list all goals (with optional employeeId filter)
router.get('/', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.employeeId) where.employeeId = Number(req.query.employeeId);
    if (req.query.status) where.status = req.query.status;
    const goals = await prisma.staffGoal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { employee: EMP_SEL },
    });
    res.json(goals);
  } catch (e) { next(e); }
});

// Staff: their own goals
router.get('/my', async (req, res, next) => {
  try {
    const emp = await myEmployee(req);
    if (!emp) return res.status(404).json({ error: 'No staff profile linked to this login' });
    const goals = await prisma.staffGoal.findMany({
      where: { employeeId: emp.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(goals);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const goal = await prisma.staffGoal.findUnique({
      where: { id: Number(req.params.id) },
      include: { employee: EMP_SEL },
    });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    // Staff can only view own goals
    if (req.user.role !== 'admin') {
      const emp = await myEmployee(req);
      if (!emp || goal.employeeId !== emp.id) return res.status(403).json({ error: 'Access denied' });
    }
    res.json(goal);
  } catch (e) { next(e); }
});

// Admin: assign goal to employee
router.post('/', adminRequired, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.employeeId) return res.status(400).json({ error: 'Employee is required' });
    if (!(b.title || '').trim()) return res.status(400).json({ error: 'Title is required' });
    const emp = await prisma.employee.findUnique({ where: { id: Number(b.employeeId) } });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const goal = await prisma.staffGoal.create({
      data: {
        employeeId: Number(b.employeeId),
        title: b.title.trim(),
        description: b.description || '',
        kpis: typeof b.kpis === 'string' ? b.kpis : JSON.stringify(b.kpis || []),
        targetDate: isValidDate(b.targetDate) ? b.targetDate : '',
        status: 'active',
        assignedBy: req.user.username,
      },
      include: { employee: EMP_SEL },
    });
    res.status(201).json(goal);
  } catch (e) { next(e); }
});

// Admin or staff (own goal): update progress + evidence
router.put('/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const id = Number(req.params.id);
    const goal = await prisma.staffGoal.findUnique({ where: { id } });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    // Non-admin can only update their own progress
    if (req.user.role !== 'admin') {
      const emp = await myEmployee(req);
      if (!emp || goal.employeeId !== emp.id) return res.status(403).json({ error: 'Access denied' });
    }

    const data = {};
    if (req.user.role === 'admin') {
      if (b.title !== undefined) data.title = b.title;
      if (b.description !== undefined) data.description = b.description;
      if (b.kpis !== undefined) data.kpis = typeof b.kpis === 'string' ? b.kpis : JSON.stringify(b.kpis);
      if (b.targetDate !== undefined) data.targetDate = isValidDate(b.targetDate) ? b.targetDate : '';
      if (b.status !== undefined && ['active', 'completed', 'cancelled'].includes(b.status)) data.status = b.status;
    }
    // Both admin and staff can update progress and evidence
    if (b.progress !== undefined) data.progress = Math.min(100, Math.max(0, Number(b.progress) || 0));
    if (b.evidenceUrl !== undefined) data.evidenceUrl = b.evidenceUrl;

    const updated = await prisma.staffGoal.update({ where: { id }, data, include: { employee: EMP_SEL } });
    res.json(updated);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Goal not found' });
    next(e);
  }
});

router.delete('/:id', adminRequired, async (req, res, next) => {
  try {
    await prisma.staffGoal.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Goal not found' });
    next(e);
  }
});

export default router;
