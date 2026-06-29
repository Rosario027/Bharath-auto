// Production boot: apply schema, ensure seed data, then start the server.
// Uses `prisma db push` so the app deploys cleanly on Railway without
// requiring a checked-in migration history.
import 'dotenv/config';
import { execSync } from 'node:child_process';

function run(cmd) {
  console.log(`[boot] $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

try {
  run('npx prisma db push --skip-generate --accept-data-loss');
} catch (err) {
  console.error('[boot] prisma db push failed:', err.message);
  process.exit(1);
}

// Login accounts FIRST and on their own — so a failure anywhere else in the
// seed (settings, quotes, series, payment terms) can never leave the app
// without working logins. Owner / Staff are guaranteed before anything else.
try {
  const { ensureUsers } = await import('./seed.js');
  await ensureUsers();
  console.log('[boot] login accounts ensured (Owner / Staff).');
} catch (err) {
  console.error('[boot] ensureUsers FAILED:', err);
}

try {
  const { seed } = await import('./seed.js');
  await seed();
} catch (err) {
  console.error('[boot] seed failed (continuing):', err.message);
}

await import('../index.js');
