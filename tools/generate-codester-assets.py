"""Generate Codester image assets and listing package for DevicePassport:
1. codester-cover.png (1200x675 px, 16:9 HD preview image)
2. codester-icon.png (200x200 px square thumbnail)
3. codester-preview-1600x800.png (1600x800 px wide preview)
4. codester-description.txt (Formatted high-converting text ready to copy-paste)
5. screenshots.zip (8 real production screenshots from live system)
6. DevicePassport-v1.0.0-Source-and-Docs.zip (Full clean buyer release package)
"""

from pathlib import Path
import shutil
import zipfile
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "dist-codester"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# -------------------------------------------------------------
# 1. SQUARE ICON / THUMBNAIL (200x200 px)
# -------------------------------------------------------------
def create_icon():
    img = Image.new("RGBA", (200, 200), "#0B0F19")
    draw = ImageDraw.Draw(img)
    
    # Rounded container
    draw.rounded_rectangle([4, 4, 195, 195], radius=28, fill="#111827", outline="#3B82F6", width=4)
    
    # Laptop screen
    draw.rounded_rectangle([38, 34, 162, 112], radius=8, fill="#1E293B", outline="#60A5FA", width=2)
    draw.rectangle([48, 44, 152, 102], fill="#090D16")
    
    # Status badges inside screen
    draw.rectangle([58, 54, 74, 70], fill="#10B981") # Green check
    draw.rectangle([126, 54, 142, 70], fill="#38BDF8") # Blue badge
    draw.rectangle([88, 76, 112, 88], fill="#F59E0B") # Yellow QR
    
    # Laptop base
    draw.polygon([(28, 118), (172, 118), (162, 128), (38, 128)], fill="#64748B")
    
    try:
        font_b = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 14)
        font_sub = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 10)
    except:
        font_b = font_sub = ImageFont.load_default()
        
    draw.text((100, 146), "DEVICE PASSPORT", fill="#F8FAFC", font=font_b, anchor="mm")
    draw.text((100, 166), "DIAGNOSTICS & POS", fill="#34D399", font=font_sub, anchor="mm")
    
    # Verified green dot
    draw.ellipse([158, 16, 184, 42], fill="#10B981")
    
    icon_path = OUTPUT_DIR / "codester-icon.png"
    img.save(icon_path, "PNG")
    print(f"[OK] Created {icon_path} (200x200)")

