// Seeds the CompanySettings singleton with Bharath Automation's real details
// (taken from the sample invoice). Safe to run repeatedly — only creates the
// row if it does not already exist, so user edits in Settings are preserved.
import 'dotenv/config';
import { prisma } from './db.js';

export async function seed() {
  const existing = await prisma.companySettings.findUnique({ where: { id: 1 } });
  if (existing) {
    console.log('[seed] CompanySettings already present — skipping.');
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
