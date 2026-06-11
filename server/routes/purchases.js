// Purchases module — supplier register + purchase bills.
// Every bill: stocks-in inventory (warehouse) or skips stock (direct to
// customer), and auto-posts a purchase voucher into the books
// (Dr Purchase + Dr GST Input / Cr Supplier). Open AP derives from the
// books FIFO, so bank-recon payments settle these bills automatically.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';
import { isValidDate } from '../lib/dates.js';
import { postPurchaseToBooks, repostPurchaseToBooks, removePurchaseFromBooks } from '../lib/accounting.js';

const router = Router();
router.use(authRequired);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n) => String(n).padStart(4, '0');

// ────────────────────────── Suppliers ──────────────────────────
router.get('/suppliers', async (req, res, next) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: { purchases: { where: { status: { not: 'deleted' } }, select: { grandTotal: true } } },
    });
    res.json(suppliers.map((s) => ({
      ...s,
      billCount: s.purchases.length,
      totalPurchased: r2(s.purchases.reduce((t, b) => t + (b.grandTotal || 0), 0)),
      purchases: undefined,
    })));
  } catch (e) { next(e); }
});

function supplierData(b) {
  const data = {};
  for (const k of ['name', 'group', 'contactPerson', 'phone', 'altPhone', 'email', 'gstn', 'stateCode', 'notes']) {
    if (b[k] !== undefined) data[k] = String(b[k] ?? '').trim();
  }
  if (Array.isArray(b.addressLines)) data.addressLines = b.addressLines.filter(Boolean);
  return data;
}

router.post('/suppliers', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!(b.name || '').trim()) return res.status(400).json({ error: 'Supplier name is required' });
    const supplier = await prisma.supplier.create({ data: supplierData(b) });
    res.status(201).json(supplier);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A supplier with that name already exists' });
    next(e);
  }
});

router.put('/suppliers/:id', async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.update({ where: { id: Number(req.params.id) }, data: supplierData(req.body || {}) });
    res.json(supplier);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A supplier with that name already exists' });
    if (e.code === 'P2025') return res.status(404).json({ error: 'Supplier not found' });
    next(e);
  }
});

router.delete('/suppliers/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const used = await prisma.purchaseBill.count({ where: { supplierId: id, status: { not: 'deleted' } } });
    if (used > 0) return res.status(400).json({ error: `Supplier has ${used} purchase bill(s) — delete those first` });
    await prisma.supplier.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Supplier not found' });
    next(e);
  }
});

// ────────────────────────── Purchase bills ──────────────────────────
function normalizeItems(items = []) {
  return items
    .filter((it) => (it.description || '').trim() || Number(it.qty) || Number(it.price))
    .map((it, idx) => ({
      slNo: idx + 1,
      description: (it.description || '').trim(),
      hsnCode: (it.hsnCode || '').toString().trim(),
      qty: Number(it.qty) || 0,
      unit: (it.unit || 'Nos').trim(),
      price: Number(it.price) || 0,
      gstRate: it.gstRate === undefined || it.gstRate === null || it.gstRate === '' ? 18 : Number(it.gstRate) || 0,
      inventoryItemId: it.inventoryItemId ? Number(it.inventoryItemId) : null,
      addToStock: it.addToStock !== false,
      notes: (it.notes || '').toString().trim(),
      total: r2((Number(it.qty) || 0) * (Number(it.price) || 0)),
    }));
}

function computeBillTotals(items, taxMode) {
  const subTotal = r2(items.reduce((s, it) => s + it.total, 0));
  const tax = r2(items.reduce((s, it) => s + (it.total * (it.gstRate || 0)) / 100, 0));
  const intra = taxMode !== 'inter';
  return {
    subTotal,
    cgstAmount: intra ? r2(tax / 2) : 0,
    sgstAmount: intra ? r2(tax / 2) : 0,
    igstAmount: intra ? 0 : tax,
    grandTotal: r2(subTotal + tax),
  };
}

// Stock-in every line (warehouse bills only). Finds an existing inventory
// item by link or by name; creates one when "add to stock" is on.
async function applyPurchaseStock(tx, bill, items, username, direction = 1) {
  if (bill.storeTo !== 'warehouse') return;
  for (const it of items) {
    if (!(Number(it.qty) > 0)) continue;
    let itemId = it.inventoryItemId || null;
    if (!itemId && it.addToStock && it.description) {
      const existing = await tx.inventoryItem.findFirst({ where: { name: { equals: it.description, mode: 'insensitive' } } });
      if (existing) itemId = existing.id;
      else if (direction > 0) {
        const created = await tx.inventoryItem.create({
          data: { name: it.description, hsnCode: it.hsnCode || '', unit: it.unit || 'Nos', quantity: 0, location: bill.warehouseLocation || '' },
        });
        itemId = created.id;
      }
    }
    if (!itemId) continue;
    const delta = direction * Number(it.qty);
    await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: { increment: delta } } }).catch(() => {});
    await tx.stockMovement.create({
      data: {
        itemId, delta,
        reason: `Purchase ${bill.refNo}${bill.billNo ? ` (${bill.billNo})` : ''}${direction < 0 ? ' — reversed' : ''}`,
        byUsername: username,
      },
    }).catch(() => {});
    it.inventoryItemId = itemId; // persist the link on the line
  }
}

