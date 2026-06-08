import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { seed } from '../lib/seed.js';
import { adminRequired } from '../lib/auth.js';

const router = Router();

export async function getSettings() {
  let s = await prisma.companySettings.findUnique({ where: { id: 1 } });
  if (!s) s = await seed();
  return s;
}

router.get('/', async (req, res, next) => {
  try {
    res.json(await getSettings());
  } catch (e) {
    next(e);
  }
});

router.put('/', adminRequired, async (req, res, next) => {
  try {
    await getSettings(); // ensure row exists
    const data = { ...req.body };
    delete data.id;
    delete data.updatedAt;
    const updated = await prisma.companySettings.update({ where: { id: 1 }, data });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

export default router;
