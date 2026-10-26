# DevicePassport — Refurbished Laptop Health Reports, Digital QR Passports & Warranty Service Desk (Next.js 16 + Dual PostgreSQL/SQLite + Hardware Agents)

> **The ultimate operating system for refurbished laptop retailers, electronics liquidators, and computer repair workshops.** Turn every hardware inspection into buyer trust, streamline digital warranties, and track true net profit per machine.

---

### 🌐 Live Interactive Demo
- **Live Demo URL:** [https://device-passport-dulanjana.netlify.app/login](https://device-passport-dulanjana.netlify.app/login)
- **⚡ 1-Click Role Login:** Click **👑 Owner**, **🔧 Technician**, or **🎧 Support** on the login page for instant access (no typing needed!).
- **Manual Credentials:** Email: `owner@lapmart.lk` | Password: `devicepass`
- **Note:** The live online demo runs as a disposable sandbox for evaluation. Production deployments utilize persistent Docker storage or PostgreSQL.

---

## 💡 Why DevicePassport?

Selling refurbished and pre-owned laptops is plagued by two massive problems:
1. **Buyer Distrust:** Customers are afraid of buying laptops with dying batteries, failing SSDs, or hidden hardware faults.
2. **Disorganized Warranties & Disputes:** Paper receipts get lost, customers claim verbal warranties that expired months ago, and repair job sheets clutter the workshop bench.

**DevicePassport completely solves this.** Technicians run a native Windows agent or Bootable Linux Live USB that extracts real BIOS serials, battery charge cycles, SSD SMART health, thermal throttling logs, and conducts guided screen, keyboard, and audio tests.

Once approved, a **tamper-proof 40 × 25 mm QR passport label** is printed for the laptop lid. When a customer scans it, they see an honest, certified health report. When sold, a **digital warranty card** is activated with a passwordless customer portal, POS thermal invoice, and live repair claim tracking!

---

## 🔥 Key Features & Capabilities

### ⚡ 1. Enterprise Hardware Diagnostics & Benchmarking
- **Windows Tester V4 & Bootable Linux USB Agent:** Gathers BIOS serials, board UUID, CPU stress stability, RAM modules, battery charge cycles, battery wear level, and NVMe SMART health directly from hardware APIs.
- **Real Battery 3-Minute Stress Test:** Measures actual discharge rates (%/hr) and voltage drops under 100% load to uncover spoofed BMS cycle counts and degraded cells.
- **Thermal Throttling & Fan Health:** Logs CPU junction temperatures under load to detect dried thermal paste, heatsink clogging, and fan failure risks.
- **Component Genuine OEM Verification:** Cross-references Motherboard, RAM, Storage, and Battery serials against intake baselines to catch unauthorized component swaps and counterfeit parts.
- **NIST 800-88 Data Sanitization Certificates:** Generates official cryptographic data wipe certificates (NIST SP 800-88 Rev 1 Purge/Clear & DoD 5220.22-M) for corporate and bank off-lease laptops.
- **Interactive Component Tests:** 6-color dead-pixel screen test, 60-key keyboard matrix tester, stereo audio channel test, and webcam capture.

### 🏷️ 2. Physical QR Asset Labels & Thermal Invoicing
- **40 × 25 mm Laptop Lid Passports:** Compact QR asset labels linking straight to the public device health passport.
- **60 × 30 mm Intake Tags:** Internal stock tracking stickers printed upon receiving laptops from suppliers.
- **ESC/POS 80mm & 58mm Thermal Invoices:** Print instant receipts at the counter with embedded warranty QR codes.
- **Corporate A4 Tax Invoices & Bench Sheets:** Full-page invoices with VAT/TIN numbers and workshop repair job sheets.

### 🛡️ 3. Anti-Fraud Warranty & Customer Self-Service Portal
- **Tamper-Evident Security Seals:** Track holographic seal serial numbers placed over laptop chassis screws; system automatically voids warranties if seals are broken.
- **Passwordless Customer OTP Portal:** Customers log in using a 6-digit SMS/WhatsApp OTP sent to their mobile number to view their laptops, warranty terms, and invoice copies.
- **Account-Free Claim Submission:** Customers scan their warranty card, describe the fault, and attach photos without complex registration.
- **Live Customer Status Timeline:** Private tracker keeping customers informed through triage, parts ordering, bench repair, and collection.

### 📦 4. Spare Parts Inventory & Multi-Branch Stock Transfers
- **Spare Parts Stock Control:** Dedicated inventory for RAM, NVMe SSDs, laptop batteries, screens, keyboards, and chargers with low-stock alerts.
- **Atomic Parts Allocation:** Technicians allocate replacement parts to refurbishment tasks, immediately decrementing inventory and adding real costs to the laptop.
- **Multi-Branch Transfers:** Dispatch and receive laptop and parts transfers between Main Warehouse, Showrooms, and Service Centers with tracking numbers.

### 💰 5. True Realized Net Profit & Trade-In Engine
- **Integer-Cent Accounting Precision:** True net profit calculated as `Sale Price - (Intake Cost + Spare Parts + Technician Labor + Warranty Repairs)`.
- **Laptop Trade-In Valuation Calculator:** Objective formula based on base market value, cosmetic grade multipliers (A/B/C/D), and battery/screen deductions.
- **Supplier Scorecards:** Track defect rates and warranty claim expenses per supplier to avoid loss-making bulk stock.

### 📱 6. Omnichannel WhatsApp Automation & Public Catalog
- **Meta WhatsApp Cloud API ($0 Tier):** Dispatches automated warranty activation notices, claim status updates, and ready-for-pickup notices (includes 1,000 free conversations/month).
- **1-Click Click-to-Chat Fallback (`wa.me`):** Zero-setup direct WhatsApp links for staff when API credentials are unset.
- **Google Reviews Booster:** Sends post-repair 5-star review request messages with showroom incentives (10% off next visit).
- **Live Public Stock Catalog:** Customer-facing web showroom with filters (Brand, RAM, CPU tier, Grade, Price) and 1-click WhatsApp inquiry buttons.
- **1-Click 1080x1080 Social Media Graphic Generator:** Generates high-converting promotional banners (SVG & HTML) with embedded QR codes for Facebook Marketplace and Instagram.

### 🏪 8. Ground-Level Retail Shop & POS Operations
- **Split Payments & Multi-Tender Reconciliation:** Accept Cash, Credit/Debit Cards, Direct Bank Transfers, and Installments (Koko/Mintpay BNPL). Split single orders across multiple tenders with exact penny math.
- **Bulk Stock CSV / Excel Import Engine:** Ingest 50+ laptops in 5 seconds from wholesale container packing lists. Supports direct copy-paste from Excel or CSV files, duplicate serial detection, and automatic supplier creation.
- **Point-of-Sale (POS) Hardware Customization:** Upgrade RAM or SSD at the point of sale handover. Automatically decrements parts inventory, records task allocations, and recalculates real net profit without losing margins.
- **Day-End Z-Report (Daily Settlement Slip):** Print comprehensive 80mm ESC/POS settlement slips for daily closing. Includes gross turnover, tender breakdown, drawer cash audit (expected vs counted), sales journal, and cashier/manager signature lines.

### 💾 7. Enterprise Dual-Engine Architecture (Cloud & Local)
- **PostgreSQL & SQLite Dual-Driver:** Seamlessly runs on local SQLite for offline workshop benches or PostgreSQL (Neon/Supabase) for serverless cloud scaling.
- **Zero-Egress Cloud Storage:** Native Cloudflare R2 / AWS S3 support with local fallback.
- **Automatic Daily Snapshots:** Generates automatic daily SQLite snapshots with 14-day retention.
- **Guarded Safety Restore:** One-click backup restoration requiring password and text confirmation.

---

## 🛠️ Technology Stack

- **Framework:** Next.js 16 (App Router)
- **Frontend UI:** React 19, Tailwind CSS v4, Modern Accessible HTML5
- **Database:** Dual-Driver Engine (Built-in native SQLite for local workshops + PostgreSQL for serverless cloud like Neon/Supabase)
- **Storage:** Local Disk Storage + Cloudflare R2 / AWS S3 ($0 Egress)
- **Hardware Agents:** 
  - Native Windows PowerShell 5.1+ (Windows 10 & 11 compatible)
  - Bootable Linux Live USB Agent (Debian/Ubuntu/Alpine for bare drives)
- **Deployment:** Docker & Docker Compose (Persistent Volume), Linux VPS (Ubuntu/Debian), or Serverless Cloud (Vercel with PostgreSQL)
- **Live Demo:** Hosted on Netlify as a disposable preview for buyer evaluation

---

## 📦 What's Included in the Download Package

1. **Complete Source Code:** Full Next.js 16 + React 19 source code (TypeScript, cleanly structured and commented).
2. **Windows Tester V4 Agent:** Complete installer, desktop launcher, interactive test scripts, and background collector.
3. **Bootable Linux Live USB Agent:** Autonomous diagnostics shell script and Ventoy deployment instructions.
4. **Comprehensive Documentation:** Single-page HTML guide + Markdown installation manual covering local, Docker, and cloud deployments.
5. **Sample Data & Automated Testing Suite:** 24 comprehensive unit and regression tests (100% pass rate).
6. **Docker Configuration:** Ready-to-run `Dockerfile` and `compose.yaml` with persistent database volumes.

---

## 💻 System Requirements

- **Server:** Node.js 22.13.0 or higher (or Docker)
- **Hardware Test Bench:** Windows 10 or 11 (for running Tester V4) or Linux Live USB (for OS-less machines)
- **Memory:** Minimum 512 MB RAM (lightweight and fast)
- **Disk:** Minimum 200 MB free space

---

## 🏷️ Marketplace Tags & Keywords

`laptop repair software`, `computer shop management`, `refurbished laptop warranty`, `hardware diagnostic tool`, `qr code asset tracking`, `device passport`, `nextjs 16`, `react 19`, `sqlite`, `postgresql`, `warranty management system`, `repair shop pos`, `service desk ticketing`, `electronics inventory`, `nist 800-88`
