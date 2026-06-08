// Public (no-auth) content for the login screen.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { getSettings } from './settings.js';
import { ensureLoginQuotes } from '../lib/seed.js';

const router = Router();

// Index of the quote to show "today" — same for everyone, changes daily.
function dayIndex(n) {
  if (n <= 0) return 0;
  const days = Math.floor(Date.now() / 86400000);
  return ((days % n) + n) % n;
}

router.get('/login-content', async (req, res, next) => {
  try {
    await ensureLoginQuotes();
    const settings = await getSettings();
    const quotes = await prisma.loginQuote.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    const quote = quotes.length ? quotes[dayIndex(quotes.length)] : null;
    res.json({
      companyName: settings.companyName,
      note: settings.loginNote || '',
      heading: (settings.loginHeading && settings.loginHeading !== 'Thirukkural') ? settings.loginHeading : 'Thirukural of the day',
      showQuote: settings.showLoginQuote !== false && !!quote,
      quote: quote ? { text: quote.text, meaning: quote.meaning } : null,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
