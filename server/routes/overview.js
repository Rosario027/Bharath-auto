// General admin dashboard — one call aggregating KPIs across every module.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { adminRequired } from '../lib/auth.js';
import { localDate } from '../lib/dates.js';

const router = Router();
router.use(adminRequired);

router.get('/', async (req, res, next) => {
  try {
    const today = localDate();
    const [
      invCount, invSum, clients, employees, presentToday,
      pendingLeaves, pendingExpenses, openTasks, todos,
      visitsOpen, followUpsDue, stockItems, lowStock, vouchers,
    ] = await Promise.all([
      prisma.invoice.count({ where: { status: { not: 'deleted' }, docType: 'invoice' } }),
      prisma.invoice.aggregate({ where: { status: { not: 'deleted' }, docType: 'invoice' }, _sum: { grandTotal: true } }),
      prisma.customer.count(),
      prisma.employee.count(),
      prisma.attendance.count({ where: { date: today, present: true } }),
      prisma.leaveRequest.count({ where: { status: 'pending' } }),
      prisma.expenseClaim.count({ where: { status: 'pending' } }),
      prisma.staffTask.count({ where: { status: { not: 'completed' } } }),
      prisma.staffTask.findMany({
        where: { status: { not: 'completed' } },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: 8,
        include: { employee: { select: { name: true } } },
      }),
      prisma.siteVisit.count({ where: { status: { in: ['assigned', 'open', 'follow-up'] } } }),
      prisma.siteVisit.findMany({ where: { nextFollowUp: { gte: today }, status: { not: 'closed' } }, orderBy: { nextFollowUp: 'asc' }, take: 5, select: { id: true, refNo: true, customerName: true, nextFollowUp: true } }),
      prisma.inventoryItem.count(),
      prisma.inventoryItem.count({ where: { quantity: { lte: 2 } } }),
      prisma.accVoucher.count(),
    ]);

    res.json({
      invoices: { count: invCount, value: invSum._sum.grandTotal || 0 },
      clients, employees, presentToday,
      approvalsPending: pendingLeaves + pendingExpenses,
      openTasks,
      todos: todos.map((t) => ({ id: t.id, title: t.title, priority: t.priority, status: t.status, who: t.employee?.name || 'Admin (self)', dueDate: t.dueDate })),
      siteVisitsOpen: visitsOpen,
      followUps: followUpsDue,
      stock: { items: stockItems, low: lowStock },
      vouchers,
    });
  } catch (e) { next(e); }
});

export default router;
