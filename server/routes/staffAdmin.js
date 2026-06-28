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

// ── Attendance update requests (missed-day) ──
router.get('/attendance-requests', async (req, res, next) => {
  try {
    const where = req.query.status ? { status: req.query.status } : {};
    res.json(await prisma.attendanceRequest.findMany({
      where, orderBy: [{ status: 'desc' }, { createdAt: 'desc' }], include: { employee: EMP_SEL },
    }));
  } catch (e) { next(e); }
});

router.put('/attendance-requests/:id', async (req, res, next) => {
  try {
    const { status, adminComment } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const reqRow = await prisma.attendanceRequest.update({
      where: { id: Number(req.params.id) },
      data: { status, adminComment: adminComment ?? '' },
      include: { employee: EMP_SEL },
    });
    // Approval writes the attendance record (manual full day, summary carried over).
    if (status === 'approved') {
      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: reqRow.employeeId, date: reqRow.date } },
        create: { employeeId: reqRow.employeeId, date: reqRow.date, present: true, manual: true, workSummary: reqRow.workSummary },
        update: { present: true, manual: true, workSummary: reqRow.workSummary },
      });
    }
    res.json(reqRow);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Request not found' });
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

// ── Task Deadline Change Requests (admin side, BRD §6.1) ──
router.get('/deadline-requests', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const requests = await prisma.taskDeadlineRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        task: { select: { id: true, title: true, dueDate: true, status: true } },
        employee: { select: { id: true, name: true } },
      },
    });
    res.json(requests);
  } catch (e) { next(e); }
});

router.put('/deadline-requests/:id', async (req, res, next) => {
  try {
    const { status, adminComment } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status must be approved or rejected' });

    const dr = await prisma.taskDeadlineRequest.findUnique({
      where: { id: Number(req.params.id) },
      include: { task: true },
    });
    if (!dr) return res.status(404).json({ error: 'Deadline request not found' });
    if (dr.status !== 'pending') return res.status(400).json({ error: 'Request already resolved' });

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.taskDeadlineRequest.update({
        where: { id: dr.id },
        data: { status, adminComment: adminComment || '' },
      });

      if (status === 'approved') {
        // Update task's dueDate and restore it to processing status
        await tx.staffTask.update({
          where: { id: dr.taskId },
          data: { dueDate: dr.proposedDate, status: 'processing' },
        });
      } else {
        // Rejected: restore original status (remove pending_deadline_approval lock)
        await tx.staffTask.update({
          where: { id: dr.taskId },
          data: { status: 'processing' }, // restore to active working state
        });
      }

      return updated;
    });

    res.json(result);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Deadline request not found' });
    next(e);
  }
});

// Geofence zone management
router.get('/geofence-zones', async (req, res, next) => {
  try {
    res.json(await prisma.geofenceZone.findMany({ orderBy: { name: 'asc' } }));
  } catch (e) { next(e); }
});

router.post('/geofence-zones', async (req, res, next) => {
  try {
    const { name, lat, lng, radiusM } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Zone name required' });
    if (!lat || !lng) return res.status(400).json({ error: 'GPS coordinates required' });
    const zone = await prisma.geofenceZone.create({
      data: { name, lat: parseFloat(lat), lng: parseFloat(lng), radiusM: Number(radiusM) || 200 },
    });
    res.status(201).json(zone);
  } catch (e) { next(e); }
});

router.put('/geofence-zones/:id', async (req, res, next) => {
  try {
    const { name, lat, lng, radiusM, active } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = name;
    if (lat !== undefined) data.lat = parseFloat(lat);
    if (lng !== undefined) data.lng = parseFloat(lng);
    if (radiusM !== undefined) data.radiusM = Number(radiusM);
    if (active !== undefined) data.active = Boolean(active);
    const zone = await prisma.geofenceZone.update({ where: { id: Number(req.params.id) }, data });
    res.json(zone);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Zone not found' });
    next(e);
  }
});

