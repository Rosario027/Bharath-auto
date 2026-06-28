// Seeds the CompanySettings singleton with Bharath Automation's real details
// (taken from the sample invoice). Safe to run repeatedly — only creates the
// row if it does not already exist, so user edits in Settings are preserved.
import 'dotenv/config';
import { prisma } from './db.js';
import { hashPassword } from './auth.js';

export async function ensureUsers() {
  const count = await prisma.user.count();
  if (count === 0) {
    await prisma.user.create({ data: { username: process.env.ADMIN_USER || 'Admin', role: 'admin', passHash: hashPassword(process.env.ADMIN_PASS || 'Admin123') } });
    await prisma.user.create({ data: { username: process.env.USER_USER || 'User', role: 'user', passHash: hashPassword(process.env.USER_PASS || 'User123') } });
    console.log('[seed] Default users created (Admin / User).');
  }
  await ensureStaffProfiles();
}

// Every non-admin login must be able to use the staff portal (attendance,
// leaves, expenses, tasks, site visits). Create a minimal Employee file for
// any 'user'-role account that doesn't have one yet (covers User/User123 and
// any account created before this rule existed). Admin can fill in details later.
export async function ensureStaffProfiles() {
  const unlinked = await prisma.user.findMany({ where: { role: { in: ['user', 'staff'] }, employee: null } });
  for (const u of unlinked) {
    await prisma.employee.create({ data: { name: u.username, userId: u.id } });
    console.log(`[seed] Staff profile created for login "${u.username}".`);
  }
}

export async function ensureDefaultSeries(settings) {
  const count = await prisma.invoiceSeries.count();
  if (count === 0) {
    await prisma.invoiceSeries.create({
      data: {
        name: 'Default',
        prefix: settings?.invoicePrefix || 'BA/TR/PS-',
        nextSeq: settings?.nextInvoiceSeq || 22,
        padWidth: 4,
        isDefault: true,
      },
    });
    console.log('[seed] Default invoice series created.');
  }
  // Credit / debit note series (own numbering, editable by admin & accountant).
  const cn = await prisma.invoiceSeries.count({ where: { docType: 'credit-note' } });
  if (cn === 0) await prisma.invoiceSeries.create({ data: { name: 'Credit Note', prefix: 'CN-', nextSeq: 1, isDefault: true, docType: 'credit-note' } });
  const dn = await prisma.invoiceSeries.count({ where: { docType: 'debit-note' } });
  if (dn === 0) await prisma.invoiceSeries.create({ data: { name: 'Debit Note', prefix: 'DN-', nextSeq: 1, isDefault: true, docType: 'debit-note' } });
}

const KURALS = [
  { text: 'அன்பிலார் எல்லாம் தமக்குரியர் அன்புடையார்\nஎன்பும் உரியர் பிறர்க்கு.', meaning: 'The loveless grasp all for themselves; the loving give even their very bones for others.' },
  { text: 'அன்பின் வழியது உயிர்நிலை அஃதிலார்க்கு\nஎன்புதோல் போர்த்த உடம்பு.', meaning: 'Love is the seat of true life; without it, the body is mere bones wrapped in skin.' },
  { text: 'நன்றி மறப்பது நன்றன்று நன்றல்லது\nஅன்றே மறப்பது நன்று.', meaning: 'To forget a kindness is not good; to forget an injury that very day is good.' },
  { text: 'அகழ்வாரைத் தாங்கும் நிலம்போலத் தம்மை\nஇகழ்வார்ப் பொறுத்தல் தலை.', meaning: 'As the earth bears those who dig it, to patiently bear those who scorn you is supreme.' },
  { text: 'இன்னாசெய் தாரை ஒறுத்தல் அவர்நாண\nநன்னயஞ் செய்து விடல்.', meaning: 'The way to punish those who harm you is to shame them by returning good.' },
  { text: 'கற்க கசடறக் கற்பவை கற்றபின்\nநிற்க அதற்குத் தக.', meaning: 'Learn thoroughly what is worth learning, and then live by that learning.' },
  { text: 'எண்ணென்ப ஏனை எழுத்தென்ப இவ்விரண்டும்\nகண்ணென்ப வாழும் உயிர்க்கு.', meaning: 'Number and letter — these two are called the eyes of all living beings.' },
  { text: 'உள்ளுவ தெல்லாம் உயர்வுள்ளல் மற்றது\nதள்ளினுந் தள்ளாமை நீர்த்து.', meaning: 'Let all your aims be high; such resolve holds firm even when it meets failure.' },
];

