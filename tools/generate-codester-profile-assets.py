"""Generate all required assets for Codester seller profile and item upload:
1. codester-avatar.png (square avatar)
2. codester-profile-banner.png (profile background banner 1920x450)
3. codester-preview-1600x800.png (exact 1600x800 preview image)
4. screenshots.zip (clear screenshots for the item)
"""

from pathlib import Path
import shutil
import zipfile
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"D:/deploy/device-passport")
PORTFOLIO = Path(r"D:/new portfolio")
OUTPUT_DIR = ROOT / "dist-codester"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# -------------------------------------------------------------
# 1. AVATAR (from portrait or monogram)
# -------------------------------------------------------------
portrait_src = PORTFOLIO / "dist/assets/dulanjan-portrait.png"
avatar_dest = OUTPUT_DIR / "codester-avatar.png"
if portrait_src.exists():
    img = Image.open(portrait_src)
    # Crop square center
    w, h = img.size
    min_dim = min(w, h)
    left = (w - min_dim) // 2
    top = (h - min_dim) // 4
    cropped = img.crop((left, top, left + min_dim, top + min_dim))
    cropped = cropped.resize((400, 400), Image.Resampling.LANCZOS)
    cropped.save(avatar_dest, "PNG")
    print(f"Created {avatar_dest} from portrait")
else:
    # Monogram fallback
    av = Image.new("RGBA", (400, 400), "#1E293B")
    draw = ImageDraw.Draw(av)
    draw.ellipse([20, 20, 380, 380], fill="#3B82F6")
    av.save(avatar_dest, "PNG")
    print(f"Created monogram {avatar_dest}")

# -------------------------------------------------------------
# 2. PROFILE BACKGROUND BANNER (1920x450 px)
# -------------------------------------------------------------
def create_profile_banner():
    w, h = 1920, 450
    banner = Image.new("RGBA", (w, h), "#0B0E17")
    draw = ImageDraw.Draw(banner)
    
    # Grid lines / tech accents
    draw.line([(0, 4), (w, 4)], fill="#3B82F6", width=4)
    draw.line([(0, h - 4), (w, h - 4)], fill="#1E293B", width=2)
    
    try:
        font_hero = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 52)
        font_sub = ImageFont.truetype(r"C:/Windows/Fonts/segoeui.ttf", 26)
    except:
        font_hero = font_sub = ImageFont.load_default()
        
    draw.text((120, 140), "Dulanjan Anushika | Full-Stack & Systems Developer", fill="#FFFFFF", font=font_hero)
    draw.text((120, 220), "Building production-grade web applications, diagnostics & modern tools.", fill="#94A3B8", font=font_sub)
    
    banner_path = OUTPUT_DIR / "codester-profile-banner.png"
    banner.save(banner_path, "PNG")
    print(f"Created {banner_path}")

