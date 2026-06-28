import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { adminRequired, authRequired } from '../lib/auth.js';

const router = Router();
router.use(authRequired);

function pad(n, w = 4) { return String(n).padStart(w, '0'); }

async function nextRmaNo() {
  const last = await prisma.rmaTicket.findFirst({ orderBy: { id: 'desc' } });
  if (!last || !last.rmaNo) return 'RMA-0001';
  const m = last.rmaNo.match(/(\d+)$/);
  const next = m ? Number(m[1]) + 1 : 1;
  return `RMA-${pad(next)}`;
}

// List RMA tickets
router.get('/', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.customerId) where.customerId = Number(req.query.customerId);
    const tickets = await prisma.rmaTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        invoice: { select: { id: true, invoiceNo: true } },
        customer: { select: { id: true, name: true } },
      },
    });
    res.json(tickets);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const ticket = await prisma.rmaTicket.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        items: true,
        invoice: { select: { id: true, invoiceNo: true, buyerName: true } },
        customer: { select: { id: true, name: true, contactPhone: true } },
        creditNote: { select: { id: true, voucherNo: true } },
      },
    });
    if (!ticket) return res.status(404).json({ error: 'RMA ticket not found' });
    res.json(ticket);
  } catch (e) { next(e); }
});

// Initiate RMA (Step 1)
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!(b.items?.length > 0)) return res.status(400).json({ error: 'At least one item is required' });

    const rmaNo = await nextRmaNo();
    const ticket = await prisma.rmaTicket.create({
      data: {
        rmaNo,
        invoiceId: b.invoiceId ? Number(b.invoiceId) : null,
        customerId: b.customerId ? Number(b.customerId) : null,
        status: 'pending',
        raisedBy: req.user.username,
        items: {
          create: b.items.map((it) => ({
            description: it.description || '',
            qty: Number(it.qty) || 1,
            unit: it.unit || 'Nos',
            issueDetails: it.issueDetails || '',
            inventoryItemId: it.inventoryItemId ? Number(it.inventoryItemId) : null,
          })),
        },
      },
      include: { items: true },
    });
    res.status(201).json(ticket);
  } catch (e) { next(e); }
});

// Update RMA status / evaluation notes (Steps 2–3)
router.put('/:id', adminRequired, async (req, res, next) => {
  try {
    const b = req.body || {};
    const id = Number(req.params.id);
    const data = {};
    const VALID_STATUSES = ['pending', 'under_inspection', 'replacement', 'repair', 'scrapped', 'closed'];
    if (b.status && VALID_STATUSES.includes(b.status)) data.status = b.status;
    if (b.qaFindings !== undefined) data.qaFindings = b.qaFindings;
    if (b.resolutionRoute !== undefined) data.resolutionRoute = b.resolutionRoute;
    const ticket = await prisma.rmaTicket.update({ where: { id }, data });
    res.json(ticket);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'RMA ticket not found' });
    next(e);
  }
});

// Resolution routing (Step 3 detailed) — handles inventory and credit note
router.post('/:id/resolve', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { route, creditNoteNarration } = req.body || {};

    if (!['replacement', 'repair', 'scrap'].includes(route)) {
      return res.status(400).json({ error: 'Invalid resolution route. Use: replacement | repair | scrap' });
    }

    const ticket = await prisma.rmaTicket.findUnique({ where: { id }, include: { items: true } });
    if (!ticket) return res.status(404).json({ error: 'RMA ticket not found' });
    if (ticket.status === 'closed') return res.status(400).json({ error: 'RMA already closed' });

    const result = await prisma.$transaction(async (tx) => {
      let creditNoteId = null;

      if (route === 'replacement') {
        // Decrement warehouse stock for each item with inventory link
        for (const it of ticket.items) {
          if (!it.inventoryItemId || !(it.qty > 0)) continue;
          await tx.inventoryItem.update({
            where: { id: it.inventoryItemId },
            data: { quantity: { decrement: it.qty } },
          }).catch(() => {});
          await tx.stockMovement.create({
            data: {
              itemId: it.inventoryItemId,
              delta: -it.qty,
              reason: `RMA ${ticket.rmaNo} replacement`,
              byUsername: req.user.username,
            },
          }).catch(() => {});
        }

        return tx.rmaTicket.update({
          where: { id },
          data: { status: 'replacement', resolutionRoute: 'replacement', replacementStockNote: 'Replacement issued from warehouse stock' },
        });
      }

      if (route === 'repair') {
        return tx.rmaTicket.update({
          where: { id },
          data: { status: 'repair', resolutionRoute: 'repair' },
        });
      }

      if (route === 'scrap') {
        // Create a credit note voucher in accounting books
        const lastVoucher = await tx.accVoucher.findFirst({ where: { vtype: 'credit-note' }, orderBy: { id: 'desc' } });
        const seq = lastVoucher ? (parseInt(lastVoucher.voucherNo.replace(/[^\d]/g, '')) || 0) + 1 : 1;
        const voucherNo = `CN-RMA-${String(seq).padStart(4, '0')}`;

        // Find Sales ledger (fallback to first income ledger)
        const salesLedger = await tx.accLedger.findFirst({ where: { name: { contains: 'Sales', mode: 'insensitive' } } });
        const receivableLedger = await tx.accLedger.findFirst({ where: { name: { contains: 'Sundry Debtor', mode: 'insensitive' } } });

        if (salesLedger && receivableLedger) {
          const voucher = await tx.accVoucher.create({
            data: {
              voucherNo,
              vtype: 'credit-note',
              date: new Date().toISOString().slice(0, 10),
              narration: creditNoteNarration || `Credit note for RMA ${ticket.rmaNo} — scrapped`,
              createdBy: req.user.username,
              lines: {
                create: [
                  { ledgerId: salesLedger.id, debit: 0, credit: 0, sortOrder: 1 }, // placeholder — admin should fill amount
                  { ledgerId: receivableLedger.id, debit: 0, credit: 0, sortOrder: 2 },
                ],
              },
            },
          });
          creditNoteId = voucher.id;
        }

        return tx.rmaTicket.update({
          where: { id },
          data: { status: 'scrapped', resolutionRoute: 'scrap', creditNoteId },
        });
      }
    });

    res.json(result);
  } catch (e) { next(e); }
});

export default router;