export async function ensureLoginQuotes() {
  const count = await prisma.loginQuote.count();
  if (count === 0) {
    await prisma.loginQuote.createMany({
      data: KURALS.map((k, i) => ({ text: k.text, meaning: k.meaning, sortOrder: i, active: true })),
    });
    console.log('[seed] Thirukkural login quotes created.');
  }
}

// One-time data fix: the old "draft/finalized" invoice statuses meant nothing
// to users — every saved document is an issued document. Payment state is
// derived from amountPaid; "deleted" stays as the cancelled marker.
export async function fixInvoiceStatuses() {
  const n = await prisma.invoice.updateMany({ where: { status: { in: ['draft', 'finalized'] } }, data: { status: 'issued' } });
  if (n.count > 0) console.log(`[seed] ${n.count} invoice(s) migrated draft/finalized → issued.`);
}

const DEFAULT_PAYMENT_TERMS = [
  { label: 'Immediate / COD', sortOrder: 0 },
  { label: 'Net 15', sortOrder: 1 },
  { label: 'Net 30', sortOrder: 2 },
  { label: 'Net 60', sortOrder: 3 },
  { label: '50% Advance / 50% Upon Delivery', sortOrder: 4 },
];

export async function ensurePaymentTerms() {
  const count = await prisma.paymentTerm.count();
  if (count === 0) {
    await prisma.paymentTerm.createMany({ data: DEFAULT_PAYMENT_TERMS });
    console.log('[seed] Default payment terms created.');
  }
}

export async function seed() {
  const existing = await prisma.companySettings.findUnique({ where: { id: 1 } });
  if (existing) {
    console.log('[seed] CompanySettings already present — skipping.');
    await ensureDefaultSeries(existing);
    await ensureLoginQuotes();
    await ensureUsers();
    await fixInvoiceStatuses();
    await ensurePaymentTerms();
    return existing;
  }

  const settings = await prisma.companySettings.create({
    data: {
      id: 1,
      companyName: 'Bharath Automation',
      tagline: 'Sales • Service • Automation',
      addressLines: [
        'No:1/5N, First Floor, SAP Complex,',
        'Above A1 Chips, Avinashi Main Road,',
        'Chinniyampalayam, Coimbatore - 641 062.',
      ],
      phones: ['+91-90035 11811'],
      emails: ['prabhu.bharathautomation@gmail.com', 'info.bharathautomation@gmail.com'],
      website: '',
      gstn: '33AZZPP0803A1ZK',
      division: 'Avinashi',
      stateCode: '33',
      invoiceTitle: 'Commercial Invoice',
      invoiceCopy: 'Original for Buyer',
      invoicePrefix: 'BA/TR/PS-',
      nextInvoiceSeq: 22,
      defaultCgst: 9,
      defaultSgst: 9,
      defaultIgst: 18,
      paymentTerms: 'Immediate.',
      footerNote: 'E & O.E',
      signatory: 'Authorized Signatory',
      termsNote: 'Goods once sold will not be taken back. Subject to Coimbatore jurisdiction.',
      defaultTheme: 'orange',
      currency: 'INR',
      currencySymbol: '₹',
    },
  });
  console.log('[seed] CompanySettings created.');
  await ensureDefaultSeries(settings);
  await ensureLoginQuotes();
  await ensureUsers();
  await ensurePaymentTerms();
  return settings;
}

// Allow `node server/lib/seed.js`
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

export default seed;
