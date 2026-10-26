"""Generate Codester image assets and listing package for DevicePassport:
1. codester-cover.png (1200x675 px, 16:9 HD preview image)
2. codester-icon.png (200x200 px square thumbnail)
3. codester-description.txt (Formatted text ready to copy-paste)
"""

from pathlib import Path
import shutil
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "dist-codester"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# -------------------------------------------------------------
# 1. SQUARE ICON / THUMBNAIL (200x200 px)
# -------------------------------------------------------------
def create_icon():
    img = Image.new("RGBA", (200, 200), "#0E1017")
    draw = ImageDraw.Draw(img)
    
    # Rounded container
    draw.rounded_rectangle([4, 4, 195, 195], radius=28, fill="#181B26", outline="#3B82F6", width=4)
    
    # Laptop screen
    draw.rounded_rectangle([40, 36, 160, 110], radius=8, fill="#1E293B", outline="#60A5FA", width=2)
    draw.rectangle([50, 46, 150, 100], fill="#0F172A")
    
    # Status badges inside screen
    draw.rectangle([60, 56, 75, 71], fill="#10B981") # Green check
    draw.rectangle([125, 56, 140, 71], fill="#38BDF8") # Blue badge
    draw.rectangle([90, 78, 110, 88], fill="#F59E0B") # Yellow QR
    
    # Laptop base
    draw.polygon([(30, 116), (170, 116), (160, 126), (40, 126)], fill="#64748B")
    
    # Text "DEVICE PASSPORT"
    try:
        font_b = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 15)
        font_sub = ImageFont.truetype(r"C:/Windows/Fonts/segoeui.ttf", 10)
    except:
        font_b = font_sub = ImageFont.load_default()
        
    draw.text((100, 148), "DEVICE PASSPORT", fill="#F8FAFC", font=font_b, anchor="mm")
    draw.text((100, 168), "HARDWARE OS", fill="#38BDF8", font=font_sub, anchor="mm")
    
    # Verified green dot
    draw.ellipse([160, 18, 182, 40], fill="#10B981")
    
    icon_path = OUTPUT_DIR / "codester-icon.png"
    img.save(icon_path, "PNG")
    print(f"Created {icon_path} (200x200)")

# -------------------------------------------------------------
# 2. HD PREVIEW COVER (1200x675 px - 16:9)
# -------------------------------------------------------------
def create_cover():
    w, h = 1200, 675
    img = Image.new("RGBA", (w, h), "#0B0D13")
    draw = ImageDraw.Draw(img)
    
    # Inner border frame
    draw.rounded_rectangle([20, 20, w - 20, h - 20], radius=24, fill="#121622", outline="#252E42", width=3)
    
    # Top blue glow line
    draw.line([(60, 24), (w - 60, 24)], fill="#3B82F6", width=3)
    
    try:
        font_hero = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 46)
        font_sub = ImageFont.truetype(r"C:/Windows/Fonts/segoeui.ttf", 22)
        font_badge = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 16)
        font_card_head = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 18)
        font_body = ImageFont.truetype(r"C:/Windows/Fonts/segoeui.ttf", 17)
    except:
        font_hero = font_sub = font_badge = font_card_head = font_body = ImageFont.load_default()
        
    # Top badges
    draw.rounded_rectangle([60, 55, 260, 95], radius=10, fill="#1E293B", outline="#3B82F6", width=2)
    draw.text((160, 75), "NEXT.JS 16 + REACT 19", fill="#60A5FA", font=font_badge, anchor="mm")
    
    draw.rounded_rectangle([275, 55, 520, 95], radius=10, fill="#064E3B", outline="#10B981", width=2)
    draw.text((397, 75), "WINDOWS TESTER AGENT", fill="#34D399", font=font_badge, anchor="mm")
    
    draw.rounded_rectangle([535, 55, 750, 95], radius=10, fill="#78350F", outline="#F59E0B", width=2)
    draw.text((642, 75), "COMMERCIAL LICENSE", fill="#FDE68A", font=font_badge, anchor="mm")
    
    # Hero Title
    draw.text((60, 115), "DevicePassport", fill="#FFFFFF", font=font_hero)
    
    # Subtitle
    draw.text((60, 180), "Refurbished Laptop Health Diagnostics, QR Passports & Warranty System", fill="#94A3B8", font=font_sub)
    
    # Three Feature Cards Side by Side
    card_w = 345
    card_h = 360
    card_y = 240
    
    # Card 1: Diagnostic Engine
    x1 = 60
    draw.rounded_rectangle([x1, card_y, x1 + card_w, card_y + card_h], radius=16, fill="#181D2D", outline="#283248", width=2)
    draw.text((x1 + 24, card_y + 24), "⚡ HARDWARE DIAGNOSTICS", fill="#38BDF8", font=font_card_head)
    
    c1_bullets = [
        "• Native Windows Hardware Agent",
        "• 60-Key Interactive Matrix Listener",
        "• 6-Color Screen Dead-Pixel Cycling",
        "• Battery Cycles & Design Wear %",
        "• SSD SMART Power-On Hours",
        "• Tamper-Proof HMAC Signatures",
    ]
    by = card_y + 65
    for b in c1_bullets:
        draw.text((x1 + 24, by), b, fill="#E2E8F0", font=font_body)
        by += 44
        
    # Card 2: QR Passports & Warranty
    x2 = x1 + card_w + 30
    draw.rounded_rectangle([x2, card_y, x2 + card_w, card_y + card_h], radius=16, fill="#181D2D", outline="#283248", width=2)
    draw.text((x2 + 24, card_y + 24), "🏷️ QR PASSPORTS & CLAIMS", fill="#34D399", font=font_card_head)
    
    c2_bullets = [
        "• 40x25mm Laptop Lid QR Labels",
        "• Digital Verified Health Certificates",
        "• Account-Free Customer Claims",
        "• Live Public Repair Status Timeline",
        "• Service Desk Ticketing & SLA",
        "• Thermal Print Intake Tags & Sheets",
    ]
    by = card_y + 65
    for b in c2_bullets:
        draw.text((x2 + 24, by), b, fill="#E2E8F0", font=font_body)
        by += 44
        
    # Card 3: Business & Profit
    x3 = x2 + card_w + 30
    draw.rounded_rectangle([x3, card_y, x3 + card_w, card_y + card_h], radius=16, fill="#181D2D", outline="#283248", width=2)
    draw.text((x3 + 24, card_y + 24), "📊 PROFIT & ROLE PORTALS", fill="#FBBF24", font=font_card_head)
    
    c3_bullets = [
        "• 👑 Owner, 🔧 Tech & 🎧 Support Portals",
        "• Net Margin & P&L Analytics (Cents)",
        "• Supplier Defect & Return Scorecards",
        "• 30/60/90 Day Stock Aging Alerts",
        "• Zero-Cost Node Native SQLite",
        "• Docker Containerization Ready",
    ]
    by = card_y + 65
    for b in c3_bullets:
        draw.text((x3 + 24, by), b, fill="#E2E8F0", font=font_body)
        by += 44
        
    # Save cover
    cover_path = OUTPUT_DIR / "codester-cover.png"
    img.save(cover_path, "PNG")
    print(f"Created {cover_path} (1200x675)")

