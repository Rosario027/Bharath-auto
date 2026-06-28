// Admin staff management — employee files, documents, attendance.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { adminRequired, hashPassword } from '../lib/auth.js';
import { localDate } from '../lib/dates.js';

const router = Router();
router.use(adminRequired);

const DOC_FIELDS = { aadhar: 'aadharDoc', pan: 'panDoc', license: 'licenseDoc', rc: 'rcDoc', insurance: 'insuranceDoc' };
const today = () => localDate();

function scalarData(b) {
  const REFERRED_BY_TYPES = ['', 'walk-in', 'campus', 'referral'];
  return {
    name: (b.name || '').trim(),
    dob: b.dob ? new Date(b.dob) : null,
    address: b.address ?? '',
    phone: b.phone ?? '',
    altPhone: b.altPhone ?? '',
    bloodGroup: b.bloodGroup ?? '',
    medicalCondition: b.medicalCondition ?? '',
    medication: b.medication ?? '',
    emergencyName: b.emergencyName ?? '',
    emergencyPhone: b.emergencyPhone ?? '',
    email: b.email ?? '',
    vehicleNo: b.vehicleNo ?? '',
    insuranceExpiry: b.insuranceExpiry ? new Date(b.insuranceExpiry) : null,
    monthlySalary: Number(b.monthlySalary) || 0,
    satOff: !!b.satOff,
    sunOff: b.sunOff === undefined ? true : !!b.sunOff,
    sunMultiplier: Number(b.sunMultiplier) > 0 ? Number(b.sunMultiplier) : 2,
    active: b.active === undefined ? true : !!b.active,
    // Extended fields (BRD §4.1)
    permanentAddress: b.permanentAddress ?? '',
    currentAddress: b.currentAddress ?? '',
    familyLocationAddress: b.familyLocationAddress ?? '',
    familyLocationLat: b.familyLocationLat != null ? parseFloat(b.familyLocationLat) : null,
    familyLocationLng: b.familyLocationLng != null ? parseFloat(b.familyLocationLng) : null,
    referredByType: REFERRED_BY_TYPES.includes(b.referredByType) ? (b.referredByType || '') : '',
    referredByEmployeeId: b.referredByType === 'referral' && b.referredByEmployeeId ? Number(b.referredByEmployeeId) : null,
  };
}

// List (with today's attendance flag); omit heavy doc data URLs.
router.get('/', async (req, res, next) => {
  try {
    const d = today();
    const employees = await prisma.employee.findMany({
      orderBy: { name: 'asc' },
      include: { attendance: { where: { date: d } } },
    });
    const out = employees.map((e) => ({
      id: e.id, name: e.name, dob: e.dob, phone: e.phone, email: e.email, bloodGroup: e.bloodGroup,
      vehicleNo: e.vehicleNo, insuranceExpiry: e.insuranceExpiry, active: e.active,
      presentToday: e.attendance.length ? e.attendance[0].present : false,
      clockIn: e.attendance[0]?.clockIn || null,
      clockOut: e.attendance[0]?.clockOut || null,
      docs: {
        aadhar: !!e.aadharDoc, pan: !!e.panDoc, license: !!e.licenseDoc, rc: !!e.rcDoc, insurance: !!e.insuranceDoc,
      },
    }));
    res.json(out);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const emp = await prisma.employee.findUnique({
      where: { id: Number(req.params.id) },
      include: { attendance: { where: { date: today() } }, user: { select: { username: true } } },
    });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    res.json({ ...emp, username: emp.user?.username || '', presentToday: emp.attendance.length ? emp.attendance[0].present : false });
  } catch (e) { next(e); }
});

async function validateReferral(b) {
  if (b.referredByType === 'referral' && b.referredByEmployeeId) {
    const ref = await prisma.employee.findUnique({ where: { id: Number(b.referredByEmployeeId) }, select: { id: true, active: true } });
    if (!ref || !ref.active) return 'Referring employee not found or inactive';
  }
  return null;
}

// Create employee — a login account (user id + password) is the mandatory first step.
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!(b.name || '').trim()) return res.status(400).json({ error: 'Employee name is required' });
    if (!(b.username || '').trim() || !(b.password || '').trim()) return res.status(400).json({ error: 'A login User ID and password are required' });
    if (String(b.password).length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    const refError = await validateReferral(b);
    if (refError) return res.status(400).json({ error: refError });

    const emp = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { username: b.username.trim(), role: 'user', passHash: hashPassword(b.password) } });
      return tx.employee.create({ data: { ...scalarData(b), userId: user.id } });
    });
    res.status(201).json({ ...emp, username: b.username.trim() });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'That login User ID already exists' });
    next(e);
  }
});

// Create a login for a legacy employee that doesn't have one yet.
router.post('/:id/login', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { username, password } = req.body || {};
    if (!(username || '').trim() || !(password || '').trim()) return res.status(400).json({ error: 'User ID and password are required' });
    const emp = await prisma.employee.findUnique({ where: { id } });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    if (emp.userId) return res.status(400).json({ error: 'This employee already has a login' });
    const user = await prisma.user.create({ data: { username: username.trim(), role: 'user', passHash: hashPassword(password) } });
    await prisma.employee.update({ where: { id }, data: { userId: user.id } });
    res.json({ ok: true, username: username.trim() });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'That login User ID already exists' });
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const refError = await validateReferral(b);
    if (refError) return res.status(400).json({ error: refError });
    const emp = await prisma.employee.update({ where: { id: Number(req.params.id) }, data: scalarData(b) });
    res.json(emp);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Employee not found' });
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.employee.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Employee not found' });
    next(e);
  }
});

