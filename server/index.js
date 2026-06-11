import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import settingsRouter from './routes/settings.js';
import invoicesRouter from './routes/invoices.js';
import customersRouter from './routes/customers.js';
import exportRouter from './routes/export.js';
import seriesRouter from './routes/series.js';
import authRouter from './routes/auth.js';
import publicRouter from './routes/public.js';
import loginQuotesRouter from './routes/loginQuotes.js';
import usersRouter from './routes/users.js';
import employeesRouter from './routes/employees.js';
import meRouter from './routes/me.js';
import staffAdminRouter from './routes/staffAdmin.js';
import siteVisitsRouter from './routes/siteVisits.js';
import inventoryRouter from './routes/inventory.js';
import reportsRouter from './routes/reports.js';
import accountingRouter from './routes/accounting.js';
import overviewRouter from './routes/overview.js';
import backupRouter from './routes/backup.js';
import { authRequired, adminRequired, requireMod } from './lib/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '12mb' })); // headroom for logo/signature/document data URLs

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);                      // login-screen content (no auth)
app.use('/api/login-quotes', loginQuotesRouter);           // admin-only (guarded in router)
app.use('/api/users', usersRouter);                        // admin-only (guarded in router)
app.use('/api/employees', employeesRouter);                // admin-only (guarded in router)
app.use('/api/me', meRouter);                              // staff self-service (own data only)
app.use('/api/staff-admin', staffAdminRouter);             // admin-only (guarded in router)
app.use('/api/site-visits', authRequired, requireMod('siteVisits'), siteVisitsRouter); // own ('user') vs all ('full')
app.use('/api/inventory', requireModWrap('inventory', inventoryRouter));
app.use('/api/reports', requireModWrap('reports', reportsRouter));
app.use('/api/accounting', requireModWrap('accounting', accountingRouter));
app.use('/api/overview', overviewRouter);                  // general admin dashboard
app.use('/api/backup', backupRouter);                      // full data backup (admin)

// Routers below carry their own authRequired; wrap to add the module gate after it.
function requireModWrap(mod, router) {
  const r = express.Router();
  r.use(authRequired, requireMod(mod), router);
  return r;
}
app.use('/api/settings', authRequired, settingsRouter);   // GET all; PUT admin-only (guarded in router)
app.use('/api/invoices', authRequired, requireMod('invoice'), invoicesRouter);
app.use('/api/customers', authRequired, requireMod('clients', 'full'), customersRouter); // client data — admin or full grant
app.use('/api/export', authRequired, requireMod('invoice'), exportRouter);
app.use('/api/series', authRequired, requireMod('invoice'), seriesRouter);

// ── Serve the built client (single Railway service) ──
const clientDist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) =>
    res.send('<h1>Bharath Automation Invoicing API</h1><p>Client not built. Run <code>npm run build:client</code>.</p>')
  );
}

// Error handler
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[server] Bharath Automation Invoicing running on :${PORT}`);
});

export default app;