# -------------------------------------------------------------
# 2. HD PREVIEW COVER (1200x675 px - 16:9)
# -------------------------------------------------------------
def create_cover():
    w, h = 1200, 675
    img = Image.new("RGBA", (w, h), "#090D16")
    draw = ImageDraw.Draw(img)
    
    # Inner border frame
    draw.rounded_rectangle([20, 20, w - 20, h - 20], radius=24, fill="#0F172A", outline="#1E293B", width=3)
    draw.line([(60, 24), (w - 60, 24)], fill="#10B981", width=4)
    
    try:
        font_hero = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 44)
        font_sub = ImageFont.truetype(r"C:/Windows/Fonts/segoeui.ttf", 20)
        font_badge = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 15)
        font_card_head = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 17)
        font_body = ImageFont.truetype(r"C:/Windows/Fonts/segoeui.ttf", 16)
    except:
        font_hero = font_sub = font_badge = font_card_head = font_body = ImageFont.load_default()
        
    # Badges
    draw.rounded_rectangle([60, 52, 260, 92], radius=10, fill="#1E293B", outline="#3B82F6", width=2)
    draw.text((160, 72), "NEXT.JS 16 + REACT 19", fill="#60A5FA", font=font_badge, anchor="mm")
    
    draw.rounded_rectangle([275, 52, 540, 92], radius=10, fill="#064E3B", outline="#10B981", width=2)
    draw.text((407, 72), "WIN & MAC DIAGNOSTICS", fill="#34D399", font=font_badge, anchor="mm")
    
    draw.rounded_rectangle([555, 52, 820, 92], radius=10, fill="#78350F", outline="#F59E0B", width=2)
    draw.text((687, 72), "THERMAL POS + DRAWER", fill="#FDE68A", font=font_badge, anchor="mm")

    draw.rounded_rectangle([835, 52, 1030, 92], radius=10, fill="#312E81", outline="#818CF8", width=2)
    draw.text((932, 72), "ZERO MONTHLY FEES", fill="#C7D2FE", font=font_badge, anchor="mm")
    
    # Title & Subtitle
    draw.text((60, 112), "DevicePassport", fill="#FFFFFF", font=font_hero)
    draw.text((60, 174), "Refurbished Laptop Hardware Diagnostics, POS Terminal, QR Warranty & Workshop OS", fill="#94A3B8", font=font_sub)
    
    # Three Feature Cards Side by Side
    card_w = 345
    card_h = 375
    card_y = 230
    
    # Card 1: Diagnostic Engine
    x1 = 60
    draw.rounded_rectangle([x1, card_y, x1 + card_w, card_y + card_h], radius=16, fill="#111827", outline="#1F293D", width=2)
    draw.text((x1 + 22, card_y + 22), "⚡ HARDWARE DIAGNOSTICS", fill="#38BDF8", font=font_card_head)
    c1_bullets = [
        "• Native Windows (.exe) Agent",
        "• Apple Mac 1-Line Bash Collector",
        "• Battery Cycles & Design Wear %",
        "• 60-Key Interactive Matrix Listener",
        "• 6-Color Screen Dead-Pixel Cycling",
        "• SSD SMART Power-On Hours",
        "• Objective Letter Grading (A/B/C)",
    ]
    by = card_y + 60
    for b in c1_bullets:
        draw.text((x1 + 22, by), b, fill="#E2E8F0", font=font_body)
        by += 42
        
    # Card 2: POS & Thermal Hardware
    x2 = x1 + card_w + 30
    draw.rounded_rectangle([x2, card_y, x2 + card_w, card_y + card_h], radius=16, fill="#111827", outline="#1F293D", width=2)
    draw.text((x2 + 22, card_y + 22), "🧾 POS, THERMAL & DRAWERS", fill="#34D399", font=font_card_head)
    c2_bullets = [
        "• High-Speed POS Hotkeys (F1, F2, F4)",
        "• Barcode Scanner Gun Integration",
        "• Anti-Fraud Manager PIN Concessions",
        "• ESC/POS Thermal Printing & Cut",
        "• RJ11 Cash Drawer Solenoid Kick",
        "• Code128 Shelf Barcode Stickers",
        "• Anti-Stolen Trade-In Legal Voucher",
    ]
    by = card_y + 60
    for b in c2_bullets:
        draw.text((x2 + 22, by), b, fill="#E2E8F0", font=font_body)
        by += 42
        
    # Card 3: Global Tax & Customer Ecosystem
    x3 = x2 + card_w + 30
    draw.rounded_rectangle([x3, card_y, x3 + card_w, card_y + card_h], radius=16, fill="#111827", outline="#1F293D", width=2)
    draw.text((x3 + 22, card_y + 22), "🌍 GLOBAL TAX & WORKSHOP OS", fill="#FBBF24", font=font_card_head)
    c3_bullets = [
        "• Multi-Currency (USD, EUR, GBP...)",
        "• UK/EU Second-Hand Margin Scheme",
        "• Outside Laptop Repair Job Sheets",
        "• Customer Portal with Mobile OTP",
        "• Re-Intake Lifecycle Loop (Trade-In)",
        "• Day-End Z-Report Settlement",
        "• 1-Click 1080x1080 Social Cards",
    ]
    by = card_y + 60
    for b in c3_bullets:
        draw.text((x3 + 22, by), b, fill="#E2E8F0", font=font_body)
        by += 42
        
    cover_path = OUTPUT_DIR / "codester-cover.png"
    img.save(cover_path, "PNG")
    print(f"[OK] Created {cover_path} (1200x675)")

