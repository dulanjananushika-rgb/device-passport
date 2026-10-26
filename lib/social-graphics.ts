/**
 * DevicePassport - 1-Click Social Media Graphic Generator
 * Produces pixel-perfect 1080x1080 promotional marketing graphics (SVG and HTML)
 * for Facebook Marketplace, Instagram, and WhatsApp Status with embedded QR verification.
 */

import QRCode from "qrcode";
import { getDatabase, getShopSettings } from "./database";
import { formatMinorUnitsToLkr } from "./finance";
import { getCatalogItemBySerial } from "./public-catalog";

export interface SocialCardOptions {
  shopName: string;
  tagline: string;
  phone: string;
  address: string;
  brand: string;
  name: string;
  model: string;
  serial: string;
  grade: "A" | "B" | "C";
  score: number;
  batteryHealth: number;
  processor: string;
  memory: string;
  storage: string;
  warrantyPeriod: string;
  priceLkr: string;
  passportUrl: string;
  qrCodeDataUrl?: string;
}

/**
 * Escapes XML/HTML special characters to prevent markup injection in SVG.
 */
function escapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates an ultra-crisp, standalone 1080x1080 SVG graphic.
 */
export async function generateSocialCardSvg(options: SocialCardOptions): Promise<string> {
  const qrDataUrl =
    options.qrCodeDataUrl ||
    (await QRCode.toDataURL(options.passportUrl, {
      margin: 1,
      width: 220,
      color: { dark: "#0f172a", light: "#ffffff" },
    }));

  const brand = escapeXml(options.brand || "CERTIFIED");
  const title = escapeXml(options.name || options.model);
  const processor = escapeXml(options.processor);
  const memory = escapeXml(options.memory);
  const storage = escapeXml(options.storage);
  const batteryHealth = escapeXml(`${options.batteryHealth}% Genuine`);
  const warranty = escapeXml(options.warrantyPeriod || "6 Months Warranty");
  const price = escapeXml(options.priceLkr);
  const shop = escapeXml(options.shopName || "LAPMART");
  const tagline = escapeXml(options.tagline || "Certified Pre-Owned Enterprise Laptops");
  const phone = escapeXml(options.phone || "+94 77 123 4567");
  const address = escapeXml(options.address || "Showroom: Colombo, Sri Lanka");
  const score = options.score || 95;
  const grade = escapeXml(options.grade || "A");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0f1d" />
      <stop offset="50%" stop-color="#111827" />
      <stop offset="100%" stop-color="#050811" />
    </linearGradient>

    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#3b82f6" />
    </linearGradient>

    <linearGradient id="priceGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>

    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.45" />
    </filter>

    <style>
      .font-sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      .title { font-weight: 800; font-size: 46px; fill: #ffffff; letter-spacing: -0.5px; }
      .badge-txt { font-weight: 700; font-size: 20px; fill: #ffffff; letter-spacing: 1px; }
      .spec-label { font-weight: 600; font-size: 18px; fill: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
      .spec-value { font-weight: 700; font-size: 26px; fill: #f8fafc; }
      .price-txt { font-weight: 800; font-size: 54px; fill: #ffffff; }
      .footer-txt { font-weight: 500; font-size: 22px; fill: #cbd5e1; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="1080" height="1080" fill="url(#bgGrad)" />

  <!-- Ambient Glow Circles -->
  <circle cx="950" cy="150" r="320" fill="#06b6d4" opacity="0.12" filter="blur(60px)" />
  <circle cx="100" cy="900" r="280" fill="#3b82f6" opacity="0.10" filter="blur(50px)" />

  <!-- Outer Frame Border -->
  <rect x="36" y="36" width="1008" height="1008" rx="36" fill="none" stroke="#1e293b" stroke-width="2" />

  <!-- Header Section -->
  <g transform="translate(72, 85)">
    <!-- Shop Branding -->
    <text x="0" y="32" class="font-sans" font-size="34" font-weight="900" fill="#38bdf8" letter-spacing="2">${shop}</text>
    <text x="0" y="65" class="font-sans" font-size="19" font-weight="500" fill="#64748b">${tagline}</text>

    <!-- Certification Pill -->
    <rect x="660" y="0" width="276" height="52" rx="26" fill="#0369a1" opacity="0.3" stroke="#0ea5e9" stroke-width="1.5" />
    <text x="798" y="33" text-anchor="middle" class="font-sans badge-txt" fill="#38bdf8">✓ 100% TESTED CERTIFIED</text>
  </g>

  <!-- Divider Line -->
  <line x1="72" y1="185" x2="1008" y2="185" stroke="#334155" stroke-width="1.5" stroke-dasharray="6 6" />

  <!-- Hero Title & Rating Badge -->
  <g transform="translate(72, 245)">
    <rect x="0" y="-36" width="130" height="34" rx="8" fill="#1e293b" />
    <text x="65" y="-14" text-anchor="middle" class="font-sans" font-size="16" font-weight="700" fill="#38bdf8">${brand}</text>

    <text x="0" y="40" class="font-sans title">${title}</text>

    <!-- Grade & Score Badge -->
    <g transform="translate(680, -10)">
      <rect x="0" y="0" width="256" height="64" rx="16" fill="#1e293b" stroke="#3b82f6" stroke-width="1.5" />
      <circle cx="36" cy="32" r="18" fill="#10b981" />
      <text x="36" y="38" text-anchor="middle" class="font-sans" font-size="18" font-weight="800" fill="#ffffff">${grade}</text>
      <text x="72" y="30" class="font-sans" font-size="14" font-weight="600" fill="#94a3b8">DIAGNOSTIC SCORE</text>
      <text x="72" y="50" class="font-sans" font-size="20" font-weight="800" fill="#38bdf8">${score} / 100 PASSED</text>
    </g>
  </g>

  <!-- 4-Card Hardware Specification Grid -->
  <!-- Card 1: Processor -->
  <g transform="translate(72, 360)" filter="url(#cardShadow)">
    <rect width="450" height="110" rx="20" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
    <text x="28" y="40" class="font-sans spec-label">⚡ PROCESSOR</text>
    <text x="28" y="80" class="font-sans spec-value">${processor}</text>
  </g>

  <!-- Card 2: Memory -->
  <g transform="translate(558, 360)" filter="url(#cardShadow)">
    <rect width="450" height="110" rx="20" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
    <text x="28" y="40" class="font-sans spec-label">🧠 RAM CAPACITY</text>
    <text x="28" y="80" class="font-sans spec-value">${memory}</text>
  </g>

  <!-- Card 3: Storage -->
  <g transform="translate(72, 495)" filter="url(#cardShadow)">
    <rect width="450" height="110" rx="20" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
    <text x="28" y="40" class="font-sans spec-label">💾 FAST STORAGE</text>
    <text x="28" y="80" class="font-sans spec-value">${storage}</text>
  </g>

  <!-- Card 4: Battery Health -->
  <g transform="translate(558, 495)" filter="url(#cardShadow)">
    <rect width="450" height="110" rx="20" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
    <text x="28" y="40" class="font-sans spec-label">🔋 BATTERY HEALTH</text>
    <text x="28" y="80" class="font-sans spec-value" fill="#10b981">${batteryHealth}</text>
  </g>

  <!-- Warranty Banner -->
  <g transform="translate(72, 630)">
    <rect width="936" height="60" rx="16" fill="#0f172a" stroke="#0284c7" stroke-width="1" />
    <text x="468" y="38" text-anchor="middle" class="font-sans" font-size="22" font-weight="700" fill="#38bdf8">
      🛡️ INCLUDES ${warranty.toUpperCase()} • WITH OFFICIAL DIGITAL CERTIFICATE
    </text>
  </g>

  <!-- Price & QR Action Section -->
  <g transform="translate(72, 715)">
    <!-- Price Card -->
    <rect width="670" height="175" rx="24" fill="url(#priceGrad)" filter="url(#cardShadow)" />
    <text x="40" y="55" class="font-sans" font-size="22" font-weight="700" fill="#e6fffa" letter-spacing="1">SPECIAL SHOWROOM OFFER</text>
    <text x="40" y="125" class="font-sans price-txt">${price}</text>
    <text x="40" y="155" class="font-sans" font-size="16" font-weight="600" fill="#bbf7d0">Includes Original Charger &amp; Full Diagnostics Report</text>

    <!-- QR Code Card -->
    <g transform="translate(696, 0)">
      <rect width="240" height="175" rx="24" fill="#ffffff" filter="url(#cardShadow)" />
      <image href="${qrDataUrl}" x="15" y="10" width="130" height="130" />
      <text x="150" y="55" class="font-sans" font-size="13" font-weight="800" fill="#0f172a">SCAN FOR</text>
      <text x="150" y="73" class="font-sans" font-size="13" font-weight="800" fill="#0284c7">HARDWARE</text>
      <text x="150" y="91" class="font-sans" font-size="13" font-weight="800" fill="#0f172a">PASSPORT</text>
      <text x="150" y="115" class="font-sans" font-size="11" font-weight="600" fill="#64748b">100% Genuine</text>
      <rect x="15" y="145" width="210" height="22" rx="4" fill="#f1f5f9" />
      <text x="120" y="160" text-anchor="middle" class="font-sans" font-size="11" font-weight="700" fill="#475569">S/N: ${escapeXml(options.serial)}</text>
    </g>
  </g>

  <!-- Footer Information -->
  <g transform="translate(72, 940)">
    <text x="0" y="24" class="font-sans footer-txt">📞 Hotline / WhatsApp: <tspan font-weight="700" fill="#38bdf8">${phone}</tspan></text>
    <text x="0" y="54" class="font-sans" font-size="18" fill="#94a3b8">📍 ${address}</text>
    <text x="936" y="38" text-anchor="end" class="font-sans" font-size="18" font-weight="700" fill="#64748b">DEVICEPASSPORT.IO</text>
  </g>
</svg>`;
}

/**
 * Generates clean standalone HTML for web preview or headless screenshot capture.
 */
export async function generateSocialCardHtml(options: SocialCardOptions): Promise<string> {
  const svg = await generateSocialCardSvg(options);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeXml(options.name)} - Promotional Graphic</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #020617;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .card-container {
      width: 1080px;
      height: 1080px;
      max-width: 100vw;
      max-height: 100vw;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    svg {
      width: 100%;
      height: 100%;
      display: block;
    }
  </style>
</head>
<body>
  <div class="card-container">
    ${svg}
  </div>
</body>
</html>`;
}

/**
 * Convenience helper to assemble SocialCardOptions directly from database records.
 */
export async function buildSocialCardOptionsForDevice(
  serialOrId: string,
  origin: string = "https://devicepassport.io"
): Promise<SocialCardOptions | null> {
  const item = await getCatalogItemBySerial(serialOrId);
  if (!item) return null;

  const settings = getShopSettings();
  const passportUrl = `${origin.replace(/\/$/, "")}${item.passportUrl}`;

  return {
    shopName: settings?.shopName || "Lapmart",
    tagline: settings?.tagline || "Certified Pre-Owned Enterprise Laptops",
    phone: settings?.phone || "0771234567",
    address: settings?.address || "Colombo, Sri Lanka",
    brand: item.brand,
    name: item.name,
    model: item.model,
    serial: item.serial,
    grade: item.grade,
    score: item.score,
    batteryHealth: item.batteryHealth,
    processor: item.processor,
    memory: item.memory,
    storage: item.storage,
    warrantyPeriod: `${item.warrantyDurationMonths} Months Warranty`,
    priceLkr: item.formattedPrice,
    passportUrl,
  };
}
