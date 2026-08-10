# DevicePassport — Standalone Next.js MVP

DevicePassport is an independent shop system for refurbished laptop health reports, public QR passports, and digital warranties. It does not depend on OpenAI authentication or OpenAI hosting.

## Stack

- Next.js 16 App Router on the standard Node.js runtime
- React 19
- App-owned signed HTTP-only sessions
- Local SQLite database through Node's built-in `node:sqlite`
- Public QR passport pages
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
4. Choose **Create passport**.
5. Open the new public passport from the device table.

The imported report and passport record are saved in `.data/device-passport.db`.

## Windows collector

Run this on the laptop being inspected:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\windows\collect-device-health.ps1
```

The collector writes `device-report-<serial>.json`. Import that JSON in the dashboard.

## Deployment

`npm run build` creates a standard standalone Next.js Node application. Deploy it to a VPS, Docker host, Railway, Render, Fly.io, or another Node host with a persistent disk.

The built-in SQLite database is ideal for the local MVP and a single persistent server. Before multi-instance or serverless deployment, move the same schema to PostgreSQL.