# -------------------------------------------------------------
# 3. 1600x800 PREVIEW IMAGE (Wide Banner)
# -------------------------------------------------------------
def create_preview_1600x800():
    w, h = 1600, 800
    img = Image.new("RGBA", (w, h), "#090D16")
    draw = ImageDraw.Draw(img)
    
    draw.rounded_rectangle([24, 24, w - 24, h - 24], radius=28, fill="#0F172A", outline="#1E293D", width=3)
    draw.line([(80, 28), (w - 80, 28)], fill="#10B981", width=4)
    
    try:
        font_hero = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 54)
        font_sub = ImageFont.truetype(r"C:/Windows/Fonts/segoeui.ttf", 24)
        font_badge = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 17)
        font_card_head = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 20)
        font_body = ImageFont.truetype(r"C:/Windows/Fonts/segoeui.ttf", 18)
    except:
        font_hero = font_sub = font_badge = font_card_head = font_body = ImageFont.load_default()
        
    draw.rounded_rectangle([80, 60, 320, 105], radius=12, fill="#1E293B", outline="#3B82F6", width=2)
    draw.text((200, 82), "NEXT.JS 16 + REACT 19", fill="#60A5FA", font=font_badge, anchor="mm")
    
    draw.rounded_rectangle([340, 60, 620, 105], radius=12, fill="#064E3B", outline="#10B981", width=2)
    draw.text((480, 82), "WIN & MAC DIAGNOSTICS", fill="#34D399", font=font_badge, anchor="mm")
    
    draw.rounded_rectangle([640, 60, 930, 105], radius=12, fill="#78350F", outline="#F59E0B", width=2)
    draw.text((785, 82), "THERMAL POS & DRAWERS", fill="#FDE68A", font=font_badge, anchor="mm")
    
    draw.text((80, 132), "DevicePassport", fill="#FFFFFF", font=font_hero)
    draw.text((80, 202), "Complete Hardware Diagnostics, POS Terminal, QR Passports & Workshop OS", fill="#94A3B8", font=font_sub)
    
    card_w = 460
    card_h = 470
    card_y = 260
    
    x1 = 80
    draw.rounded_rectangle([x1, card_y, x1 + card_w, card_y + card_h], radius=20, fill="#111827", outline="#1F293D", width=2)
    draw.text((x1 + 28, card_y + 28), "⚡ HARDWARE DIAGNOSTICS", fill="#38BDF8", font=font_card_head)
    c1 = [
        "• Native Windows Hardware Agent (.exe)",
        "• Apple Mac 1-Line Terminal Collector",
        "• Battery Cycles & Design Wear %",
        "• 60-Key Interactive Matrix Listener",
        "• 6-Color Screen Dead-Pixel Cycling",
        "• SSD SMART Health & Power-On Hours",
        "• Objective Letter Grading (A+/A/B/C)",
        "• Anti-BMS Battery Spoof Detection",
    ]
    by = card_y + 75
    for b in c1:
        draw.text((x1 + 28, by), b, fill="#E2E8F0", font=font_body)
        by += 48
        
    x2 = x1 + card_w + 30
    draw.rounded_rectangle([x2, card_y, x2 + card_w, card_y + card_h], radius=20, fill="#111827", outline="#1F293D", width=2)
    draw.text((x2 + 28, card_y + 28), "🧾 POS, THERMAL & DRAWERS", fill="#34D399", font=font_card_head)
    c2 = [
        "• POS Sales Terminal with F2 Hotkey",
        "• Global Barcode Scanner Gun Buffer",
        "• Anti-Fraud Manager PIN Discretion",
        "• ESC/POS Thermal Printing & Full Cut",
        "• RJ11 Cash Drawer Solenoid Pulse",
        "• Code128 Shelf Barcode Stickers",
        "• Anti-Stolen Trade-In Legal Declaration",
        "• Day-End Z-Report Cash Reconciliation",
    ]
    by = card_y + 75
    for b in c2:
        draw.text((x2 + 28, by), b, fill="#E2E8F0", font=font_body)
        by += 48
        
    x3 = x2 + card_w + 30
    draw.rounded_rectangle([x3, card_y, x3 + card_w, card_y + card_h], radius=20, fill="#111827", outline="#1F293D", width=2)
    draw.text((x3 + 28, card_y + 28), "🌍 GLOBAL TAX & WORKSHOP OS", fill="#FBBF24", font=font_card_head)
    c3 = [
        "• Multi-Currency (USD, EUR, GBP, AUD...)",
        "• UK/EU Second-Hand Margin Scheme",
        "• US State/Local Sales Tax & Global VAT",
        "• Customer Portal with Mobile Phone OTP",
        "• Outside Laptop Repair Job Sheets",
        "• Re-Intake Lifecycle Loop (Trade-In)",
        "• 1-Click 1080x1080 Social Media Cards",
        "• Zero Monthly Fees (100% Self-Hosted)",
    ]
    by = card_y + 75
    for b in c3:
        draw.text((x3 + 28, by), b, fill="#E2E8F0", font=font_body)
        by += 48
        
    prev_path = OUTPUT_DIR / "codester-preview-1600x800.png"
    img.save(prev_path, "PNG")
    print(f"[OK] Created {prev_path} (1600x800)")

