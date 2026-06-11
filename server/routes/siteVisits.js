// Site Visits — digitised version of the manual "Site Visits" sheet.
// Staff (employee-linked logins) see and create THEIR OWN visits;
// admin sees everything, assigns/reassigns visits (which also drops a
// task into the staff member's portal) and gets the full tranche history.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';
import { localDate, isValidDate } from '../lib/dates.js';

const router = Router();
router.use(authRequired);

const EMP_SEL = { select: { id: true, name: true } };
const pad = (n) => String(n).padStart(4, '0');

async function myEmployee(username) {
  const user = await prisma.user.findUnique({ where: { username }, include: { employee: true } });
  return user?.employee || null;
}

// Returns { isAdmin, employee }. "Full" module access behaves like admin
// for visibility; 'user' access is scoped to the linked employee.
async function ctx(req, res) {
  const isAdmin = req.user.role === 'admin' || req.user.perms?.siteVisits === 'full';
  const employee = isAdmin ? null : await myEmployee(req.user.username);
  if (!isAdmin && !employee) {
    res.status(403).json({ error: 'No staff profile is linked to this login.' });
    return null;
  }
  return { isAdmin, employee };
}

function masterData(b) {
  return {
    siteName: b.siteName ?? '',
    visitDate: isValidDate(b.visitDate) ? b.visitDate : localDate(),
    customerName: b.customerName ?? '',
    contactPerson: b.contactPerson ?? '',
    contactPhone: b.contactPhone ?? '',
    altPhone: b.altPhone ?? '',
    googleLocation: b.googleLocation ?? '',
    address: b.address ?? '',
    district: b.district ?? '',
    buildingSize: b.buildingSize ?? '',
    proType: b.proType ?? '',
    proName: b.proName ?? '',
    proPhone: b.proPhone ?? '',
    builderName: b.builderName ?? '',
    builderPhone: b.builderPhone ?? '',
    electricalContractor: b.electricalContractor ?? '',
    leadSource: b.leadSource ?? '',
    projectType: b.projectType ?? '',
    requirementSummary: b.requirementSummary ?? '',
    productsDiscussed: b.productsDiscussed ?? '',
    homeTheatre: b.homeTheatre ?? '',
    visitType: b.visitType || 'new',
    status: b.status || 'open',
    quotationNo: b.quotationNo ?? '',
    quotationValue: Number(b.quotationValue) || 0,
    nextFollowUp: isValidDate(b.nextFollowUp) ? b.nextFollowUp : '',
    whoIsFollowing: b.whoIsFollowing ?? '',
    probability: Number(b.probability) || 0,
    remarks: b.remarks ?? '',
  };
}

async function createAssignmentTask(employeeId, visit, byUsername, reassigned) {
  await prisma.staffTask.create({
    data: {
      employeeId,
      title: `Site visit${reassigned ? ' (re-assigned)' : ''}: ${visit.customerName || visit.builderName || visit.refNo}`,
      description: [
        `Ref ${visit.refNo}`,
        visit.address || visit.googleLocation ? `Location: ${visit.address || visit.googleLocation}` : '',
        visit.requirementSummary ? `Requirement: ${visit.requirementSummary}` : '',
        'Open "Site Visits" in your portal to update this visit.',
      ].filter(Boolean).join('\n'),
      dueDate: isValidDate(visit.nextFollowUp) ? visit.nextFollowUp : null,
      assignedBy: byUsername,
    },
  });
}

// ── List ──
router.get('/', async (req, res, next) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const where = c.isAdmin ? {} : { employeeId: c.employee.id };
    if (req.query.status) where.status = req.query.status;
    const visits = await prisma.siteVisit.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { employee: EMP_SEL, _count: { select: { updates: true } } },
    });
    res.json(visits.map((v) => ({ ...v, trancheCount: v._count.updates, _count: undefined })));
  } catch (e) { next(e); }
});

// ── Detail (admin or owner) ──
router.get('/:id', async (req, res, next) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const visit = await prisma.siteVisit.findUnique({
      where: { id: Number(req.params.id) },
      include: { employee: EMP_SEL, updates: { orderBy: { tranche: 'desc' } } },
    });
    if (!visit) return res.status(404).json({ error: 'Site visit not found' });
    if (!c.isAdmin && visit.employeeId !== c.employee.id) return res.status(403).json({ error: 'Not your site visit.' });
    res.json(visit);
  } catch (e) { next(e); }
});