# -------------------------------------------------------------
# 3. CODESTER DESCRIPTION TEXT
# -------------------------------------------------------------
def create_description():
    desc = """DevicePassport is a complete, production-ready Hardware Diagnostic, QR Device Passport & Digital Warranty Verification Platform built for refurbished laptop retailers, computer repair workshops, electronics liquidators, and IT asset managers.

It bridges the gap between physical workshop testing and customer trust by coupling a native Windows diagnostic agent (automated 60-key keyboard matrix, 6-color screen dead-pixel test, battery health cycles, and SSD wear) with scannable QR device passports, digital warranty cards, and true gross-profit analytics.

----------------------------------------------------------------
LIVE INTERACTIVE DEMO:
https://device-passport-dulanjana.netlify.app/login
(Note: Live preview is a disposable sandbox for buyer evaluation. Production deployment requires persistent Docker/VPS or PostgreSQL cloud).

⚡ Instant 1-Click Role Login: Click "Owner", "Technician", or "Support" on the demo login screen for immediate access!
Manual Demo Credentials:
Email: owner@lapmart.lk
Password: devicepass
----------------------------------------------------------------

WHY EVERY REFURBISHED LAPTOP BUSINESS NEEDS THIS:
1. Eliminate Customer Distrust: Pre-owned laptop buyers worry about failing batteries and bad displays. DevicePassport gives every laptop an honest, verifiable digital health certificate.
2. Stop Warranty Disputes & Fraud: Paper receipts get lost or forged. Customers receive a permanent QR warranty card and can submit claims with photos without registering an account.
3. Cut Diagnostic Time to 2 Minutes: The included Windows agent collects real BIOS serials, battery cycles, and SSD SMART wear directly through Windows hardware APIs.
4. Track Real Net Profit: Know your true margins after factoring in supplier purchase cost, replacement parts (RAM/SSD), and warranty repair expenses.

KEY FEATURES:

1. NATIVE WINDOWS HARDWARE DIAGNOSTIC AGENT (TESTER V4):
- Automated Hardware Telemetry: Extracts BIOS serial number, CPU model, RAM capacity, battery charge cycle count, design vs. full capacity wear ratio, and SSD power-on hours automatically.
- 6-Color Dead-Pixel Screen Test: Cycles through pure Red, Green, Blue, White, Black, and Magenta to immediately expose dead sub-pixels, backlight bleed, and pressure bruises.
- 60-Key Keyboard Matrix Listener: Live interactive test highlighting pressed, stuck, or non-functioning keys.
- Webcam & Audio Verification: Integrated camera snapshot and dual-channel stereo tone test.
- Cryptographic HMAC-SHA256 Signatures: Every test report is cryptographically signed and encrypted using Windows DPAPI.
- Offline Resilient Queue: Automatically buffers test reports if the workshop Wi-Fi drops and uploads them upon reconnection.

2. QR ASSET LABELS & THERMAL PRINTING:
- 40 x 25 mm Laptop Lid Passports: Compact thermal QR stickers linking directly to the public device health record.
- 60 x 30 mm Intake Stock Tags: Applied upon receiving wholesale laptop batches.
- Printable A4 Workshop Job Sheets: Includes intake checklists and customer sign-off signature blocks.

3. DIGITAL WARRANTY MANAGEMENT & CUSTOMER CLAIM PORTAL:
- Digital Warranty Cards: Shows active coverage period, terms, and full service history.
- Account-Free Customer Claims: Customers simply scan their warranty card, describe the fault, attach up to 4 photos, and track repair status.
- Live Public Repair Timeline: Real-time progress updates from intake through diagnostic, parts ordering, bench repair, and collection.
- Service Desk Ticketing: Assign technicians, set internal notes, track SLA targets, and log replacement part costs.

4. TRUE P&L PROFIT & SUPPLIER ANALYTICS:
- Minor-Unit Integer Arithmetic: Zero floating-point rounding errors on financial computations.
- Net Margin Calculation: Deducts acquisition costs, replacement parts, and warranty claims from gross revenue.
- Supplier Scorecards: Compares suppliers by defect rate, return volume, and profitability.
- Stock Aging Alerts: Visual flags for units in stock over 30, 60, and 90 days.

5. MULTI-ROLE ACCESS CONTROL (RBAC):
- Owner Portal: Unrestricted access to P&L reports, purchase prices, supplier records, and system settings.
- Technician Portal: Focuses on hardware testing, intake inspections, and repair tasks (financial margins hidden).
- Support Desk: Manages customer claim intake, ticket assignments, and handover status.

6. ZERO-COST SELF-CONTAINED DATABASE:
- Built using modern Node.js native SQLite (node:sqlite).
- No expensive cloud database fees or complex external MySQL/PostgreSQL setup.
- Automated daily database backups with 14-day retention and one-click guarded restore.


7. RETAIL SHOP POINT-OF-SALE (POS) & SETTLEMENT:
- Split Payments: Accept Cash, Card, Bank Transfer, and Installment/BNPL (Koko, Mintpay) in any combination.
- Bulk Excel / CSV Ingestion: Import 50+ laptops in 5 seconds from wholesale container packing sheets.
- POS Hardware Upgrades: Customize RAM & SSDs at sale handover with atomic stock deduction and profit recalculation.
- Day-End Z-Report: Print 80mm ESC/POS thermal settlement slips showing cash drawer reconciliation and manager sign-off.

TECHNOLOGY STACK:
- Backend & SSR: Next.js 16 (App Router)
- Frontend UI: React 19, Tailwind CSS v4, Lucide Icons
- Database: Node Native SQLite (node:sqlite)
- Hardware Agent: Windows PowerShell 5.1+ (Windows 10 & 11)
- Database: Dual-Driver Engine (Node Native SQLite for local + PostgreSQL for Serverless/Cloud)
- Storage: Local Disk + Cloudflare R2 / AWS S3 Compatible ($0 Egress)
- Deployment: Docker & Docker Compose (Persistent Volumes), Linux VPS, Render (Persistent Disk), or Vercel (PostgreSQL)

WHAT YOU GET IN THE DOWNLOAD:
- Full Next.js 16 + React 19 Source Code (TypeScript)
- Windows Tester V4 Diagnostic Suite (Installers, scripts, and background collector)
- Comprehensive Offline Documentation (Interactive HTML guide + Markdown)
- Docker Configuration (Dockerfile & compose.yaml)
- Sample Dataset & Automated Smoke Tests
- Lifetime Updates & Dedicated Support
"""
    desc_path = OUTPUT_DIR / "codester-description.txt"
    desc_path.write_text(desc, encoding="utf-8")
    print(f"Created {desc_path}")

if __name__ == "__main__":
    create_icon()
    create_cover()
    create_description()
    
    # Copy main zip
    src_zip = ROOT / "dist-release" / "DevicePassport-v1.0.0-Commercial.zip"
    dest_zip = OUTPUT_DIR / "DevicePassport-v1.0.0-Source-and-Docs.zip"
    shutil.copyfile(src_zip, dest_zip)
    print(f"Copied main zip to {dest_zip}")
    print("ALL CODESTER ASSETS READY!")
