# Bharath Automation — Invoicing

A full-stack invoice maker for **Bharath Automation**. Fill a simple form, watch the
invoice build live, then **save, print, download (PDF / Word)** and **share via WhatsApp or
email**. A **Settings** pane controls the fixed components of every invoice and reflects
live in the preview. Choose from **3 invoice themes**.

## Tech stack

| Layer    | Choice                                          |
|----------|-------------------------------------------------|
| Frontend | React + Vite (live split-screen editor)         |
| Backend  | Node.js + Express (single service)              |
| Database | PostgreSQL via Prisma                           |
| PDF      | `pdfmake` (server-side, vector, no browser)     |
| Word     | `docx` (server-side .docx)                      |
| Sharing  | WhatsApp (`wa.me`) & Email (`mailto:`) redirects |
| Hosting  | Railway (Nixpacks)                              |

## Features

- **Live preview** — the invoice updates as you type; what you see is what prints.
- **Auto-fit** — long item descriptions shrink/wrap gracefully; short invoices stay balanced.
- **3 themes** — Bharath Classic (orange), Emerald Modern, Slate Minimal.
- **Settings pane** — company identity, logo upload, address/contact, GSTIN, invoice
  numbering, tax defaults, bank details, signature & footer — all live-previewed.
- **GST aware** — intra-state (CGST + SGST) or inter-state (IGST); Indian amount-in-words.
- **Exports & sharing** — Print, PDF, Word. WhatsApp and Email open the device's
  native app (`wa.me` / `mailto:`) with the message pre-filled and the PDF downloaded to attach.
- **Customers** — save and reuse buyer details.

## Local development

```bash
cp .env.example .env          # set DATABASE_URL to a local Postgres
npm install
npm --prefix client install
npm run prisma:generate
npm run db:push               # create tables
npm run seed                  # seed company settings
npm run dev                   # server :8080 + client :5173
```

Open http://localhost:5173 (the Vite dev server proxies `/api` to the backend).

## Production build (single service)

```bash
npm run build                 # prisma generate + build client
npm start                     # db push + seed + serve API & client on $PORT
```

## Deploy to Railway

1. Create a new Railway project and **add the PostgreSQL plugin** (provides `DATABASE_URL`).
2. Deploy this repo. Nixpacks runs `npm run build` then `npm run start`.
   No extra env vars are required — WhatsApp/Email sharing run entirely client-side.

The start command runs `prisma db push` (creates/updates tables) and seeds the company
settings on first boot, then serves the app on Railway's `$PORT`.

## Project structure

```
prisma/schema.prisma     # CompanySettings, Invoice, InvoiceItem, Customer
server/
  index.js               # Express app (API + serves client/dist)
  routes/                # settings, invoices, customers, export, share
  lib/                   # calc, numberToWords, money, themes, pdf, docx, seed
client/
  src/
    components/InvoicePreview.jsx   # the WYSIWYG A4 document
    pages/                          # Dashboard, InvoiceEditor, Settings
    themes.js  utils/  styles/
```
