# DevicePassport — Refurbished Laptop Health Reports, Digital QR Passports & Warranty Service Desk (Next.js 16 + SQLite + Windows Hardware Agent)

> **The ultimate operating system for refurbished laptop retailers, electronics liquidators, and computer repair workshops.** Turn every hardware inspection into buyer trust, streamline digital warranties, and track true net profit per machine.

---

### 🌐 Live Interactive Demo
- **Live Demo URL:** [https://device-passport-dulanjana.netlify.app/login](https://device-passport-dulanjana.netlify.app/login)
- **⚡ 1-Click Role Login:** Click **👑 Owner**, **🔧 Technician**, or **🎧 Support** on the login page for instant access (no typing needed!).
- **Manual Credentials:** Email: `owner@lapmart.lk` | Password: `devicepass`

---

## 💡 Why DevicePassport?

Selling refurbished and pre-owned laptops is plagued by two massive problems:
1. **Buyer Distrust:** Customers are afraid of buying laptops with dying batteries, failing SSDs, or hidden hardware faults.
2. **Disorganized Warranties & Disputes:** Paper receipts get lost, customers claim verbal warranties that expired months ago, and repair job sheets clutter the workshop bench.

**DevicePassport completely solves this.** Technicians run a lightweight Windows hardware agent that extracts real BIOS serials, battery charge cycles, SSD SMART health, and conducts guided screen, keyboard, and audio tests. 

Once approved, a **tamper-proof 40 × 25 mm QR passport label** is printed for the laptop lid. When a customer scans it, they see an honest, certified health report. When sold, a **digital warranty card** is activated with a self-service claim portal and private tracking timeline!

---

## 🔥 Key Features & Capabilities

### ⚡ 1. Native Windows Hardware Diagnostic Agent (Tester V4)
- **No Manual Entry:** Gathers BIOS serial number, CPU stress stability, RAM capacity, battery charge cycles, battery wear level, and SSD power-on hours/wear level directly from Windows hardware APIs.
- **6-Color Dead-Pixel Screen Test:** Full-screen panel cycling to expose dead pixels, backlight bleed, and pressure spots.
- **60-Key Keyboard Matrix Listener:** Interactive keyboard test that highlights stuck or unresponsive keys in real-time.
- **Camera & Webcam Preview/Capture:** Takes webcam test photos attached directly to the diagnostic certificate.
- **Stereo Left/Right Sound Tone:** Dual-channel audio frequency test for speaker cones.
- **Tamper-Proof HMAC-SHA256 Signatures:** Reports are cryptographically signed using per-station tokens and Windows DPAPI encryption. Modified or forged reports are automatically rejected.
- **Offline Retry Queue:** Stores signed test envelopes locally if the shop Wi-Fi drops and auto-syncs when reconnected.

### 🏷️ 2. Physical QR Asset Labels & Thermal Printing
- **40 × 25 mm Laptop Lid Passports:** Compact QR asset labels linking straight to the public device health passport.
- **60 × 30 mm Intake Tags:** Internal stock tracking stickers printed upon receiving laptops from suppliers.
- **Printable A4 Workshop Job Sheets:** Professional bench repair sheets with customer signature blocks for service handovers.

### 🛡️ 3. Digital Warranty Management & Account-Free Claims
- **Private Buyer QR Warranty Cards:** Consolidated warranty coverage dates and service history for the customer.
- **Account-Free Claim Submission:** Customers scan their warranty card, describe the fault, and attach up to 4 photos without needing to register an account.
- **Live Customer Status Timeline:** Private tracker keeping the customer informed through triage, parts ordering, bench repair, and collection.
- **Service Desk Ticket Queue:** Staff assign technicians, set SLA due dates, add private repair notes, and record repair costs.

### 📊 4. Financial & P&L Analytics (Integer-Cent Precision)
- **True Gross Margin Calculation:** Automatically deducts supplier purchase price, refurbishment parts, and warranty repair costs from the selling price.
- **Zero Float Rounding Errors:** Built entirely using integer minor units (cents) to guarantee accounting precision.
- **Supplier Scorecards:** Track supplier volume, defect rates, warranty failure frequency, and realized profit.
- **Stock Aging Alerts:** Visual indicators for 30, 60, and 90-day aging inventory to unblock tied-up shop capital.

### 🔐 5. Role-Based Access Control (RBAC)
- **👑 Shop Owner:** Full executive access to profit analytics, purchase costs, supplier book, staff management, and system settings.
- **🔧 Technician:** Intake queue, hardware diagnostic tasks, refurbishment checklists, and warranty service workbench (procurement and profit data hidden).
- **🎧 Support Desk:** Customer handover search, warranty claims triage, and status updates (restricted from finance and intake).

### 💾 6. Modern, Self-Contained Architecture (Node Native SQLite)
- **Zero Database Costs:** Powered by Node's built-in `node:sqlite`. No complicated MySQL/PostgreSQL installation or expensive cloud database hosting required.
- **Automatic Daily Snapshots:** Generates automatic daily SQLite snapshots with 14-day retention.
- **Guarded Safety Restore:** One-click backup restoration requiring password and text confirmation, with pre-restore safety snapshots.

---

## 🛠️ Technology Stack

- **Framework:** Next.js 16 (App Router)
- **Frontend UI:** React 19, Tailwind CSS v4, Modern Accessible HTML5
- **Database:** Node Native SQLite (`node:sqlite`)
- **Hardware Agent:** Windows PowerShell 5.1+ (Windows 10 & 11 compatible)
- **Deployment:** Docker, Docker Compose, Netlify, Render, Vercel, or any Linux VPS (Ubuntu/Debian)

---

## 📦 What's Included in the Download Package

1. **Complete Source Code:** Full Next.js 16 + React 19 source code (TypeScript, cleanly structured and commented).
2. **Windows Tester V4 Agent:** Complete installer, desktop launcher, interactive test scripts, and background collector.
3. **Comprehensive Documentation:** Single-page HTML guide + Markdown installation manual covering local, Docker, and cloud deployments.
4. **Sample Data & Testing Suite:** Pre-configured mock data, diagnostic reports, and automated smoke test scripts.
5. **Docker Configuration:** Ready-to-run `Dockerfile` and `compose.yaml` with persistent database volumes.

---

## 💻 System Requirements

- **Server:** Node.js 22.13.0 or higher (or Docker)
- **Hardware Test Bench:** Windows 10 or 11 (for running the Tester V4 agent on laptops being tested)
- **Memory:** Minimum 512 MB RAM (lightweight and fast)
- **Disk:** Minimum 200 MB free space

---

## 🏷️ Marketplace Tags & Keywords

`laptop repair software`, `computer shop management`, `refurbished laptop warranty`, `hardware diagnostic tool`, `qr code asset tracking`, `device passport`, `nextjs 16`, `react 19`, `sqlite`, `warranty management system`, `repair shop pos`, `service desk ticketing`, `electronics inventory`
