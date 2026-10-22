# DevicePassport — Commercial Sales Playbook for Dulanjan Anushika

> **Step-by-step operational guide to selling DevicePassport locally in Sri Lanka and globally on international marketplaces.**

---

## 🎯 Phase 1: Global Marketplace Launch (Gumroad & CodeCanyon)

### 1. Gumroad Launch (Zero Upfront Cost — Immediate Start)
Gumroad is the fastest way to accept international credit cards, Apple Pay, and PayPal from buyers worldwide with **zero monthly subscription fees** (they only take a small ~10% fee when a sale occurs).

1. **Sign Up:** Go to [Gumroad.com](https://gumroad.com) and create a free creator account.
2. **Payout Setup:** 
   - Gumroad pays out directly to **PayPal** or via **Stripe / Payoneer**.
   - If using Payoneer, link your Payoneer USD receiving account to Gumroad. Funds can then be withdrawn directly in LKR to your Sri Lankan commercial bank account (Commercial Bank, Sampath, HNB, BOC).
3. **Create New Product:**
   - Name: `DevicePassport — Refurbished Laptop Health, QR Passports & Warranty System`
   - Type: `Digital Product / Software`
   - Price: **$49.00 USD** (Regular License) | **$99.00 USD** (Unlimited Multi-Shop License)
   - Copy-paste the product description from [`docs/MARKETPLACE_LISTING.md`](MARKETPLACE_LISTING.md).
   - Upload the release archive: `dist-release/DevicePassport-v1.0.0-Commercial.zip`.
   - Add your Live Demo URL: `https://device-passport-dulanjana.netlify.app/login`.

---

### 2. Envato CodeCanyon Submission (Massive Passive Traffic)
CodeCanyon is the largest web script marketplace in the world. Buyers actively search here for repair shop and inventory scripts.

1. **Prepare Submission Package:**
   - Use our packaging tool: `npm run package:release` to generate the clean buyer zip file.
   - Main File: The zip file containing `source-code/` and `documentation/`.
   - Thumbnail: `80 × 80 px` PNG/JPG.
   - Inline Preview Image: `590 × 300 px` PNG showing the laptop, QR passport, and dashboard.
2. **Review Process:**
   - Envato reviewers usually take 3 to 10 days to review initial submissions.
   - Once approved, your script is listed publicly and exposed to hundreds of thousands of monthly visitors.

---

## 🏬 Phase 2: Local B2B Sales (Sri Lankan Laptop Shops & Repair Centers)

In Sri Lanka, refurbished laptop shops (e.g. in Unity Plaza, Liberty Plaza, Kurunegala, Kandy, Galle) face daily disputes over battery life and expired warranties.

### The In-Person 5-Minute "Jaw-Drop" Demo
When visiting a laptop shop or repair center, do NOT talk about code (Next.js, TypeScript, SQLite). Talk about **their money, trust, and paper headaches**:

1. **The Hook (Minute 1):**
   > *"Aiya / Sir, refurbished laptop විකුණද්දී customers ලා battery එකයි SSD එකයි ගැන සැක කරන එකයි, මාස ගානකට පස්සේ ඇවිත් බොරු warranty claims දාලා රණ්ඩු වෙන එකයි ඔයාලටත් ලොකු හිසරදයක් නේද? මම ඒකට ලංකාවේ laptop shops වලටම ගැලපෙන automated system එකක් හැදුවා."*

2. **The Live Demo (Minutes 2–4):**
   - Insert your USB stick into one of their showroom laptops.
   - Launch `start-device-passport-tester.ps1`.
   - Show the **6-color screen dead-pixel test** and tap the **60-key keyboard matrix** right in front of them.
   - Click "Upload". The laptop's real BIOS serial, battery cycles, and SSD wear are instantly submitted.
   - Open your phone, scan the generated **QR Passport**, and show how the customer sees an honest, certified health certificate with their shop logo!

3. **The Close (Minute 5):**
   > *"මම ඔයාලගේ shop එකේ නමින්ම මේ system එක setup කරලා දෙන්නම්. Laptop වල අලවන්න QR sticker design එකත් හදලා දෙනවා. ඔයාලට පුළුවන් 1st Month Free Trial එකක් use කරලා බලන්න. කැමති නම් ඊළඟ මාසේ ඉඳන් continue කරන්න."*

---

### Local Pricing Models for Sri Lanka

| Model | Setup Fee | Monthly / Annual Fee | Best For |
| :--- | :--- | :--- | :--- |
| **Option A: Monthly SaaS (Rental)** | Free Setup | **රු. 6,000 – 10,000 / month** | Small to mid-scale laptop shops |
| **Option B: One-Time Custom Sale** | **රු. 120,000 – 200,000** | **රු. 25,000 / year (Hosting/Support)** | Multi-branch stores / chains |

---

## 📱 Phase 3: Social & Community Outreach

### 1. Reddit Strategy (Zero Cost, High Tech Credibility)
Post in the following subreddits:
- `r/mobilerepair` (Over 65,000 repair shop owners & technicians)
- `r/techsupport`
- `r/refurbished`
- `r/SideProject`
- `r/nextjs`

**Sample Reddit Post Title:**
> *"I built a lightweight hardware diagnostic & QR passport system for refurbished laptops (Next.js 16 + SQLite + Windows Agent)"*

**Post Body:**
> "Hey everyone! Working with used laptops, the biggest issue is proving battery cycles, SSD SMART health, and preventing fraudulent warranty claims.
> 
> I built DevicePassport: a self-contained Next.js app with a native Windows PowerShell agent that collects BIOS serials, battery cycles, runs keyboard/dead-pixel tests, and generates a printable 40x25mm QR passport label for the laptop lid.
> 
> When sold, it activates a digital warranty card where customers can track repairs privately without creating an account.
> 
> Live demo (with 1-click test roles): https://device-passport-dulanjana.netlify.app/login
> 
> Would love feedback from repair shop owners and IT technicians!"

---

### 2. WhatsApp Pitch Template for Local Shops
Send this directly to computer shop managers on WhatsApp:

```text
Hello [Shop Name / Manager Name]! 👋

Laptop showroom එකේ විකුණන refurbished laptops වලට Certified Hardware Health Report එකක් සහ Tamper-Proof Digital QR Warranty එකක් generate කරගන්න පුළුවන් automated system එකක් අපි හඳුන්වා දීලා තියෙනවා.

✨ Key Benefits:
• Customer ට laptop එකේ battery health, SSD wear එක QR එකෙන් live බලාගත හැක.
• Paperless Digital Warranty (බොරු warranty claims වැළැක්වීම).
• Laptop එකේ screen, keyboard, camera, sound පරික්ෂා කරන Windows testing tool එකක් ඇතුළත් වේ.
• Shop එකේ ලාභය (Gross Profit) සහ Service Desk එක එකම dashboard එකෙන්.

📱 Live Demo එක මෙතනින් බලන්න පුළුවන් (1-Click Login):
https://device-passport-dulanjana.netlify.app/login

ඔබගේ shop එකටත් 1 Month Free Trial එකක් ලබා ගැනීමට කැමති නම් දන්වන්න!

Dulanjan Anushika | Full Stack & Systems Developer
WhatsApp: +94 [Your Phone Number]
```

---

## 🏁 Summary Checklist to First Sale

- [x] Product Core complete (Next.js 16, React 19, SQLite, Windows Tester V4).
- [x] 1-Click Recruiter/Buyer Demo deployed live on Netlify.
- [x] Standalone HTML Documentation created (`docs/index.html`).
- [x] Marketplace Sales Listing drafted (`docs/MARKETPLACE_LISTING.md`).
- [ ] Create Gumroad listing (15 minutes).
- [ ] Share Reddit & LinkedIn showcase posts with a 30s video.
- [ ] Pitch 3 local laptop shops in your area for a free trial.