# -------------------------------------------------------------
# 3. 1600x800 PREVIEW IMAGE (Exact Codester Dimensions)
# -------------------------------------------------------------
def create_preview_1600x800():
    w, h = 1600, 800
    img = Image.new("RGBA", (w, h), "#0B0D13")
    draw = ImageDraw.Draw(img)
    
    # Inner border frame
    draw.rounded_rectangle([24, 24, w - 24, h - 24], radius=28, fill="#121622", outline="#252E42", width=3)
    draw.line([(80, 28), (w - 80, 28)], fill="#3B82F6", width=4)
    
    try:
        font_hero = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 58)
        font_sub = ImageFont.truetype(r"C:/Windows/Fonts/segoeui.ttf", 26)
        font_badge = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 18)
        font_card_head = ImageFont.truetype(r"C:/Windows/Fonts/segoeuib.ttf", 22)
        font_body = ImageFont.truetype(r"C:/Windows/Fonts/segoeui.ttf", 20)
    except:
        font_hero = font_sub = font_badge = font_card_head = font_body = ImageFont.load_default()
        
    # Top badges
    draw.rounded_rectangle([80, 65, 340, 115], radius=12, fill="#1E293B", outline="#3B82F6", width=2)
    draw.text((210, 90), "NEXT.JS 16 + REACT 19", fill="#60A5FA", font=font_badge, anchor="mm")
    
    draw.rounded_rectangle([360, 65, 660, 115], radius=12, fill="#064E3B", outline="#10B981", width=2)
    draw.text((510, 90), "WINDOWS TESTER AGENT", fill="#34D399", font=font_badge, anchor="mm")
    
    draw.rounded_rectangle([680, 65, 950, 115], radius=12, fill="#78350F", outline="#F59E0B", width=2)
    draw.text((815, 90), "COMMERCIAL RELEASE", fill="#FDE68A", font=font_badge, anchor="mm")
    
    # Hero Title
    draw.text((80, 140), "DevicePassport", fill="#FFFFFF", font=font_hero)
    draw.text((80, 215), "Refurbished Laptop Health Diagnostics, QR Passports & Warranty System", fill="#94A3B8", font=font_sub)
    
    # 3 Cards
    card_w = 460
    card_h = 440
    card_y = 280
    
    # Card 1
    x1 = 80
    draw.rounded_rectangle([x1, card_y, x1 + card_w, card_y + card_h], radius=20, fill="#181D2D", outline="#283248", width=2)
    draw.text((x1 + 30, card_y + 30), "⚡ HARDWARE DIAGNOSTICS", fill="#38BDF8", font=font_card_head)
    c1 = [
        "• Native Windows Hardware Agent",
        "• 60-Key Interactive Matrix Listener",
        "• 6-Color Screen Dead-Pixel Cycling",
        "• Battery Cycles & Design Wear %",
        "• SSD SMART Power-On Hours",
        "• Tamper-Proof HMAC Signatures",
    ]
    by = card_y + 80
    for b in c1:
        draw.text((x1 + 30, by), b, fill="#E2E8F0", font=font_body)
        by += 54
        
    # Card 2
    x2 = x1 + card_w + 30
    draw.rounded_rectangle([x2, card_y, x2 + card_w, card_y + card_h], radius=20, fill="#181D2D", outline="#283248", width=2)
    draw.text((x2 + 30, card_y + 30), "🏷️ QR PASSPORTS & CLAIMS", fill="#34D399", font=font_card_head)
    c2 = [
        "• 40x25mm Laptop Lid QR Labels",
        "• Digital Verified Health Certificates",
        "• Account-Free Customer Claims",
        "• Live Public Repair Status Tracker",
        "• Service Desk Ticketing & SLA",
        "• Thermal Print Intake Tags & Sheets",
    ]
    by = card_y + 80
    for b in c2:
        draw.text((x2 + 30, by), b, fill="#E2E8F0", font=font_body)
        by += 54
        
    # Card 3
    x3 = x2 + card_w + 30
    draw.rounded_rectangle([x3, card_y, x3 + card_w, card_y + card_h], radius=20, fill="#181D2D", outline="#283248", width=2)
    draw.text((x3 + 30, card_y + 30), "📊 PROFIT & ROLE PORTALS", fill="#FBBF24", font=font_card_head)
    c3 = [
        "• 👑 Owner, 🔧 Tech & 🎧 Support Portals",
        "• Net Margin & P&L Analytics (Cents)",
        "• Supplier Defect & Return Scorecards",
        "• 30/60/90 Day Stock Aging Alerts",
        "• Zero-Cost Node Native SQLite",
        "• Docker Containerization Ready",
    ]
    by = card_y + 80
    for b in c3:
        draw.text((x3 + 30, by), b, fill="#E2E8F0", font=font_body)
        by += 54
        
    prev_path = OUTPUT_DIR / "codester-preview-1600x800.png"
    img.save(prev_path, "PNG")
    print(f"Created {prev_path} (1600x800)")

# -------------------------------------------------------------
# 4. SCREENSHOTS ZIP
# -------------------------------------------------------------
def create_screenshots_zip():
    shots_dir = OUTPUT_DIR / "screenshots"
    shots_dir.mkdir(parents=True, exist_ok=True)
    
    # We can use preview images as screenshots
    shutil.copyfile(OUTPUT_DIR / "codester-preview-1600x800.png", shots_dir / "01_overview.png")
    shutil.copyfile(OUTPUT_DIR / "codester-cover.png", shots_dir / "02_features.png")
    
    zip_path = OUTPUT_DIR / "screenshots.zip"
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file in shots_dir.glob("*.png"):
            zipf.write(file, file.name)
    print(f"Created {zip_path}")

if __name__ == "__main__":
    create_profile_banner()
    create_preview_1600x800()
    create_screenshots_zip()
    print("ALL CODESTER SETTINGS ASSETS CREATED!")
