import QRCode from "qrcode";
import { getDatabase, getShopSettings } from "./database";
import { formatCurrency } from "./finance";

/**
 * Pure TypeScript Code128 (Subset B) Barcode Generator
 * Generates an optimized, razor-sharp monochrome SVG barcode string.
 * Code128 is supported natively by virtually all direct thermal barcode printers (203/300 DPI)
 * and all 1D laser / CMOS USB barcode scanner guns.
 */

// Code128 Subset B patterns (widths of alternating 6 bars/spaces, index 0 to 106)
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112" // 100-106 (106 is STOP pattern: 7 elements)
];

const START_CODE_B = 104;
const STOP_CODE = 106;

export function generateCode128Svg(text: string, height = 36): string {
  if (!text) text = "ITEM";
  const clean = text.trim();

  const codes: number[] = [START_CODE_B];
  let checkSum = START_CODE_B;

  for (let i = 0; i < clean.length; i++) {
    const charCode = clean.charCodeAt(i);
    const value = charCode - 32;
    if (value < 0 || value > 95) {
      continue;
    }
    codes.push(value);
    checkSum += value * (i + 1);
  }

  const checkDigit = checkSum % 103;
  codes.push(checkDigit);
  codes.push(STOP_CODE);

  // Convert codes into alternating bar/space widths
  let totalModules = 0;
  const elements: { isBar: boolean; width: number }[] = [];

  // Quiet zone at start
  elements.push({ isBar: false, width: 10 });
  totalModules += 10;

  for (const c of codes) {
    const pattern = CODE128_PATTERNS[c];
    for (let j = 0; j < pattern.length; j++) {
      const w = parseInt(pattern[j], 10);
      const isBar = j % 2 === 0;
      elements.push({ isBar, width: w });
      totalModules += w;
    }
  }

  // Quiet zone at end
  elements.push({ isBar: false, width: 10 });
  totalModules += 10;

  let currentX = 0;
  let rects = "";
  for (const el of elements) {
    if (el.isBar) {
      rects += `<rect x="${currentX}" y="0" width="${el.width}" height="${height}" fill="#000000" />`;
    }
    currentX += el.width;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${height}" preserveAspectRatio="none" style="width:100%; height:${height}px; display:block;">${rects}</svg>`;
}

export interface PriceTagStickerData {
  shopName: string;
  tagline: string;
  currencySymbol: string;
  deviceId: string;
  deviceName: string;
  model: string;
  serial: string;
  grade: string;
  score: number;
  processor: string;
  memory: string;
  storage: string;
  batteryHealth: number;
  formattedPrice: string;
  warrantyText: string;
  barcodeSvg: string;
  qrDataUrl: string;
}

export async function getPriceTagStickerData(
  deviceId: string,
  origin = "http://localhost:3000"
): Promise<PriceTagStickerData | null> {
  const db = getDatabase();
  const settings = getShopSettings();

  const device = db.prepare("SELECT * FROM devices WHERE id = ?").get(deviceId) as any;
  if (!device) return null;

  // Check sale price or estimate
  const sale = db.prepare("SELECT sale_price_cents FROM device_sales WHERE device_id = ?").get(deviceId) as any;
  const priceCents = sale?.sale_price_cents || 89900; // default/sample $899 if unsold

  const currencySymbol = settings.currencySymbol || "$";
  const currencyPosition = (settings.currencyPosition as "prefix" | "suffix") || "prefix";
  const formattedPrice = formatCurrency(priceCents, { symbol: currencySymbol, position: currencyPosition });

  const passportUrl = `${origin}/passport/${device.id}`;
  const qrDataUrl = await QRCode.toDataURL(passportUrl, {
    margin: 1,
    width: 120,
    color: { dark: "#000000", light: "#ffffff" },
  });

  const barcodeSvg = generateCode128Svg(device.serial.toUpperCase(), 34);

  return {
    shopName: settings.shopName || "DEVICE PASSPORT",
    tagline: "Certified Refurbished",
    currencySymbol,
    deviceId: device.id,
    deviceName: device.name,
    model: device.model,
    serial: device.serial,
    grade: device.grade || "A",
    score: device.score || 90,
    processor: device.processor || "Intel Core i5",
    memory: device.memory || "8 GB",
    storage: device.storage || "256 GB SSD",
    batteryHealth: device.battery_health || 88,
    formattedPrice,
    warrantyText: `${settings.warrantyMonths || 12}M Warranty`,
    barcodeSvg,
    qrDataUrl,
  };
}

/**
 * Generates an ultra-crisp, high-density 50mm x 30mm direct thermal sticker HTML
 * ready for USB/Network thermal label printers (Xprinter, Zebra, TSC, Rongta).
 */
export async function generatePriceTagStickerHtml(
  deviceId: string,
  origin = "http://localhost:3000"
): Promise<string> {
  const data = await getPriceTagStickerData(deviceId, origin);
  if (!data) throw new Error(`Device not found for ID ${deviceId}`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Sticker - ${data.serial} - ${data.model}</title>
  <style>
    @page {
      size: 50mm 30mm;
      margin: 0;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      width: 50mm;
      height: 30mm;
      max-width: 50mm;
      max-height: 30mm;
      margin: 0 auto;
      padding: 1.5mm 2mm;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #000000;
      background: #ffffff;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 0.5px solid #000;
      padding-bottom: 1px;
    }
    .brand-name {
      font-size: 7.5pt;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .grade-badge {
      font-size: 6pt;
      font-weight: 800;
      background: #000;
      color: #fff;
      padding: 0.5px 3px;
      border-radius: 2px;
      text-transform: uppercase;
    }
    .model-title {
      font-size: 7.5pt;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 1px;
    }
    .specs-pill {
      font-size: 5.5pt;
      font-weight: 700;
      color: #222;
      background: #eee;
      padding: 1px 3px;
      border-radius: 2px;
      display: inline-block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
      margin: 1px 0;
    }
    .price-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .price {
      font-size: 10.5pt;
      font-weight: 900;
      letter-spacing: -0.3px;
      line-height: 1;
    }
    .warranty-tag {
      font-size: 5pt;
      font-weight: 700;
      text-transform: uppercase;
      border: 0.5px solid #000;
      padding: 0.5px 2px;
      border-radius: 2px;
    }
    .barcode-container {
      width: 100%;
      margin-top: 1px;
    }
    .serial-text {
      font-size: 5pt;
      font-family: 'Courier New', monospace;
      font-weight: bold;
      text-align: center;
      letter-spacing: 0.5px;
      line-height: 1;
    }
    .actions-bar {
      position: fixed;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: #0f172a;
      padding: 8px 16px;
      border-radius: 30px;
      display: flex;
      gap: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      z-index: 999;
    }
    .actions-bar button {
      background: #10b981;
      color: #fff;
      border: none;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="no-print actions-bar">
    <button onclick="window.print()">🖨️ Print 50x30mm Label</button>
  </div>

  <div class="header-row">
    <span class="brand-name">${data.shopName}</span>
    <span class="grade-badge">Grade ${data.grade} • ${data.score}%</span>
  </div>

  <div class="model-title">${data.deviceName}</div>
  <div class="specs-pill">${data.processor} | ${data.memory} | ${data.storage}</div>

  <div class="price-row">
    <span class="price">${data.formattedPrice}</span>
    <span class="warranty-tag">${data.warrantyText}</span>
  </div>

  <div class="barcode-container">
    ${data.barcodeSvg}
    <div class="serial-text">* ${data.serial} *</div>
  </div>

  <script>
    if (window.location.search.includes('auto=1')) {
      window.onload = function() { window.print(); };
    }
  </script>
</body>
</html>`;
}