// ── Create (staff: own; admin: optionally assign) — tranche #1 recorded ──
router.post('/', async (req, res, next) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const b = req.body || {};
    if (!(b.customerName || '').trim() && !(b.builderName || '').trim()) {
      return res.status(400).json({ error: 'Enter at least the customer name or builder name.' });
    }
    const employeeId = c.isAdmin ? (b.employeeId ? Number(b.employeeId) : null) : c.employee.id;
    const data = masterData(b);

    const created = await prisma.$transaction(async (tx) => {
      const visit = await tx.siteVisit.create({ data: { ...data, employeeId, createdBy: req.user.username } });
      const withRef = await tx.siteVisit.update({ where: { id: visit.id }, data: { refNo: `SV-${pad(visit.id)}` } });
      await tx.siteVisitUpdate.create({
        data: {
          siteVisitId: visit.id,
          tranche: 1,
          byUsername: req.user.username,
          visitDate: data.visitDate,
          visitType: data.visitType,
          status: data.status,
          productsDiscussed: data.productsDiscussed,
          quotationNo: data.quotationNo,
          quotationValue: data.quotationValue,
          nextFollowUp: data.nextFollowUp,
          whoIsFollowing: data.whoIsFollowing,
          probability: data.probability,
          summary: data.remarks || data.requirementSummary,
        },
      });
      return withRef;
    });

    // Admin created & assigned to someone else → drop a task in their portal.
    if (c.isAdmin && employeeId) await createAssignmentTask(employeeId, created, req.user.username, false);

    res.status(201).json(created);
  } catch (e) { next(e); }
});

// ── Edit master / assign / reassign (admin only) ──
router.put('/:id', async (req, res, next) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    if (!c.isAdmin) return res.status(403).json({ error: 'Admins only.' });
    const id = Number(req.params.id);
    const b = req.body || {};
    const visit = await prisma.siteVisit.findUnique({ where: { id } });
    if (!visit) return res.status(404).json({ error: 'Site visit not found' });

    // Assignment / reassignment
    if (b.assignEmployeeId !== undefined) {
      const empId = Number(b.assignEmployeeId) || null;
      const reassigned = !!visit.employeeId && visit.employeeId !== empId;
      const updated = await prisma.siteVisit.update({
        where: { id },
        data: { employeeId: empId, status: empId ? 'assigned' : visit.status },
        include: { employee: EMP_SEL },
      });
      if (empId) await createAssignmentTask(empId, updated, req.user.username, reassigned);
      return res.json(updated);
    }

    const updated = await prisma.siteVisit.update({
      where: { id },
      data: masterData({ ...visit, ...b }),
      include: { employee: EMP_SEL },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// ── Add a tranche (owner staff or admin) — syncs latest state to master ──
router.post('/:id/updates', async (req, res, next) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const id = Number(req.params.id);
    const visit = await prisma.siteVisit.findUnique({ where: { id }, include: { updates: true } });
    if (!visit) return res.status(404).json({ error: 'Site visit not found' });
    if (!c.isAdmin && visit.employeeId !== c.employee.id) return res.status(403).json({ error: 'Not your site visit.' });

    const b = req.body || {};
    if (!(b.summary || '').trim()) return res.status(400).json({ error: 'Describe what happened on this visit.' });

    const trancheNo = (visit.updates.reduce((m, u) => Math.max(m, u.tranche), 0)) + 1;
    const t = {
      visitDate: isValidDate(b.visitDate) ? b.visitDate : localDate(),
      visitType: b.visitType || 'follow up',
      status: b.status || visit.status,
      productsDiscussed: b.productsDiscussed ?? '',
      quotationNo: b.quotationNo ?? visit.quotationNo,
      quotationValue: b.quotationValue !== undefined ? Number(b.quotationValue) || 0 : visit.quotationValue,
      nextFollowUp: isValidDate(b.nextFollowUp) ? b.nextFollowUp : '',
      whoIsFollowing: b.whoIsFollowing ?? visit.whoIsFollowing,
      probability: b.probability !== undefined ? Number(b.probability) || 0 : visit.probability,
      summary: b.summary.trim(),
    };

    const [update] = await prisma.$transaction([
      prisma.siteVisitUpdate.create({ data: { siteVisitId: id, tranche: trancheNo, byUsername: req.user.username, ...t } }),
      prisma.siteVisit.update({
        where: { id },
        data: {
          visitType: t.visitType,
          status: t.status,
          productsDiscussed: t.productsDiscussed || visit.productsDiscussed,
          quotationNo: t.quotationNo,
          quotationValue: t.quotationValue,
          nextFollowUp: t.nextFollowUp,
          whoIsFollowing: t.whoIsFollowing,
          probability: t.probability,
          remarks: t.summary,
        },
      }),
    ]);
    res.status(201).json(update);
  } catch (e) { next(e); }
});

// ── Delete (admin only) ──
router.delete('/:id', async (req, res, next) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    if (!c.isAdmin) return res.status(403).json({ error: 'Admins only.' });
    await prisma.siteVisit.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Site visit not found' });
    next(e);
  }
});

export default router;