// ── Documents (image data URLs, <= 2MB) ──
function dataUrlBytes(dataUrl) {
  const i = (dataUrl || '').indexOf(',');
  if (i < 0) return Infinity;
  const b64 = dataUrl.slice(i + 1);
  return Math.floor((b64.length * 3) / 4);
}

router.get('/:id/document/:type', async (req, res, next) => {
  try {
    const field = DOC_FIELDS[req.params.type];
    if (!field) return res.status(400).json({ error: 'Unknown document type' });
    const emp = await prisma.employee.findUnique({ where: { id: Number(req.params.id) }, select: { [field]: true } });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    res.json({ type: req.params.type, dataUrl: emp[field] || null });
  } catch (e) { next(e); }
});

router.put('/:id/document/:type', async (req, res, next) => {
  try {
    const field = DOC_FIELDS[req.params.type];
    if (!field) return res.status(400).json({ error: 'Unknown document type' });
    const { dataUrl } = req.body || {};
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return res.status(400).json({ error: 'Upload an image file' });
    if (dataUrlBytes(dataUrl) > 2 * 1024 * 1024) return res.status(400).json({ error: 'File exceeds 2 MB' });
    await prisma.employee.update({ where: { id: Number(req.params.id) }, data: { [field]: dataUrl } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Employee not found' });
    next(e);
  }
});

router.delete('/:id/document/:type', async (req, res, next) => {
  try {
    const field = DOC_FIELDS[req.params.type];
    if (!field) return res.status(400).json({ error: 'Unknown document type' });
    await prisma.employee.update({ where: { id: Number(req.params.id) }, data: { [field]: null } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Photo uploads (BRD §4.1) ──
router.put('/:id/photo', async (req, res, next) => {
  try {
    const { dataUrl, type } = req.body || {};
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return res.status(400).json({ error: 'Upload an image file' });
    if (dataUrlBytes(dataUrl) > 4 * 1024 * 1024) return res.status(400).json({ error: 'File exceeds 4 MB' });
    const field = type === 'family' ? 'familyPhotoUrl' : 'photoUrl';
    await prisma.employee.update({ where: { id: Number(req.params.id) }, data: { [field]: dataUrl } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Employee not found' });
    next(e);
  }
});

// ── Insurance / Academic docs arrays ──
router.post('/:id/insurance-docs', async (req, res, next) => {
  try {
    const { dataUrl } = req.body || {};
    if (!dataUrl) return res.status(400).json({ error: 'File required' });
    if (dataUrlBytes(dataUrl) > 4 * 1024 * 1024) return res.status(400).json({ error: 'File exceeds 4 MB' });
    const emp = await prisma.employee.findUnique({ where: { id: Number(req.params.id) }, select: { insuranceDocs: true } });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const updated = await prisma.employee.update({
      where: { id: Number(req.params.id) },
      data: { insuranceDocs: [...emp.insuranceDocs, dataUrl] },
    });
    res.json({ count: updated.insuranceDocs.length });
  } catch (e) { next(e); }
});

router.delete('/:id/insurance-docs/:idx', async (req, res, next) => {
  try {
    const emp = await prisma.employee.findUnique({ where: { id: Number(req.params.id) }, select: { insuranceDocs: true } });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const docs = emp.insuranceDocs.filter((_, i) => i !== Number(req.params.idx));
    await prisma.employee.update({ where: { id: Number(req.params.id) }, data: { insuranceDocs: docs } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/academic-docs', async (req, res, next) => {
  try {
    const { dataUrl } = req.body || {};
    if (!dataUrl) return res.status(400).json({ error: 'File required' });
    if (dataUrlBytes(dataUrl) > 4 * 1024 * 1024) return res.status(400).json({ error: 'File exceeds 4 MB' });
    const emp = await prisma.employee.findUnique({ where: { id: Number(req.params.id) }, select: { academicDocs: true } });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const updated = await prisma.employee.update({
      where: { id: Number(req.params.id) },
      data: { academicDocs: [...emp.academicDocs, dataUrl] },
    });
    res.json({ count: updated.academicDocs.length });
  } catch (e) { next(e); }
});

router.delete('/:id/academic-docs/:idx', async (req, res, next) => {
  try {
    const emp = await prisma.employee.findUnique({ where: { id: Number(req.params.id) }, select: { academicDocs: true } });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const docs = emp.academicDocs.filter((_, i) => i !== Number(req.params.idx));
    await prisma.employee.update({ where: { id: Number(req.params.id) }, data: { academicDocs: docs } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Attendance (today) ──
router.put('/:id/attendance', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const present = !!(req.body || {}).present;
    const d = today();
    await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: id, date: d } },
      create: { employeeId: id, date: d, present },
      update: { present },
    });
    res.json({ ok: true, present });
  } catch (e) { next(e); }
});

export default router;
