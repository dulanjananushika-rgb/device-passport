"""Generate CodeCanyon image assets for DevicePassport:
1. thumbnail.png (80x80 px)
2. preview.png (590x300 px)
3. Ready-to-copy HTML item description
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"D:/deploy/device-passport")
OUTPUT_DIR = ROOT / "dist-codecanyon"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# -------------------------------------------------------------
# 1. THUMBNAIL (80x80 px)
# -------------------------------------------------------------
def create_thumbnail():
    thumb = Image.new("RGBA", (80, 80), "#0E1017")
    draw = ImageDraw.Draw(thumb)
    
    # Rounded border or card
    draw.rounded_rectangle([2, 2, 77, 77], radius=12, fill="#181B26", outline="#3B82F6", width=2)
    
    # Shield / Icon shape in center
    # Top crown/laptop icon representation
    draw.rounded_rectangle([18, 16, 62, 44], radius=4, fill="#1E293B", outline="#60A5FA", width=1)
    # Screen inner
    draw.rectangle([22, 20, 58, 38], fill="#0F172A")
    # Little QR check inside screen
    draw.rectangle([26, 24, 32, 30], fill="#10B981")
    draw.rectangle([48, 24, 54, 30], fill="#38BDF8")
    draw.rectangle([37, 31, 43, 35], fill="#F59E0B")
    
    # Laptop base
    draw.polygon([(14, 46), (66, 46), (62, 49), (18, 49)], fill="#475569")
    
    # Text "DP" or "PASSPORT"
    try:
        font_sm = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 10)
    except:
        font_sm = ImageFont.load_default()
    
    draw.text((40, 60), "PASSPORT", fill="#F8FAFC", font=font_sm, anchor="mm")
    
    # Badge dot
    draw.ellipse([64, 8, 72, 16], fill="#10B981")
    
    thumb_path = OUTPUT_DIR / "thumbnail.png"
    thumb.save(thumb_path, "PNG")
    print(f"Created {thumb_path} (80x80)")

# -------------------------------------------------------------
# 2. INLINE PREVIEW (590x300 px)
# -------------------------------------------------------------
def create_preview():
    img = Image.new("RGBA", (590, 300), "#0B0D13")
    draw = ImageDraw.Draw(img)
    
    # Subtle gradient background card
    draw.rounded_rectangle([12, 12, 577, 287], radius=16, fill="#121622", outline="#252D3D", width=2)
    
    # Top banner glow line
    draw.line([(30, 14), (550, 14)], fill="#3B82F6", width=2)
    
    try:
        font_title = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 26)
        font_subtitle = ImageFont.truetype(r"C:/Windows/Fonts/segoeui.ttf", 12)
        font_badge = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 10)
        font_pill = ImageFont.truetype(r"C:/Windows/Fonts/segoeui.ttf", 11)
        font_bold_sm = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 11)
    except:
        font_title = font_subtitle = font_badge = font_pill = font_bold_sm = ImageFont.load_default()
        
    # Badges at top
    draw.rounded_rectangle([32, 32, 140, 52], radius=6, fill="#1E293B", outline="#3B82F6")
    draw.text((86, 42), "NEXT.JS 16 + SQLITE", fill="#60A5FA", font=font_badge, anchor="mm")
    
    draw.rounded_rectangle([148, 32, 280, 52], radius=6, fill="#064E3B", outline="#10B981")
    draw.text((214, 42), "WINDOWS TESTER AGENT", fill="#34D399", font=font_badge, anchor="mm")
    
    # Main Title
    draw.text((32, 68), "DevicePassport", fill="#FFFFFF", font=font_title)
    
    # Gold Highlight tag
    draw.rounded_rectangle([250, 72, 350, 94], radius=6, fill="#78350F", outline="#F59E0B")
    draw.text((300, 83), "COMMERCIAL", fill="#FDE68A", font=font_badge, anchor="mm")
    
    # Subtitle
    draw.text((32, 106), "Refurbished Laptop Health, QR Passports & Warranty Service Desk", fill="#94A3B8", font=font_subtitle)
    
    # Feature Grid Box Left
    draw.rounded_rectangle([32, 138, 280, 266], radius=10, fill="#171C2B", outline="#252E40")
    draw.text((44, 150), "HARDWARE DIAGNOSTICS & QR", fill="#38BDF8", font=font_bold_sm)
    
    bullets_left = [
        "• 60-Key Interactive Matrix & Dead-Pixel",
        "• Real Battery Cycles & SSD Wear Health",
        "• Tamper-Proof 40x25mm QR Passport Labels",
        "• Cryptographic HMAC-SHA256 Signatures",
    ]
    y = 172
    for b in bullets_left:
        draw.text((44, y), b, fill="#CBD5E1", font=font_pill)
        y += 22
        
    # Feature Grid Box Right
    draw.rounded_rectangle([296, 138, 558, 266], radius=10, fill="#171C2B", outline="#252E40")
    draw.text((308, 150), "WORKSHOP MANAGEMENT & PROFIT", fill="#34D399", font=font_bold_sm)
    
    bullets_right = [
        "• Owner, Technician & Support Role Portals",
        "• Digital Warranty Cards & Self-Claim Portal",
        "• Minor-Unit Cents P&L Profit Margins",
        "• Node Native SQLite (Zero Cloud DB Cost)",
    ]
    y = 172
    for b in bullets_right:
        draw.text((308, y), b, fill="#CBD5E1", font=font_pill)
        y += 22
        
    preview_path = OUTPUT_DIR / "preview.png"
    img.save(preview_path, "PNG")
    print(f"Created {preview_path} (590x300)")

# -------------------------------------------------------------
# 3. CODECANYON HTML DESCRIPTION
# -------------------------------------------------------------
def create_description():
    html = """<!-- CodeCanyon HTML Item Description for DevicePassport -->
