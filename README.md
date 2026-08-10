# DevicePassport — Standalone Next.js MVP

DevicePassport is an independent shop system for refurbished laptop health reports, public QR passports, and digital warranties. It does not depend on OpenAI authentication or OpenAI hosting.

## Stack

- Next.js 16 App Router on the standard Node.js runtime
- React 19
- App-owned signed HTTP-only sessions backed by salted scrypt staff passwords
- Owner, Technician, and Support role permissions enforced by server APIs
- Local SQLite database through Node's built-in `node:sqlite`
- Three-step diagnostic import, technician inspection, and approval workflow
- Photo evidence stored with each passport
- Public QR passport pages and printable 40 × 25 mm asset labels
- Draft → Ready → Sold inventory lifecycle with sale-date warranty activation
- Buyer records, invoice references, customer search, and warranty-expiry alerts
- Private QR warranty cards that reopen the buyer's coverage and claim journey
- Account-free warranty claim submission with evidence photos
- Private customer tracking links and a technician status timeline
- Authenticated claims inbox for shop staff
- Warranty service desk with assignment, priority, due-date/SLA filters, private repair notes, and printable job sheets
- Configurable shop branding, contact details, warranty defaults, and logo
- Staff account management, password changes, and audit history
- Automatic daily SQLite snapshots with 14-day retention
- Owner-only verified backup downloads and password-confirmed restore with a safety snapshot
- Public health checks, production readiness checks, rate limits, and security headers
- Docker deployment with a persistent database/backup volume
- Windows PowerShell diagnostic collector

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Development credentials (only used when production environment variables are absent):

- Email: `owner@lapmart.lk`
- Password: `devicepass`

Copy `.env.example` to `.env.local` and replace every credential before deploying.

## Test the real import flow

1. Sign in to the shop dashboard.
2. Choose **New device test**.
3. Upload `examples/sample-device-report.json`.
4. Record each manual inspection as pass or fail and optionally attach up to four evidence photos.
5. Review the calculated score, approve the inspection, and publish the passport.
6. Open the public passport or print its 40 × 25 mm QR label. The device enters **Ready** stock without starting its warranty.
7. Open **Sales**, select the device, record the buyer and invoice, and activate the warranty from the real sale date.

The imported report and passport record are saved in `.data/device-passport.db`.

With the development server running, verify the complete login/import/passport/photo/label/sale/warranty/claim journey with:

```bash
npm run smoke
```

The smoke test removes its temporary device record when it finishes.

The smoke journey also verifies health checks, security headers, backup creation/download, guarded restore, post-restore reconnection, and login rate limiting. Its temporary recovery files are removed automatically.

## Shop administration

- **Owner** can manage branding, warranty defaults, staff accounts, sales, claims, and device tests.
- **Technician** can create device passports, activate sales, and manage warranty claims.
- **Support** can search customer handovers and manage claims, but cannot activate sales, create passports, or access staff administration.

Use **Settings** to update the shop identity and your own password. Use **Staff** as an Owner to create accounts, change roles, reset passwords, disable access, and review the audit history. The configured warranty duration is applied when a sale is activated.

## Customer handover flow

1. Complete the diagnostic inspection so the passport reaches **Ready**.
2. Open **Sales** and search by passport ID, serial, model, buyer phone, email, or invoice.
3. Record the buyer, one contact method, invoice reference, and sale date.
4. Activate the sale. The device becomes **Sold**, and its warranty dates are calculated from the sale date.
5. Open, print, or copy the private QR warranty card for the buyer.
6. Use the Sales dashboard to find customer records and follow up on warranties expiring within 30 days.

## Warranty claim flow

1. Open a public passport and choose **Start warranty claim**.
2. Enter one contact method, describe the issue, and optionally attach up to four photos.
3. Save the private tracking link shown after submission.
4. Open **Claims** in the shop dashboard to review the request and publish status updates.
5. The customer sees each update on the private tracker without creating an account.

## Warranty service desk

1. Open **Claims** and triage the queue using Open, Mine, Overdue, Urgent, or All.
2. Assign the service job to an active staff member, choose its priority, and set a due date.
3. Record diagnosis, parts, tests, and handover details as private internal notes. These notes are never included in the customer tracker.
4. Print the authenticated A4 job sheet for the repair bench and final customer signature.
5. Publish only the chosen status and customer-facing note to the private tracker.

## Backups and recovery

- Opening the authenticated dashboard ensures one automatic database snapshot exists for the current day.
- The newest 14 automatic snapshots are retained in the configured backup directory.
- Owners can open **Settings → Data protection** to create and download a manual recovery point.
- Restore validates SQLite integrity and required tables before touching the live database.
- Restore requires the current Owner password and the exact confirmation text `RESTORE`.
- A fresh safety snapshot is always created before replacement, and a failed replacement rolls back to the original live database.
- Detailed recovery steps are in [`docs/RECOVERY.md`](docs/RECOVERY.md).

## Windows collector

Run this on the laptop being inspected:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\windows\collect-device-health.ps1
```

The collector writes `device-report-<serial>.json`. Import that JSON in the dashboard.

## Deployment

`npm run build` creates a standard standalone Next.js Node application. The included Docker configuration runs it with a persistent `/app/.data` volume and checks `/api/health` every 30 seconds.

1. Copy `.env.example` to `.env.production` and replace every credential and URL.
2. Validate the runtime configuration:

```bash
npm run check:production
```

3. Build and run the production container:

```bash
docker compose --env-file .env.production up -d --build
```

4. Confirm `https://your-domain/api/health` returns `healthy`, then open **Settings → Data protection** and download the first recovery point.

The built-in SQLite database is ideal for the local MVP and a single persistent server. Before multi-instance or serverless deployment, move the same schema to PostgreSQL.