router.delete('/geofence-zones/:id', async (req, res, next) => {
  try {
    await prisma.geofenceZone.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Counts for the admin staff dashboard + task pie chart.
router.get('/summary', async (req, res, next) => {
  try {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const [pendingLeaves, pendingExpenses, openTasks, assigned, processing, completed, adminTodo, upcoming, pendingDeadlineRequests, unreadFeedback] = await Promise.all([
      prisma.leaveRequest.count({ where: { status: 'pending' } }),
      prisma.expenseClaim.count({ where: { status: 'pending' } }),
      prisma.staffTask.count({ where: { status: { not: 'completed' } } }),
      prisma.staffTask.count({ where: { status: 'assigned' } }),
      prisma.staffTask.count({ where: { status: 'processing' } }),
      prisma.staffTask.count({ where: { status: 'completed' } }),
      prisma.staffTask.count({ where: { employeeId: null, status: { not: 'completed' } } }),
      prisma.staffTask.count({ where: { status: { not: 'completed' }, dueDate: { gte: todayStr } } }),
      prisma.taskDeadlineRequest.count({ where: { status: 'pending' } }),
      prisma.staffFeedback.count({ where: { read: false } }),
    ]);
    res.json({
      pendingLeaves, pendingExpenses, openTasks,
      pendingDeadlineRequests, unreadFeedback,
      tasks: { assigned, processing, completed, adminTodo, upcoming },
    });
  } catch (e) { next(e); }
});

// ── Salary / compensation calculator ──
// Pay cycle: 15th of prior month → 14th of current month (BRD §3.1).
// Pay = perDay × present-on-working-days + perDay × multiplier × present-on-off-days.
// perDay = monthlySalary / workingDays (off-days per the employee's weekend policy).

function getPayPeriod(month) {
  // month = 'YYYY-MM' → cycle is 15th of previous month to 14th of this month
  const [y, m] = month.split('-').map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const periodStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-15`;
  const periodEnd = `${y}-${String(m).padStart(2, '0')}-14`;
  return { periodStart, periodEnd };
}

function allDatesInRange(start, end) {
  const dates = [];
  const cur = new Date(start);
  const endDate = new Date(end);
  while (cur <= endDate) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

router.get('/salary/:employeeId', async (req, res, next) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);

    const { periodStart, periodEnd } = getPayPeriod(month);
    const allDates = allDatesInRange(periodStart, periodEnd);

    const isOff = (dateStr) => {
      const dow = new Date(dateStr).getDay();
      return (dow === 0 && emp.sunOff) || (dow === 6 && emp.satOff);
    };

    let workingDays = 0;
    for (const d of allDates) if (!isOff(d)) workingDays++;

    const records = await prisma.attendance.findMany({
      where: { employeeId, date: { gte: periodStart, lte: periodEnd }, present: true },
    });
    let presentWorking = 0, presentOff = 0;
    for (const r of records) {
      if (isOff(r.date)) presentOff++; else presentWorking++;
    }

    const leaves = await prisma.leaveRequest.count({
      where: { employeeId, status: 'approved', fromDate: { lte: periodEnd }, toDate: { gte: periodStart } },
    });

    const perDay = workingDays > 0 ? emp.monthlySalary / workingDays : 0;
    const basePay = perDay * presentWorking;
    const offDayPay = perDay * (emp.sunMultiplier || 1) * presentOff;
    const total = Math.round(basePay + offDayPay);

    res.json({
      month, periodStart, periodEnd,
      monthlySalary: emp.monthlySalary, satOff: emp.satOff, sunOff: emp.sunOff, sunMultiplier: emp.sunMultiplier,
      totalDaysInPeriod: allDates.length, workingDays, presentWorking, presentOff, approvedLeaveRequests: leaves,
      perDay: Math.round(perDay * 100) / 100, basePay: Math.round(basePay), offDayPay: Math.round(offDayPay), total,
    });
  } catch (e) { next(e); }
});

// ── Salary Slip PDF ──
router.get('/salary/:employeeId/slip', async (req, res, next) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);

    const { periodStart, periodEnd } = getPayPeriod(month);
    const allDates = allDatesInRange(periodStart, periodEnd);

    const isOff = (dateStr) => {
      const dow = new Date(dateStr).getDay();
      return (dow === 0 && emp.sunOff) || (dow === 6 && emp.satOff);
    };

    let workingDays = 0;
    for (const d of allDates) if (!isOff(d)) workingDays++;

    const records = await prisma.attendance.findMany({
      where: { employeeId, date: { gte: periodStart, lte: periodEnd }, present: true },
    });
    let presentWorking = 0, presentOff = 0;
    for (const r of records) {
      if (isOff(r.date)) presentOff++; else presentWorking++;
    }

    const perDay = workingDays > 0 ? emp.monthlySalary / workingDays : 0;
    const basePay = perDay * presentWorking;
    const offDayPay = perDay * (emp.sunMultiplier || 1) * presentOff;
    const total = Math.round(basePay + offDayPay);

    // Generate PDF
    const PdfPrinter = (await import('pdfmake/src/printer.js')).default;
    const FONTS = {
      Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
    };
    const printer = new PdfPrinter(FONTS);

    const settings = await prisma.companySettings.findUnique({ where: { id: 1 } });

    const fmtMoney = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const docDef = {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 40],
      defaultStyle: { font: 'Helvetica', fontSize: 10, lineHeight: 1.3 },
      content: [
        { text: (settings?.companyName || 'Bharath Automation'), bold: true, fontSize: 16, alignment: 'center' },
        { text: 'SALARY SLIP', bold: true, fontSize: 13, alignment: 'center', margin: [0, 4, 0, 0] },
        { text: `Pay Period: ${periodStart} to ${periodEnd}`, fontSize: 9, alignment: 'center', margin: [0, 2, 0, 12] },
        {
          table: {
            widths: ['*', '*'],
            body: [
              [{ text: 'Employee Name', bold: true }, emp.name],
              [{ text: 'Employee ID', bold: true }, `EMP-${String(emp.id).padStart(3, '0')}`],
              [{ text: 'Phone', bold: true }, emp.phone || '-'],
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            widths: ['*', '*'],
            body: [
              [{ text: 'EARNINGS', bold: true, colSpan: 2, alignment: 'center', fillColor: '#f0f0f0' }, {}],
              ['Basic Salary', fmtMoney(emp.monthlySalary)],
              [`Working Days (${periodStart} – ${periodEnd})`, `${workingDays} days`],
              ['Days Present (weekday)', `${presentWorking} days`],
              ['Days Present (off-day)', `${presentOff} days`],
              ['Per Day Rate', fmtMoney(perDay)],
              [{ text: 'Base Pay', bold: true }, fmtMoney(basePay)],
              ['Off-Day Allowance', fmtMoney(offDayPay)],
              [{ text: 'NET PAY', bold: true, fillColor: '#f0f0f0' }, { text: fmtMoney(total), bold: true, fillColor: '#f0f0f0' }],
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 20],
        },
        { text: 'This is a computer-generated salary slip.', fontSize: 8, color: '#888', alignment: 'center' },
      ],
    };

    const pdfDoc = printer.createPdfKitDocument(docDef);
    const chunks = [];
    pdfDoc.on('data', (c) => chunks.push(c));
    pdfDoc.on('end', () => {
      const buf = Buffer.concat(chunks);
      const filename = `SalarySlip-${emp.name.replace(/\s+/g, '-')}-${month}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buf);
    });
    pdfDoc.on('error', next);
    pdfDoc.end();
  } catch (e) { next(e); }
});

export default router;
