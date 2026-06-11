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

    // Invoices awaiting payment (AR) + today's site-visit outcomes
    const unpaidList = await prisma.invoice.findMany({
      where: { status: { not: 'deleted' }, docType: 'invoice' },
      select: { grandTotal: true, amountPaid: true },
    });
    const unpaid = unpaidList.filter((i) => (i.amountPaid || 0) < i.grandTotal - 0.5);
    const unpaidInvoices = { count: unpaid.length, value: Math.round(unpaid.reduce((s, i) => s + (i.grandTotal - (i.amountPaid || 0)), 0)) };

    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const todayOutcomes = await prisma.siteVisitUpdate.findMany({
      where: { createdAt: { gte: startOfDay } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { siteVisit: { select: { id: true, refNo: true, customerName: true, employeeId: true, employee: { select: { name: true } } } } },
    });

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
      unpaidInvoices,
      todayVisitOutcomes: todayOutcomes.map((u) => ({
        id: u.id, tranche: u.tranche, status: u.status, summary: u.summary,
        nextFollowUp: u.nextFollowUp, by: u.byUsername,
        visitId: u.siteVisit.id, refNo: u.siteVisit.refNo,
        customer: u.siteVisit.customerName, employeeId: u.siteVisit.employeeId,
        employeeName: u.siteVisit.employee?.name || '',
      })),
    });
  } catch (e) { next(e); }
});

export default router;
