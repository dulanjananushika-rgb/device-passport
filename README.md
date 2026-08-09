# DevicePassport MVP

DevicePassport is a trust and after-sales platform for refurbished laptop sellers. The first MVP has three working surfaces:

1. **Shop dashboard** — device intake, report search, passport status, warranties, and quality reporting.
2. **Public QR passport** — a buyer-facing health report and digital warranty page.
3. **Windows collector** — a PowerShell utility that gathers hardware identity, memory, storage, and battery health into an importable JSON report.

## Local development

```bash
npm install
npm run dev
```

Open the local address printed by the development server. Use `examples/sample-device-report.json` to test **New device test → Choose report**.

## Windows collector

Run this on the laptop being inspected:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\windows\collect-device-health.ps1
```

The collector writes `device-report-<serial>.json` in the current folder. Import that file in the dashboard.

## Current MVP boundary

- Dashboard data is realistic demo data and is not persisted yet.
- The Windows report is not cryptographically signed yet; the UI does not claim otherwise.
- Manual display, keyboard, camera, audio, port, and wireless checks are represented in the report schema and will become an interactive technician checklist next.
- Authentication, shop tenancy, durable storage, PDF/label printing, and real warranty claims are planned for the production phase.