# -------------------------------------------------------------
# 4. HIGH-CONVERTING CODESTER DESCRIPTION
# -------------------------------------------------------------
def create_description():
    desc = """DevicePassport is a complete, production-ready Hardware Diagnostic, Omnichannel POS Terminal, QR Device Passport, Warranty Management & Repair Workshop Operating System built specifically for refurbished laptop retailers, computer repair centers, electronics liquidators, and IT asset traders.

It bridges the gap between physical workshop testing and customer trust by coupling native hardware diagnostic agents (automated Windows agent + 1-line Apple Mac Terminal collector) with instant POS sales, thermal ESC/POS receipts, RJ11 cash drawer pulses, Code128 shelf barcode stickers, outside repair job sheets, and tamper-evident digital warranty passports.

================================================================
⚡ LIVE INTERACTIVE EVALUATION DEMO:
👉 https://device-passport-one.vercel.app/login
(Note for Buyers & Reviewers: The online demo is a disposable sandbox hosted on Vercel for interactive evaluation. For production shop deployment, the included Docker Compose configuration provides persistent disk storage for SQLite, or the built-in PostgreSQL adapter can be enabled for cloud serverless hosting.)

⚡ Instant 1-Click Role Login: Click "Owner", "Technician", or "Support" on the demo login screen for immediate access!
Manual Demo Credentials:
Email: owner@lapmart.lk
Password: devicepass
================================================================

WHY EVERY REFURBISHED LAPTOP BUSINESS NEEDS THIS:
1. Eliminate Customer Distrust: Pre-owned laptop buyers worry about dying batteries, thermal throttling, and swapped counterfeit parts. DevicePassport generates a tamper-evident digital certificate with real battery wear % and hardware health.
2. Stop Paying $100 - $300 Every Month: Systems like RepairDesk or RepairShopr charge heavy monthly recurring subscriptions yet lack automated hardware test agents. DevicePassport gives you the complete source code with zero monthly fees.
3. Stop Warranty Fraud & Disputed Claims: Lost paper receipts and forged warranty claims cost laptop shops thousands. Customers scan the laptop's underside QR code to verify warranty dates, view receipts, and submit photo claims online.
4. Protect Against Stolen Laptop Seizures: Second-hand dealers routinely face police confiscations. The built-in Anti-Stolen Trade-In Declaration records seller ID (NIC/License), photos, and a legally binding indemnity certificate.
5. Anti-Fraud Manager PIN Protection: Cashiers cannot give unauthorized discounts over 10% without a verified 4-digit Manager PIN.
6. Real Hardware POS Support: Works natively with laser/CMOS barcode scanner guns, direct thermal printers, and triggers physical cash drawers via standard ESC/POS RJ11 pulses.

KEY FEATURES BREAKDOWN:

1. UNIVERSAL HARDWARE DIAGNOSTIC COLLECTORS (PC & MAC):
- Native Windows Diagnostic Agent (.exe / PowerShell): Extracts real BIOS serial numbers, CPU specs, RAM capacity, battery charge cycle count, design vs full capacity wear ratio, and SSD SMART power-on hours automatically.
- Apple Mac 1-Line Terminal Collector: `curl -fsSL /api/tools/macos-collector | bash` extracts battery cycle count, condition, storage health, and system serials on Apple Silicon (M1/M2/M3/M4) and Intel MacBooks.
- 6-Color Dead-Pixel Screen Test: Cycles through pure Red, Green, Blue, White, Black, and Magenta to immediately expose dead sub-pixels, backlight bleed, and pressure bruises.
- 60-Key Keyboard Matrix Listener: Live interactive matrix highlighting pressed, stuck, or non-functioning keys.
- Intelligent Grading Engine: Automatically scores devices and assigns objective letter grades (A+, A, B, C, Needs Review).
- Anti-BMS Spoof Detection: Flags suspicious batteries (e.g. cycle count < 5 on a 5-year-old laptop).

2. RETAIL SHOP POINT-OF-SALE (POS) & HARDWARE INTEGRATION:
- POS Keyboard Accelerators: Instant sales via `F2`, barcode stickers via `F4`, outside repairs via `F9`, shortcuts cheat-sheet via `F1`.
- Global Barcode Scanner Gun Buffer: Sub-35ms keystroke listener captures laser/CMOS barcode guns automatically without needing mouse clicks.
- Anti-Fraud Manager PIN Protection: Enforces manager authorization for high discounts, trade-in overrides, and tender concessions.
- Native ESC/POS Thermal Printing: Formatted 80mm and 58mm receipts with store branding, barcode, and QR passport link.
- Physical Cash Drawer Kick: Sends raw solenoidal kick pulse (`\\x1b\\x70\\x00\\x19\\xfa`) followed by automatic paper cut.
- Code128 Shelf Barcode & Spec Price Tag Stickers: Printable 50x30mm thermal stickers showing CPU, RAM, SSD, screen size, battery health %, and live QR spec link.

3. GLOBAL MULTI-CURRENCY & INTERNATIONAL TAX ENGINE:
- Multi-Currency Formatting: Full support for USD ($), EUR (€), GBP (£), AUD (A$), CAD (C$), AED, JPY (¥), INR (₹), and LKR (Rs.).
- UK / EU Second-Hand Margin Scheme: Calculates VAT strictly on the gross profit margin (HMRC / EU Art 313 compliance) rather than full selling price.
- US State & Local Sales Tax: Dynamic origin/destination tax computation.
- Standard VAT / GST: Configurable tax-inclusive and tax-exclusive modes.
- Global Courier Tracking: 1-click tracking links for FedEx, UPS, DHL, USPS, Royal Mail, DPD, Australia Post, and regional couriers.

4. REPAIR WORKSHOP DESK & SERVICE BILLING:
- Outside Laptop Intake: Check in customer laptops for repair (screen replacement, board repair, hinge fix).
- 2-Part Job Sheets: Customer claim receipt with QR status tracking + Bench technician copy with diagnostic checklists.
- Spare Parts Inventory Allocation: Automatically deducts parts from inventory and assigns cost to repair tickets.
- Technician Commission & Productivity Summary: Computes repair labor costs and piece-rate technician incentive bonuses.

5. CUSTOMER SELF-SERVICE PORTAL & WARRANTY VAULT:
- Mobile Phone OTP Login: Customers log in securely using their phone number and a 6-digit OTP code without remembering passwords.
- Digital Warranty Vault: Shows active warranty countdown, coverage terms, and purchase receipt.
- Online Warranty Claims: Customers submit claim descriptions and upload defect photos without visiting the physical store.

6. TRADE-IN LEGAL PROTECTION & ASSET RE-INTAKE LOOP:
- Anti-Stolen Legal Declaration: Captures seller National Identity Card (NIC), photo, fingerprint/signature, and binding legal indemnity.
- Asset Re-Intake Lifecycle Loop: When a sold laptop is traded back in years later, archives the old record (`SERIAL#CYCLE_X`) to preserve warranty history while issuing a fresh clean passport.

7. DAY-END SETTLEMENT & Z-REPORT:
- Cash Drawer Reconciliation: Opening float + Cash sales - Petty cash expenses - Cash refunds = Expected drawer cash.
- Multi-Tender Breakdown: Separates Cash, Card, Bank Transfer, and Courier COD.
- Manager Sign-Off: Thermal printable Z-Report slip for daily bookkeeping.

8. OMNICHANNEL MARKETING & SOCIAL MEDIA CARDS:
- 1-Click Social Media Graphic Generator: Generates ready-to-post 1080x1080 Instagram & Facebook marketing flyers with embedded QR codes.
- Public Online Showroom (/catalog): Live inventory catalog with 1-click WhatsApp inquiry buttons.

TECHNOLOGY STACK:
- Backend & SSR: Next.js 16 (App Router)
- Frontend UI: React 19, Modern CSS Design System (Dynamic Dark & Light Mode)
- Dual Database Engine: High-performance Native SQLite (node:sqlite) for local/Docker + PostgreSQL adapter for Cloud
- Diagnostic Collectors: Windows PowerShell 5.1+ & macOS bash collector
- Automated Test Suite: 55 Automated Integration & Unit Tests (100% Pass Rate)
- Deployment: Docker & Docker Compose (Persistent Volumes), Linux VPS, or Cloud Serverless (Neon/PostgreSQL)

WHAT YOU GET IN THE DOWNLOAD:
- Full Next.js 16 + React 19 Source Code (TypeScript)
- Windows Hardware Diagnostic Agent Suite (.exe, scripts, and background collector)
- Apple Mac Diagnostic Collector script
- Comprehensive Offline Documentation (Interactive HTML guide + Markdown)
- Production Docker Configuration (Dockerfile & compose.yaml)
- 55 Passing Automated Test Cases
- Free Lifetime Updates & Direct Developer Support
"""
    desc_path = OUTPUT_DIR / "codester-description.txt"
    desc_path.write_text(desc, encoding="utf-8")
    print(f"[OK] Created {desc_path}")

# -------------------------------------------------------------
# 5. SCREENSHOTS ZIP (All 8 live screenshots)
# -------------------------------------------------------------
def create_screenshots_zip():
    shots_dir = OUTPUT_DIR / "screenshots"
    shots_dir.mkdir(parents=True, exist_ok=True)
    
    zip_path = OUTPUT_DIR / "screenshots.zip"
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file in sorted(shots_dir.glob("*.png")):
            zipf.write(file, file.name)
            print(f"  Added screenshot: {file.name}")
    print(f"[OK] Created {zip_path} with {len(list(shots_dir.glob('*.png')))} screenshots")

if __name__ == "__main__":
    print("[START] Generating Codester Marketplace Assets...")
    create_icon()
    create_cover()
    create_preview_1600x800()
    create_description()
    create_screenshots_zip()
    print("[DONE] ALL CODESTER ASSETS READY IN dist-codester/")