const BILL_INCLUDE = { supplier: true, items: { orderBy: { slNo: 'asc' } } };

router.get('/', async (req, res, next) => {
  try {
    const bills = await prisma.purchaseBill.findMany({ orderBy: { createdAt: 'desc' }, include: BILL_INCLUDE });
    res.json(bills);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const bill = await prisma.purchaseBill.findUnique({ where: { id: Number(req.params.id) }, include: BILL_INCLUDE });
    if (!bill) return res.status(404).json({ error: 'Purchase bill not found' });
    res.json(bill);
  } catch (e) { next(e); }
});

function billScalar(b, totals) {
  return {
    billNo: (b.billNo || '').trim(),
    billDate: isValidDate(b.billDate) ? b.billDate : new Date().toISOString().slice(0, 10),
    taxMode: b.taxMode === 'inter' ? 'inter' : 'intra',
    storeTo: b.storeTo === 'customer' ? 'customer' : 'warehouse',
    warehouseLocation: (b.warehouseLocation || '').trim(),
    deliverTo: (b.deliverTo || '').trim(),
    notes: (b.notes || '').trim(),
    ...totals,
  };
}

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const supplier = await prisma.supplier.findUnique({ where: { id: Number(b.supplierId) || 0 } });
    if (!supplier) return res.status(400).json({ error: 'Pick a supplier (or create one in the Suppliers tab)' });
    const items = normalizeItems(b.items);
    if (items.length === 0) return res.status(400).json({ error: 'Add at least one item line' });
    const totals = computeBillTotals(items, b.taxMode);

    const created = await prisma.$transaction(async (tx) => {
      const bill = await tx.purchaseBill.create({
        data: {
          ...billScalar(b, totals),
          supplierId: supplier.id,
          createdBy: req.user.username,
          items: { create: items.map(({ addToStock, ...it }) => ({ ...it, addToStock })) },
        },
        include: BILL_INCLUDE,
      });
      const withRef = await tx.purchaseBill.update({ where: { id: bill.id }, data: { refNo: `PB-${pad(bill.id)}` }, include: BILL_INCLUDE });
      await applyPurchaseStock(tx, withRef, withRef.items, req.user.username, 1);
      // persist any inventory links resolved during stock-in
      for (const it of withRef.items) {
        if (it.inventoryItemId) await tx.purchaseItem.update({ where: { id: it.id }, data: { inventoryItemId: it.inventoryItemId } });
      }
      return withRef;
    });

    // Best-effort books posting (failure logged, bill stays usable via re-save)
    postPurchaseToBooks(created, supplier.name, req.user.username).catch((err) => console.error('[purchases] voucher post failed:', err.message));

    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const existing = await prisma.purchaseBill.findUnique({ where: { id }, include: BILL_INCLUDE });
    if (!existing) return res.status(404).json({ error: 'Purchase bill not found' });
    if (existing.status === 'deleted') return res.status(400).json({ error: 'This bill was deleted' });

    const supplier = await prisma.supplier.findUnique({ where: { id: Number(b.supplierId) || existing.supplierId } });
    if (!supplier) return res.status(400).json({ error: 'Pick a supplier' });
    const items = normalizeItems(b.items);
    if (items.length === 0) return res.status(400).json({ error: 'Add at least one item line' });
    const totals = computeBillTotals(items, b.taxMode ?? existing.taxMode);

    const updated = await prisma.$transaction(async (tx) => {
      // reverse old stock, replace lines, apply new stock
      await applyPurchaseStock(tx, existing, existing.items, req.user.username, -1);
      await tx.purchaseItem.deleteMany({ where: { billId: id } });
      const bill = await tx.purchaseBill.update({
        where: { id },
        data: {
          ...billScalar({ ...existing, ...b }, totals),
          supplierId: supplier.id,
          items: { create: items.map(({ addToStock, ...it }) => ({ ...it, addToStock })) },
        },
        include: BILL_INCLUDE,
      });
      await applyPurchaseStock(tx, bill, bill.items, req.user.username, 1);
      for (const it of bill.items) {
        if (it.inventoryItemId) await tx.purchaseItem.update({ where: { id: it.id }, data: { inventoryItemId: it.inventoryItemId } });
      }
      return bill;
    });

    repostPurchaseToBooks(updated, supplier.name, req.user.username).catch((err) => console.error('[purchases] voucher re-post failed:', err.message));

    res.json(updated);
  } catch (e) { next(e); }
});

// Soft delete — reverse stock, pull the voucher out of the books.
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.purchaseBill.findUnique({ where: { id }, include: BILL_INCLUDE });
    if (!existing) return res.status(404).json({ error: 'Purchase bill not found' });
    if (existing.status === 'deleted') return res.json({ ok: true });

    await prisma.$transaction(async (tx) => {
      await applyPurchaseStock(tx, existing, existing.items, req.user.username, -1);
      await tx.purchaseBill.update({ where: { id }, data: { status: 'deleted' } });
    });
    await removePurchaseFromBooks(existing).catch((err) => console.error('[purchases] voucher removal failed:', err.message));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
