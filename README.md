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
- Notification centre for new claims, overdue SLAs, Ready stock, and 30/7-day warranty reminders
- Click-to-send WhatsApp/email templates with composer-open and completion history
- Owner-only profit and reliability analytics with exact purchase, refurbishment, sale, and warranty costs
- Six-month revenue/profit charts, model failure rates, SLA/turnaround metrics, technician workload, and safe CSV export
- Supplier book, serial-controlled stock intake, purchase invoices, stock aging, and printable internal intake labels
- Refurbishment task checklists whose parts/repair costs flow automatically into device profit and supplier performance
- Configurable shop branding, contact details, warranty defaults, and logo
- Staff account management, password changes, and audit history
- Automatic daily SQLite snapshots with 14-day retention
- Owner-only verified backup downloads and password-confirmed restore with a safety snapshot
- Public health checks, production readiness checks, rate limits, and security headers
- Docker deployment with a persistent database/backup volume
- Windows PowerShell diagnostic collector
- Tester V2 battery-cycle, SSD power-on-hour/temperature/wear, memory-load, and CPU stability evidence
- Tester V3 Windows agent with one-click tests, HMAC-signed uploads, device photos, and an offline retry queue
- Connected report inbox plus Owner-managed, revocable per-station credentials
- Consolidated service history on the buyer's private warranty QR card

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

- **Owner** can manage branding, warranty defaults, staff accounts, suppliers, stock intake, purchase costs, sales, claims, device tests, the private cost book, profit analytics, and CSV exports.
- **Technician** can access the intake/refurbishment queue, complete task checklists, create device passports, activate sales, manage warranty claims, and record repair costs without access to supplier purchase/profit analytics.
- **Support** can search customer handovers and manage claims, but cannot access procurement, activate sales, create passports, or access staff administration.

Use **Settings** to update the shop identity and your own password. Use **Staff** as an Owner to create accounts, change roles, reset passwords, disable access, and review the audit history. The configured warranty duration is applied when a sale is activated.

## Customer handover flow

1. Complete the diagnostic inspection so the passport reaches **Ready**.
2. Open **Sales** and search by passport ID, serial, model, buyer phone, email, or invoice.
3. Record the buyer, one contact method, invoice reference, selling price, and sale date.
4. Activate the sale. The device becomes **Sold**, and its warranty dates are calculated from the sale date.
5. Open, print, or copy the private QR warranty card for the buyer.
6. Use the Sales dashboard to find customer records and follow up on warranties expiring within 30 days.

## Warranty claim flow

1. Open a public passport and choose **Start warranty claim**.
2. Enter one contact method, describe the issue, and optionally attach up to four photos.
3. Save the private tracking link shown after submission.
4. Open **Claims** in the shop dashboard to review the request and publish status updates.
5. The customer sees each update on the private tracker without creating an account.
6. The private warranty QR card consolidates every claim and customer-safe service update for that exact device. Internal repair notes and costs remain staff-only.

## Warranty service desk

1. Open **Claims** and triage the queue using Open, Mine, Overdue, Urgent, or All.
2. Assign the service job to an active staff member, choose its priority, and set a due date.
3. Record diagnosis, parts, tests, and handover details as private internal notes. These notes are never included in the customer tracker.
4. Owners or Technicians record the current warranty repair cost; only Owners see it combined with purchase and sale figures as profit.
5. Print the authenticated A4 job sheet for the repair bench and final customer signature.
6. Publish only the chosen status and customer-facing note to the private tracker.

## Profit and reliability analytics

1. Open **Analytics** as an Owner and complete purchase and parts/refurbishment costs in the device cost book.
2. New sales capture the selling price during customer handover. Legacy sales without prices remain clearly marked as missing.
3. Warranty service costs recorded in Claims are deducted automatically from the affected device's realized gross profit.
4. Review revenue, gross profit, margin, stock investment, claim rate, warranty cost, SLA performance, and turnaround time from live SQLite data.
5. Compare model failure rates and technician workload, then export the per-device ledger as CSV when deeper analysis is needed.

