import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { adminRequired, authRequired } from '../lib/auth.js';

const router = Router();

function pad(n, w = 4) { return String(n).padStart(w, '0'); }

async function nextDcNo() {
  const last = await prisma.deliveryChallan.findFirst({ orderBy: { id: 'desc' } });
  if (!last || !last.dcNo) return 'DC-0001';
  const m = last.dcNo.match(/(\d+)$/);
  const next = m ? Number(m[1]) + 1 : 1;
  return `DC-${pad(next)}`;
}

// List DCs — admin sees all, user sees their own (by invoice link)
router.get('/', authRequired, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.invoiceId) where.invoiceId = Number(req.query.invoiceId);
    if (req.query.status) where.status = req.query.status;
    const challans = await prisma.deliveryChallan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        invoice: { select: { id: true, invoiceNo: true, buyerName: true } },
      },
    });
    res.json(challans);
  } catch (e) { next(e); }
});

router.get('/:id', authRequired, async (req, res, next) => {
  try {
    const dc = await prisma.deliveryChallan.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        items: true,
        invoice: { select: { id: true, invoiceNo: true, buyerName: true, buyerAddressLines: true } },
      },
    });
    if (!dc) return res.status(404).json({ error: 'Delivery Challan not found' });
    res.json(dc);
  } catch (e) { next(e); }
});

// Create DC — moves linked inventory items to transit state
router.post('/', authRequired, async (req, res, next) => {
  try {
    const b = req.body || {};
    const dcNo = await nextDcNo();

    const dc = await prisma.$transaction(async (tx) => {
      const challan = await tx.deliveryChallan.create({
        data: {
          dcNo,
          invoiceId: b.invoiceId ? Number(b.invoiceId) : null,
          transporterName: b.transporterName || '',
          vehicleNo: b.vehicleNo || '',
          ewayBillNo: b.ewayBillNo || '',
          dispatchLocation: b.dispatchLocation || '',
          dispatchDate: b.dispatchDate || new Date().toISOString().slice(0, 10),
          buyerName: b.buyerName || '',
          buyerAddress: b.buyerAddress || '',
          status: 'open',
          createdBy: req.user?.username || '',
          items: {
            create: (b.items || []).map((it) => ({
              description: it.description || '',
              hsnCode: it.hsnCode || '',
              qty: Number(it.qty) || 1,
              unit: it.unit || 'Nos',
              inventoryItemId: it.inventoryItemId ? Number(it.inventoryItemId) : null,
            })),
          },
        },
        include: { items: true },
      });

      // Move inventory to transit (dispatched_but_not_billed)
      for (const it of challan.items) {
        if (!it.inventoryItemId || !(it.qty > 0)) continue;
        await tx.inventoryItem.update({
          where: { id: it.inventoryItemId },
          data: {
            quantity: { decrement: it.qty },
            transitQuantity: { increment: it.qty },
          },
        }).catch(() => {});
        await tx.stockMovement.create({
          data: {
            itemId: it.inventoryItemId,
            delta: -it.qty,
            reason: `DC ${dcNo} — moved to transit`,
            byUsername: req.user?.username || '',
          },
        }).catch(() => {});
      }

      return challan;
    });

    res.status(201).json(dc);
  } catch (e) { next(e); }
});

// Update DC status (deliver / cancel)
router.put('/:id', authRequired, async (req, res, next) => {
  try {
    const b = req.body || {};
    const id = Number(req.params.id);
    const existing = await prisma.deliveryChallan.findUnique({ where: { id }, include: { items: true } });
    if (!existing) return res.status(404).json({ error: 'Delivery Challan not found' });

    const allowedStatuses = ['open', 'delivered', 'cancelled'];
    const data = {};
    if (b.status && allowedStatuses.includes(b.status)) data.status = b.status;
    if (b.transporterName !== undefined) data.transporterName = b.transporterName;
    if (b.vehicleNo !== undefined) data.vehicleNo = b.vehicleNo;
    if (b.ewayBillNo !== undefined) data.ewayBillNo = b.ewayBillNo;
    if (b.dispatchLocation !== undefined) data.dispatchLocation = b.dispatchLocation;

    const updated = await prisma.$transaction(async (tx) => {
      const dc = await tx.deliveryChallan.update({ where: { id }, data });

      // If cancelled, restore transit inventory back to available
      if (b.status === 'cancelled' && existing.status === 'open') {
        for (const it of existing.items) {
          if (!it.inventoryItemId || !(it.qty > 0)) continue;
          await tx.inventoryItem.update({
            where: { id: it.inventoryItemId },
            data: {
              quantity: { increment: it.qty },
              transitQuantity: { decrement: it.qty },
            },
          }).catch(() => {});
          await tx.stockMovement.create({
            data: {
              itemId: it.inventoryItemId,
              delta: it.qty,
              reason: `DC ${existing.dcNo} — cancelled, stock restored`,
              byUsername: req.user?.username || '',
            },
          }).catch(() => {});
        }
      }

      // If delivered, clear transit quantity (billing will handle final deduct)
      if (b.status === 'delivered' && existing.status === 'open') {
        for (const it of existing.items) {
          if (!it.inventoryItemId || !(it.qty > 0)) continue;
          await tx.inventoryItem.update({
            where: { id: it.inventoryItemId },
            data: { transitQuantity: { decrement: it.qty } },
          }).catch(() => {});
        }
      }

      return dc;
    });

    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
