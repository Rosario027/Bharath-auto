import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { adminRequired, authRequired } from '../lib/auth.js';

const router = Router();
router.use(authRequired);

const EMP_SEL = { select: { id: true, name: true } };

// List assets
router.get('/', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.assetType) where.assetType = req.query.assetType;
    if (req.query.category) where.category = { contains: req.query.category, mode: 'insensitive' };
    if (req.query.employeeId) where.assignedEmployeeId = Number(req.query.employeeId);
    if (req.query.status) where.status = req.query.status;
    const assets = await prisma.businessAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { assignedEmployee: EMP_SEL },
    });
    res.json(assets);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const asset = await prisma.businessAsset.findUnique({
      where: { id: Number(req.params.id) },
      include: { assignedEmployee: EMP_SEL },
    });
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json(asset);
  } catch (e) { next(e); }
});

router.get('/:id/history', async (req, res, next) => {
  try {
    const history = await prisma.businessAssetHistory.findMany({
      where: { assetId: Number(req.params.id) },
      orderBy: { createdAt: 'desc' },
    });
    res.json(history);
  } catch (e) { next(e); }
});

// Create asset (admin)
router.post('/', adminRequired, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!(b.name || '').trim()) return res.status(400).json({ error: 'Asset name is required' });

    const ASSET_TYPES = ['standard', 'demo'];
    const asset = await prisma.businessAsset.create({
      data: {
        name: b.name.trim(),
        assetCode: b.assetCode || '',
        assetType: ASSET_TYPES.includes(b.assetType) ? b.assetType : 'standard',
        category: b.category || '',
        description: b.description || '',
        purchaseDate: b.purchaseDate || '',
        cost: Number(b.cost) || 0,
        depRate: Number(b.depRate) || 15,
        status: b.assignedEmployeeId ? 'allocated' : 'available',
        assignedEmployeeId: b.assignedEmployeeId ? Number(b.assignedEmployeeId) : null,
        notes: b.notes || '',
      },
      include: { assignedEmployee: EMP_SEL },
    });

    // Log initial allocation if assigned
    if (asset.assignedEmployeeId) {
      await prisma.businessAssetHistory.create({
        data: {
          assetId: asset.id,
          action: 'allocated',
          toEmployeeId: asset.assignedEmployeeId,
          notes: 'Initial allocation',
          byUsername: req.user.username,
        },
      });
    }

    res.status(201).json(asset);
  } catch (e) { next(e); }
});

// Update asset — allocation change logs to history
router.put('/:id', adminRequired, async (req, res, next) => {
  try {
    const b = req.body || {};
    const id = Number(req.params.id);
    const existing = await prisma.businessAsset.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Asset not found' });

    const VALID_STATUSES = ['available', 'allocated', 'in_demo', 'maintenance', 'disposed'];
    const data = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.assetCode !== undefined) data.assetCode = b.assetCode;
    if (b.category !== undefined) data.category = b.category;
    if (b.description !== undefined) data.description = b.description;
    if (b.purchaseDate !== undefined) data.purchaseDate = b.purchaseDate;
    if (b.cost !== undefined) data.cost = Number(b.cost) || 0;
    if (b.depRate !== undefined) data.depRate = Number(b.depRate) || 15;
    if (b.notes !== undefined) data.notes = b.notes;
    if (b.status && VALID_STATUSES.includes(b.status)) data.status = b.status;

    const allocationChanging = b.assignedEmployeeId !== undefined &&
      Number(b.assignedEmployeeId || 0) !== (existing.assignedEmployeeId || 0);

    if (allocationChanging) {
      data.assignedEmployeeId = b.assignedEmployeeId ? Number(b.assignedEmployeeId) : null;
      if (!data.status) {
        data.status = data.assignedEmployeeId ? 'allocated' : 'available';
      }
    }

    const asset = await prisma.$transaction(async (tx) => {
      const updated = await tx.businessAsset.update({ where: { id }, data, include: { assignedEmployee: EMP_SEL } });
      if (allocationChanging) {
        const action = data.assignedEmployeeId ? 'allocated' : 'returned';
        await tx.businessAssetHistory.create({
          data: {
            assetId: id,
            action,
            fromEmployeeId: existing.assignedEmployeeId,
            toEmployeeId: data.assignedEmployeeId || null,
            notes: b.notes || '',
            byUsername: req.user.username,
          },
        });
      }
      return updated;
    });

    res.json(asset);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Asset not found' });
    next(e);
  }
});

// Quick check-in/out for demo assets
router.post('/:id/checkout', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { employeeId, notes } = req.body || {};
    const asset = await prisma.businessAsset.findUnique({ where: { id } });
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    if (asset.assetType !== 'demo') return res.status(400).json({ error: 'Only demo assets support check-out' });

    const updated = await prisma.$transaction(async (tx) => {
      const a = await tx.businessAsset.update({
        where: { id },
        data: { assignedEmployeeId: Number(employeeId), status: 'in_demo' },
        include: { assignedEmployee: EMP_SEL },
      });
      await tx.businessAssetHistory.create({
        data: {
          assetId: id,
          action: 'allocated',
          fromEmployeeId: asset.assignedEmployeeId,
          toEmployeeId: Number(employeeId),
          notes: notes || 'Demo checkout',
          byUsername: req.user.username,
        },
      });
      return a;
    });

    res.json(updated);
  } catch (e) { next(e); }
});

router.post('/:id/checkin', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { notes } = req.body || {};
    const asset = await prisma.businessAsset.findUnique({ where: { id } });
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    if (asset.assetType !== 'demo') return res.status(400).json({ error: 'Only demo assets support check-in' });

    const updated = await prisma.$transaction(async (tx) => {
      const a = await tx.businessAsset.update({
        where: { id },
        data: { assignedEmployeeId: null, status: 'available' },
        include: { assignedEmployee: EMP_SEL },
      });
      await tx.businessAssetHistory.create({
        data: {
          assetId: id,
          action: 'returned',
          fromEmployeeId: asset.assignedEmployeeId,
          toEmployeeId: null,
          notes: notes || 'Demo returned',
          byUsername: req.user.username,
        },
      });
      return a;
    });

    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