Amounts are stored as integer minor units rather than floating-point values. Financial APIs and exports are server-enforced as Owner-only, and all cost changes are written to the audit history.

## Notification centre

1. The authenticated dashboard derives alerts from live claims, service due dates, Ready stock, and warranty expiry dates.
2. Open **Notifications** to filter active, contactable, historical, or all alerts.
3. Review the prepared customer-safe message, then open WhatsApp or email when that contact method is available.
4. Opening a composer is recorded in the notification and audit history, but is not treated as delivery confirmation.
5. After the staff member confirms that the message was sent, mark the alert **Done**. Alerts can also be dismissed or reopened.

The standalone build does not send messages in the background. Connecting an email provider or WhatsApp Business API is a later opt-in deployment step.

## Supplier and inventory intake

1. Open **Intake** as an Owner, add the supplier, then record each purchased device with its serial, supplier invoice, purchase date, and exact cost.
2. Print the internal 60 × 30 mm QR intake label and attach it before diagnostics. Duplicate serials are rejected across both intake and published passports.
3. Owners or Technicians add inspection, part, repair, cleaning, or other refurbishment tasks and complete the checklist on the shop bench.
4. Import the Windows diagnostic report. A matching serial links the intake and passport automatically; purchase and task costs immediately flow into Analytics.
5. Use the 30/60/90-day aging indicators to identify stock that is tying up cash, then follow the device through **Awaiting test → In refurbishment → Ready → Sold**.
6. Review the supplier scorecard for volume, passport-link rate, warranty failures, remaining stock value, and realized gross profit.

Purchase price and supplier profit fields are Owner-only. Technicians receive the operational queue and refurbishment task costs; Support accounts cannot access procurement APIs or pages.

## Backups and recovery

- Opening the authenticated dashboard ensures one automatic database snapshot exists for the current day.
- The newest 14 automatic snapshots are retained in the configured backup directory.
- Owners can open **Settings → Data protection** to create and download a manual recovery point.
- Restore validates SQLite integrity and required tables before touching the live database.
- Restore requires the current Owner password and the exact confirmation text `RESTORE`.
- A fresh safety snapshot is always created before replacement, and a failed replacement rolls back to the original live database.
- Detailed recovery steps are in [`docs/RECOVERY.md`](docs/RECOVERY.md).

## Windows tester agent (recommended)

1. Sign in as an Owner and open **Settings -> Windows tester stations**.
2. Create one station for each Windows test-bench laptop and copy the token shown once.
3. Copy the `tools/windows` folder to that laptop and start:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\windows\start-device-passport-tester.ps1
```

4. Enter the standalone DevicePassport server URL and station token. The token is protected with Windows DPAPI for the current Windows user rather than stored as plaintext.
5. Complete the screen, keyboard, webcam, audio, ports, and wireless checks. Add up to four actual device photos; **Open Camera** launches Windows Camera when a new photo is needed.
6. Choose **Run full test + upload**. The agent shows each phase while it collects hardware evidence, runs the controlled CPU test, signs the exact report JSON, and uploads it.
7. Open **New device test -> Connected Windows reports** in the dashboard, select the verified result, review it, and approve the passport. A matching stock-intake serial is linked automatically.

Every upload uses a per-station HMAC-SHA256 signature. The server stores only the token hash, rejects modified reports, revoked tokens, duplicate serials, and replayed signatures, and records the station's last upload. If the server is unavailable, the signed envelope is saved under the current Windows user's local app data and can be sent later with **Retry offline queue**.

## Manual Windows collector fallback

Run this on the laptop being inspected:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\windows\collect-device-health.ps1
```

Tester V2 applies a short 10-second CPU load by default and records battery cycles, best-effort SSD reliability counters, memory use, CPU load, and available temperature readings. Change the controlled load duration with `-StressSeconds 20`, or use `-StressSeconds 0` when only inventory readings are required.

The collector writes `device-report-<serial>.json`. Import that JSON through the fallback picker in the dashboard. Windows and some drive firmware do not expose every temperature, wear, cycle, or power-on-hour field; unavailable evidence is stored and displayed honestly as **Not exposed** rather than guessed.

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