<p>
    <strong>DevicePassport</strong> is a comprehensive, production-grade <strong>Hardware Diagnostic, QR Passport & Digital Warranty Verification Platform</strong> specifically engineered for <strong>refurbished laptop shops, computer repair workshops, electronics liquidators, and IT asset managers</strong>.
</p>

<p>
    It bridges the gap between physical workshop testing and customer trust by coupling a <strong>native Windows diagnostic agent</strong> (automated 60-key keyboard matrix, 6-color screen dead-pixel test, battery health cycles, and SSD wear) with <strong>scannable QR device passports</strong>, digital warranty claim cards, and true gross-profit analytics.
</p>

<hr>

<h3>🌐 Live Interactive Demo</h3>
<ul>
    <li><strong>Live Demo URL:</strong> <a href="https://device-passport-dulanjana.netlify.app/login" target="_blank">https://device-passport-dulanjana.netlify.app/login</a></li>
    <li><strong>⚡ 1-Click Role Login:</strong> Click <strong>👑 Owner</strong>, <strong>🔧 Technician</strong>, or <strong>🎧 Support</strong> on the demo login screen for instant access!</li>
    <li><strong>Manual Demo Credentials:</strong>
        <ul>
            <li><strong>Email:</strong> <code>owner@lapmart.lk</code></li>
            <li><strong>Password:</strong> <code>devicepass</code></li>
        </ul>
    </li>
</ul>

<hr>

<h3>💡 Why Every Refurbished Laptop Business Needs This</h3>
<ol>
    <li><strong>Eliminate Customer Distrust:</strong> Pre-owned buyers worry about failing batteries and bad displays. DevicePassport gives every laptop an honest, verifiable digital health certificate.</li>
    <li><strong>Stop Warranty Fraud & Lost Paper Receipts:</strong> Paper warranty receipts get lost or forged. Customers receive a permanent QR warranty card and can submit claims with photos without registering an account.</li>
    <li><strong>Cut Diagnostic Time to 2 Minutes:</strong> The included Windows agent collects real BIOS serials, battery cycles, and SSD SMART wear directly through Windows hardware APIs.</li>
    <li><strong>Track Real Net Profit:</strong> Know your true margins after factoring in supplier purchase cost, replacement parts (RAM/SSD), and warranty repair expenses.</li>
</ol>

<hr>

<h3>🔥 Key Features</h3>

<h4>1. ⚡ Native Windows Hardware Diagnostic Agent (Tester V4)</h4>
<ul>
    <li><strong>Automated Hardware Telemetry:</strong> Extracts BIOS serial number, CPU model, RAM capacity, battery charge cycle count, design vs. full capacity wear ratio, and SSD power-on hours automatically.</li>
    <li><strong>6-Color Dead-Pixel Screen Test:</strong> Cycles through pure Red, Green, Blue, White, Black, and Magenta to immediately expose dead sub-pixels, backlight bleed, and pressure bruises.</li>
    <li><strong>60-Key Keyboard Matrix Listener:</strong> Live interactive test highlighting pressed, stuck, or non-functioning keys.</li>
    <li><strong>Webcam & Audio Verification:</strong> Integrated camera snapshot and dual-channel stereo tone test.</li>
    <li><strong>Cryptographic HMAC-SHA256 Signatures:</strong> Every test report is cryptographically signed and encrypted using Windows DPAPI. Tampered reports are rejected automatically.</li>
    <li><strong>Offline Resilient Queue:</strong> Automatically buffers test reports if the workshop Wi-Fi drops and uploads them upon reconnection.</li>
