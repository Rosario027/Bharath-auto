// Admin staff management — employee files, documents, attendance.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { adminRequired } from '../lib/auth.js';

const router = Router();
router.use(adminRequired);

const DOC_FIELDS = { aadhar: 'aadharDoc', pan: 'panDoc', license: 'licenseDoc', rc: 'rcDoc', insurance: 'insuranceDoc' };
const today = () => new Date().toISOString().slice(0, 10);

function scalarData(b) {
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
    active: b.active === undefined ? true : !!b.active,
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
      include: { attendance: { where: { date: today() } } },
    });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    res.json({ ...emp, presentToday: emp.attendance.length ? emp.attendance[0].present : false });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!(b.name || '').trim()) return res.status(400).json({ error: 'Employee name is required' });
    const emp = await prisma.employee.create({ data: scalarData(b) });
    res.status(201).json(emp);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const emp = await prisma.employee.update({ where: { id: Number(req.params.id) }, data: scalarData(req.body || {}) });
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