</ul>

<h4>2. 🏷️ QR Asset Labels & Thermal Printing</h4>
<ul>
    <li><strong>40 × 25 mm Laptop Lid Passports:</strong> Compact thermal QR stickers linking directly to the public device health record.</li>
    <li><strong>60 × 30 mm Intake Stock Tags:</strong> Applied upon receiving wholesale laptop batches.</li>
    <li><strong>Printable A4 Workshop Job Sheets:</strong> Includes intake checklists and customer sign-off signature blocks.</li>
</ul>

<h4>3. 🛡️ Digital Warranty Management & Customer Claim Portal</h4>
<ul>
    <li><strong>Digital Warranty Cards:</strong> Shows active coverage period, terms, and full service history.</li>
    <li><strong>Account-Free Customer Claims:</strong> Customers simply scan their warranty card, describe the fault, attach up to 4 photos, and track repair status.</li>
    <li><strong>Live Public Repair Timeline:</strong> Real-time progress updates from intake through diagnostic, parts ordering, bench repair, and collection.</li>
    <li><strong>Service Desk Ticketing:</strong> Assign technicians, set internal notes, track SLA targets, and log replacement part costs.</li>
</ul>

<h4>4. 📊 True P&L Profit & Supplier Analytics</h4>
<ul>
    <li><strong>Minor-Unit Integer Arithmetic:</strong> Zero floating-point rounding errors on financial computations.</li>
    <li><strong>Net Margin Calculation:</strong> Deducts acquisition costs, replacement parts, and warranty claims from gross revenue.</li>
    <li><strong>Supplier Scorecards:</strong> Compares suppliers by defect rate, return volume, and profitability.</li>
    <li><strong>Stock Aging Alerts:</strong> Visual flags for units in stock over 30, 60, and 90 days.</li>
</ul>

<h4>5. 🔐 Multi-Role Access Control (RBAC)</h4>
<ul>
    <li><strong>👑 Shop Owner:</strong> Unrestricted access to P&L reports, purchase prices, supplier records, and system settings.</li>
    <li><strong>🔧 Technician:</strong> Focuses on hardware testing, intake inspections, and repair tasks (financial margins hidden).</li>
    <li><strong>🎧 Support Desk:</strong> Manages customer claim intake, ticket assignments, and handover status (restricted from procurement).</li>
</ul>

<h4>6. 💾 Zero-Cost Self-Contained SQLite Database</h4>
<ul>
    <li>Built using modern Node.js native SQLite (<code>node:sqlite</code>).</li>
    <li><strong>No expensive cloud database fees</strong> or complex external MySQL/PostgreSQL configuration.</li>
    <li>Automated daily database backups with 14-day retention and one-click guarded restore.</li>
</ul>

<hr>

<h3>🛠️ Technology Stack</h3>
<ul>
    <li><strong>Backend & SSR:</strong> Next.js 16 (App Router)</li>
    <li><strong>Frontend UI:</strong> React 19, Tailwind CSS v4, Lucide Icons</li>
    <li><strong>Database:</strong> Node Native SQLite (<code>node:sqlite</code>) with WAL mode</li>
    <li><strong>Hardware Agent:</strong> Windows PowerShell 5.1+ (Windows 10 & 11)</li>
    <li><strong>Containerization:</strong> Docker & Docker Compose ready</li>
</ul>

<hr>

<h3>📦 What You Get in the Download</h3>
<ul>
    <li>Full Next.js 16 + React 19 Source Code (TypeScript)</li>
    <li>Windows Tester V4 Diagnostic Suite (Installers, scripts, and background collector)</li>
    <li>Comprehensive Offline Documentation (Interactive HTML guide + Markdown)</li>
    <li>Docker Configuration (<code>Dockerfile</code> & <code>compose.yaml</code>)</li>
    <li>Sample Dataset & Automated Smoke Tests</li>
    <li>Lifetime Updates & Dedicated Author Support</li>
</ul>

<hr>

<h3>💻 System Requirements</h3>
<ul>
    <li><strong>Server:</strong> Node.js 22.13.0 or higher (or Docker)</li>
    <li><strong>Hardware Test Station:</strong> Windows 10 or 11 (for running the Tester V4 agent on laptops)</li>
    <li><strong>RAM:</strong> 512 MB minimum</li>
    <li><strong>Storage:</strong> 250 MB free disk space</li>
</ul>
"""
    desc_path = OUTPUT_DIR / "codecanyon-description.html"
    desc_path.write_text(html, encoding="utf-8")
    print(f"Created {desc_path}")

if __name__ == "__main__":
    create_thumbnail()
    create_preview()
    create_description()
    print("ALL CODECANYON ASSETS READY!")
