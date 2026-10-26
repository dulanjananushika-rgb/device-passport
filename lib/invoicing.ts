import QRCode from "qrcode";
import { getDatabase, getShopSettings } from "./database";
import { formatCurrency, formatMinorUnitsWithSettings } from "./finance";
import { defaultWarrantyBreakdown, type WarrantyBreakdown } from "./sales";
import { calculateTaxForSale, type TaxCalculationResult, type TaxMode } from "./tax";
import { formatCarrierTrackingInfo } from "./shipping";

export interface InvoiceData {
  invoiceReference: string;
  soldAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  activatedBy: string;
  paymentMethod: string;
  cashReceivedCents: number;
  cardAmountCents: number;
  bankTransferCents: number;
  installmentCents: number;
  paymentReference: string;
  paymentSummary: string;
  warrantyBreakdown: WarrantyBreakdown;
  bundledAccessories: string[];
  deliveryMethod: string;
  courierName: string;
  courierWaybill: string;
  courierFeeCents: number;
  trackingUrl: string;
  hasLiveTracking: boolean;
  discountCents: number;
  discountReason: string;
  formattedDiscount: string;
  taxResult: TaxCalculationResult;
  formattedTax: string;
  device: {
    id: string;
    name: string;
    model: string;
    serial: string;
    grade: string;
    score: number;
    batteryHealth: number;
    storageHealth: number;
    processor: string;
    memory: string;
    storage: string;
    warrantyStarts: string;
    warrantyEnds: string;
    handoverToken: string;
  };
  shop: {
    name: string;
    tagline: string;
    address: string;
    phone: string;
    email: string;
    warrantyTerms: string;
    taxId: string;
    currencyCode: string;
    currencySymbol: string;
    currencyPosition: "prefix" | "suffix";
    dateFormat: string;
    taxMode: TaxMode;
    taxRatePercent: number;
    taxInclusive: boolean;
  };
  priceCents: number;
  formattedPrice: string;
  qrPassportDataUrl: string;
}

export async function getInvoiceData(invoiceReference: string, origin = "http://localhost:3000"): Promise<InvoiceData | null> {
  const db = getDatabase();

  const sale = db.prepare(`
    SELECT
      s.*,
      d.name as dev_name,
      d.model,
      d.serial,
      d.grade,
      d.score,
      d.battery_health,
      d.storage_health,
      d.processor,
      d.memory,
      d.storage,
      COALESCE((SELECT purchase_cost_cents FROM device_finance WHERE device_id = s.device_id LIMIT 1), 0) as intake_cost
    FROM device_sales s
    JOIN devices d ON d.id = s.device_id
    WHERE s.invoice_reference = ? OR s.device_id = ?
  `).get(invoiceReference, invoiceReference) as any;

  if (!sale) return null;

  const settings = getShopSettings();
  const passportUrl = `${origin.replace(/\/+$/, "")}/passport/${sale.device_id}`;
  const qrDataUrl = await QRCode.toDataURL(passportUrl, { margin: 1, width: 220 });

  const currencySymbol = settings.currencySymbol || "$";
  const currencyPosition = (settings.currencyPosition as "prefix" | "suffix") || "prefix";
  const currencyOptions = { symbol: currencySymbol, position: currencyPosition };

  const method = sale.payment_method || "Cash";
  const cash = sale.cash_received_cents || 0;
  const card = sale.card_amount_cents || 0;
  const bank = sale.bank_transfer_cents || 0;
  const inst = sale.installment_cents || 0;

  let paymentSummary = method;
  if (method === "Split") {
    const parts: string[] = [];
    if (cash > 0) parts.push(`Cash: ${formatCurrency(cash, currencyOptions)}`);
    if (card > 0) parts.push(`Card: ${formatCurrency(card, currencyOptions)}`);
    if (bank > 0) parts.push(`Bank: ${formatCurrency(bank, currencyOptions)}`);
    if (inst > 0) parts.push(`Inst: ${formatCurrency(inst, currencyOptions)}`);
    paymentSummary = `Split (${parts.join(" + ")})`;
  } else if (method === "Card" && card > 0) {
    paymentSummary = `Card (${formatCurrency(card, currencyOptions)})`;
  }

  let warrantyBreakdown: WarrantyBreakdown = defaultWarrantyBreakdown;
  if (sale.warranty_breakdown_json) {
    try {
      warrantyBreakdown = { ...defaultWarrantyBreakdown, ...JSON.parse(sale.warranty_breakdown_json) };
    } catch {
      warrantyBreakdown = defaultWarrantyBreakdown;
    }
  }

  let bundledAccessories: string[] = [];
  if (sale.bundled_accessories_json) {
    try {
      bundledAccessories = JSON.parse(sale.bundled_accessories_json);
    } catch {
      bundledAccessories = [];
    }
  }

  const discountCents = sale.discount_cents || 0;
  const courierName = sale.courier_name || "";
  const courierWaybill = sale.courier_waybill || "";
  const trackingInfo = formatCarrierTrackingInfo(courierName, courierWaybill);

  const taxMode: TaxMode = (settings.taxMode as TaxMode) || "standard";
  const taxResult = calculateTaxForSale({
    salePriceCents: sale.sale_price_cents,
    costPriceCents: sale.intake_cost || 0,
    taxRatePercent: settings.taxRatePercent || 0,
    taxInclusive: settings.taxInclusive !== false,
    taxMode,
  });

  return {
    invoiceReference: sale.invoice_reference,
    soldAt: sale.sold_at,
    customerName: sale.customer_name,
    customerPhone: sale.customer_phone,
    customerEmail: sale.customer_email || "",
    activatedBy: sale.activated_by,
    paymentMethod: method,
    cashReceivedCents: cash,
    cardAmountCents: card,
    bankTransferCents: bank,
    installmentCents: inst,
    paymentReference: sale.payment_reference || "",
    paymentSummary,
    warrantyBreakdown,
    bundledAccessories,
    deliveryMethod: sale.delivery_method || "In-Store Pickup",
    courierName,
    courierWaybill,
    courierFeeCents: sale.courier_fee_cents || 0,
    trackingUrl: trackingInfo.trackingUrl,
    hasLiveTracking: trackingInfo.hasLiveTracking,
    discountCents,
    discountReason: sale.discount_reason || "",
    formattedDiscount: formatCurrency(discountCents, currencyOptions),
    taxResult,
    formattedTax: formatCurrency(taxResult.taxAmountCents, currencyOptions),
    device: {
      id: sale.device_id,
      name: sale.dev_name,
      model: sale.model,
      serial: sale.serial,
      grade: sale.grade,
      score: sale.score,
      batteryHealth: sale.battery_health,
      storageHealth: sale.storage_health,
      processor: sale.processor,
      memory: sale.memory,
      storage: sale.storage,
      warrantyStarts: sale.warranty_starts,
      warrantyEnds: sale.warranty_ends,
      handoverToken: sale.handover_token,
    },
    shop: {
      name: settings.shopName || "DevicePassport Store",
      tagline: settings.tagline || "Certified Pre-Owned Electronics",
      address: settings.address,
      phone: settings.phone,
      email: settings.contactEmail,
      warrantyTerms: settings.warrantyTerms,
      taxId: settings.taxId || "",
      currencyCode: settings.currencyCode || "USD",
      currencySymbol,
      currencyPosition,
      dateFormat: settings.dateFormat || "MM/DD/YYYY",
      taxMode,
      taxRatePercent: settings.taxRatePercent || 0,
      taxInclusive: settings.taxInclusive !== false,
    },
    priceCents: sale.sale_price_cents,
    formattedPrice: formatCurrency(sale.sale_price_cents, currencyOptions),
    qrPassportDataUrl: qrDataUrl,
  };
}

/**
 * Generates an 80mm or 58mm POS thermal receipt format for thermal receipt printers.
 */
export async function generateThermalReceiptHtml(invoiceReference: string, paperWidth: 80 | 58 = 80, origin = ""): Promise<string> {
  const data = await getInvoiceData(invoiceReference, origin);
  if (!data) throw new Error(`Invoice not found for reference ${invoiceReference}`);

  const widthStyle = paperWidth === 58 ? "max-width: 54mm; font-size: 11px;" : "max-width: 72mm; font-size: 13px;";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Receipt - ${data.invoiceReference}</title>
  <style>
    @page { size: auto; margin: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      color: #000;
      background: #fff;
      margin: 0 auto;
      padding: 10px 4px;
      ${widthStyle}
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .line { border-top: 1px dashed #000; margin: 8px 0; }
    .double-line { border-top: 2px dashed #000; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; margin: 3px 0; }
    .qr { width: 130px; height: 130px; margin: 8px auto; display: block; }
    @media print {
      .no-print { display: none !important; }
    }
    .actions { text-align: center; margin-bottom: 15px; }
    .btn { background: #000; color: #fff; border: none; padding: 6px 12px; cursor: pointer; border-radius: 4px; font-size: 12px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="actions no-print">
    <button class="btn" onclick="window.print()">🖨️ Print Receipt (${paperWidth}mm)</button>
  </div>

  <div class="center">
    <div class="bold" style="font-size: 1.2em;">${data.shop.name}</div>
    <div>${data.shop.tagline}</div>
    <div>${data.shop.address}</div>
    <div>Tel: ${data.shop.phone}</div>
    ${data.shop.taxId ? `<div style="font-size: 0.9em;">Tax / Reg ID: ${data.shop.taxId}</div>` : ""}
  </div>

  <div class="double-line"></div>
  <div class="center bold">
    ${data.taxResult.taxMode === "uk_eu_margin_scheme" ? "MARGIN SCHEME SALE RECEIPT" : "OFFICIAL SALE RECEIPT"}
  </div>
  <div class="row"><span>Inv Ref:</span><span class="bold">#${data.invoiceReference}</span></div>
  <div class="row"><span>Date:</span><span>${data.soldAt}</span></div>
  <div class="row"><span>Cashier:</span><span>${data.activatedBy}</span></div>

  <div class="line"></div>
  <div><span class="bold">Customer:</span> ${data.customerName}</div>
  <div><span class="bold">Phone:</span> ${data.customerPhone}</div>
  ${data.customerEmail ? `<div><span class="bold">Email:</span> ${data.customerEmail}</div>` : ""}

  <div class="line"></div>
  <div class="bold">${data.device.name}</div>
  <div class="row"><span>Model:</span><span>${data.device.model}</span></div>
  <div class="row"><span>Serial:</span><span class="bold">${data.device.serial}</span></div>
  <div class="row"><span>Grade:</span><span>Grade ${data.device.grade} (${data.device.score}/100)</span></div>
  <div class="row"><span>Spec:</span><span>${data.device.processor}</span></div>
  <div class="row"><span>RAM / SSD:</span><span>${data.device.memory} / ${data.device.storage}</span></div>
  <div class="row"><span>Battery:</span><span>${data.device.batteryHealth}% Health</span></div>

  ${data.bundledAccessories.length > 0 ? `
  <div class="line"></div>
  <div class="bold">BUNDLED ACCESSORIES:</div>
  ${data.bundledAccessories.map((a) => `<div style="font-size: 0.9em;">[✓] ${a}</div>`).join("")}
  ` : ""}

  <div class="line"></div>
  <div class="bold">WARRANTY BREAKDOWN:</div>
  <div class="row"><span>• Motherboard:</span><span class="bold">${data.warrantyBreakdown.motherboardMonths} Months</span></div>
  <div class="row"><span>• Battery & Charger:</span><span>${data.warrantyBreakdown.batteryMonths} Month(s)</span></div>
  <div class="row"><span>• Display Panel:</span><span>${data.warrantyBreakdown.screenMonths} Month(s)</span></div>

  ${data.deliveryMethod !== "In-Store Pickup" && data.courierName ? `
  <div class="line"></div>
  <div class="bold">DISPATCH / SHIPPING:</div>
  <div class="row"><span>Carrier:</span><span>${data.courierName}</span></div>
  <div class="row"><span>Tracking #:</span><span class="bold">${data.courierWaybill}</span></div>
  ` : ""}

  <div class="double-line"></div>
  <div class="row bold" style="font-size: 1.1em;">
    <span>TOTAL:</span>
    <span>${data.formattedPrice}</span>
  </div>
  ${data.discountCents > 0 ? `<div class="row" style="font-size: 0.9em;"><span>Discount (${data.discountReason || "Special"}):</span><span>-${data.formattedDiscount}</span></div>` : ""}
  ${data.taxResult.isCustomerVisible && data.taxResult.taxAmountCents > 0 ? `
  <div class="row" style="font-size: 0.9em;">
    <span>${data.taxResult.taxLabel}:</span>
    <span>${data.formattedTax}</span>
  </div>
  ` : ""}
  ${data.taxResult.taxMode === "uk_eu_margin_scheme" ? `
  <div style="font-size: 0.75em; text-align: center; margin: 4px 0; font-style: italic;">
    ${data.taxResult.mandatoryNotice}
  </div>
  ` : ""}
  <div class="row">
    <span>Payment:</span>
    <span class="bold">${data.paymentSummary}</span>
  </div>
  ${data.paymentReference ? `<div class="row"><span>Ref #:</span><span>${data.paymentReference}</span></div>` : ""}
  <div class="double-line"></div>

  <div class="center">
    <div class="bold">DIGITAL WARRANTY ACTIVATED</div>
    <div>Valid Until: <span class="bold">${data.device.warrantyEnds}</span></div>
    <img class="qr" src="${data.qrPassportDataUrl}" alt="Warranty Passport QR" />
    <div style="font-size: 0.85em;">Scan QR code above for full health report and digital warranty card.</div>
  </div>

  <div class="line"></div>
  <div class="center" style="font-size: 0.8em;">
    <div>${data.shop.warrantyTerms}</div>
    <div style="margin-top: 6px;">Thank you for trusting ${data.shop.name}!</div>
  </div>
</body>
</html>`;
}

/**
 * Generates an official A4 Tax & Warranty Invoice for corporate sales, global filing, and customer records.
 */
export async function generateA4InvoiceHtml(invoiceReference: string, origin = ""): Promise<string> {
  const data = await getInvoiceData(invoiceReference, origin);
  if (!data) throw new Error(`Invoice not found for reference ${invoiceReference}`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${data.taxResult.taxMode === "uk_eu_margin_scheme" ? "Margin Scheme Invoice" : "Tax Invoice"} - ${data.invoiceReference}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 0;
      font-size: 14px;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .shop-title { font-size: 24px; font-weight: bold; color: #0f172a; }
    .inv-title { font-size: 26px; font-weight: bold; color: #2563eb; text-align: right; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #0f172a; color: #fff; text-align: left; padding: 10px 12px; font-size: 13px; }
    td { padding: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .total-box { margin-left: auto; width: 360px; border-top: 2px solid #0f172a; padding-top: 10px; }
    .footer { margin-top: 40px; display: flex; justify-content: space-between; gap: 30px; font-size: 12px; }
    .sign-line { border-top: 1px dashed #94a3b8; padding-top: 6px; text-align: center; margin-top: 40px; }
    .badge-notice {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 12px;
      color: #1e40af;
      margin-top: 8px;
    }
  </style>
</head>
<body onload="window.print()">
  <div class="header">
    <div>
      <div class="shop-title">${data.shop.name}</div>
      <div style="color: #64748b;">${data.shop.tagline}</div>
      <div style="font-size: 13px; margin-top: 4px;">${data.shop.address}</div>
      <div style="font-size: 13px;">Tel: ${data.shop.phone} | Email: ${data.shop.email}</div>
      ${data.shop.taxId ? `<div style="font-size: 13px; font-weight: bold; color: #0284c7; margin-top: 2px;">Tax / VAT / EIN Reg: ${data.shop.taxId}</div>` : ""}
    </div>
    <div>
      <div class="inv-title">
        ${data.taxResult.taxMode === "uk_eu_margin_scheme" ? "MARGIN SCHEME INVOICE" : data.taxResult.taxMode === "us_sales_tax" ? "SALES TAX INVOICE" : "TAX INVOICE"}
      </div>
      <div style="font-size: 15px; font-weight: bold; text-align: right; margin-top: 4px;"># ${data.invoiceReference}</div>
      <div style="text-align: right;"><strong>Date:</strong> ${data.soldAt}</div>
      ${data.deliveryMethod !== "In-Store Pickup" && data.courierName ? `
        <div style="text-align: right; font-size: 12px; color: #0284c7; margin-top: 4px;">
          <strong>Carrier:</strong> ${data.courierName}
          ${data.hasLiveTracking ? `<br><a href="${data.trackingUrl}" target="_blank" style="color: #0284c7; font-weight: bold;">Track: ${data.courierWaybill} ↗</a>` : `(${data.courierWaybill})`}
        </div>
      ` : ""}
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <strong>INVOICED TO:</strong>
      <div style="font-size: 16px; font-weight: bold; margin-top: 4px;">${data.customerName}</div>
      <div>Phone: ${data.customerPhone}</div>
      ${data.customerEmail ? `<div>Email: ${data.customerEmail}</div>` : ""}
      <div style="margin-top: 8px; font-size: 13px; color: #475569;">
        <strong>Payment Method:</strong> ${data.paymentSummary}
        ${data.paymentReference ? ` | <strong>Ref:</strong> ${data.paymentReference}` : ""}
      </div>
    </div>
    <div class="card" style="text-align: right; display: flex; align-items: center; justify-content: flex-end; gap: 14px;">
      <div>
        <strong>DIGITAL WARRANTY PASSPORT</strong>
        <div style="font-size: 13px; color: #64748b;">Motherboard Hardware Coverage:</div>
        <div style="font-weight: bold; color: #16a34a; font-size: 16px;">${data.device.warrantyEnds} (${data.warrantyBreakdown.motherboardMonths} Mo)</div>
        <div style="font-size: 11px; color: #64748b;">Battery/Adapter: ${data.warrantyBreakdown.batteryMonths} Mo | Screen: ${data.warrantyBreakdown.screenMonths} Mo</div>
      </div>
      <img src="${data.qrPassportDataUrl}" width="80" height="80" style="border-radius: 4px;" alt="QR" />
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>ITEM & HARDWARE SPECIFICATIONS</th>
        <th>SERIAL NO.</th>
        <th>R2v3 GRADE & SCORE</th>
        <th style="text-align: right;">TOTAL</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <strong>${data.device.name} (${data.device.model})</strong>
          <div style="font-size: 12px; color: #64748b;">${data.device.processor} | ${data.device.memory} RAM | ${data.device.storage} SSD</div>
          <div style="font-size: 12px; color: #16a34a;">Verified Battery Health: ${data.device.batteryHealth}%</div>
          ${data.bundledAccessories.length > 0 ? `
            <div style="margin-top: 6px; font-size: 11px; color: #0284c7;">
              <strong>Included Bundled Items:</strong> ${data.bundledAccessories.join(", ")}
            </div>
          ` : ""}
        </td>
        <td><code>${data.device.serial}</code></td>
        <td>Grade ${data.device.grade} (${data.device.score}/100)</td>
        <td style="text-align: right; font-weight: bold;">${data.formattedPrice}</td>
      </tr>
    </tbody>
  </table>

  <div class="total-box">
    ${data.discountCents > 0 ? `
    <div style="display: flex; justify-content: space-between; font-size: 13px; color: #ef4444; margin-bottom: 4px;">
      <span>Discount Applied (${data.discountReason || "Special"}):</span>
      <span>-${data.formattedDiscount}</span>
    </div>
    ` : ""}
    ${data.taxResult.isCustomerVisible && data.taxResult.taxAmountCents > 0 ? `
    <div style="display: flex; justify-content: space-between; font-size: 13px; color: #64748b; margin-bottom: 4px;">
      <span>${data.taxResult.taxLabel}:</span>
      <span>${data.formattedTax}</span>
    </div>
    ` : ""}
    <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: bold;">
      <span>Grand Total:</span>
      <span style="color: #0f172a;">${data.formattedPrice}</span>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 13px; color: #64748b; margin-top: 4px;">
      <span>Payment Tender:</span>
      <span>${data.paymentSummary}</span>
    </div>
  </div>

  ${data.taxResult.taxMode === "uk_eu_margin_scheme" ? `
  <div class="badge-notice">
    <strong>EU/UK Margin Scheme Notice:</strong> ${data.taxResult.mandatoryNotice}. Under EU Directive 2006/112/EC Article 226(11), VAT is not shown separately on this second-hand invoice.
  </div>
  ` : ""}

  <div style="margin-top: 24px; font-size: 12px; color: #64748b; background: #f8fafc; padding: 12px; border-radius: 6px;">
    <strong>Warranty & Statutory Protection Terms:</strong> Hardware components are covered during the stated warranty period. Battery and power adapter carry a ${data.warrantyBreakdown.batteryMonths} month replacement warranty. Physical cracks, liquid damage, and unauthorized tampering are excluded. Tamper-evident seals are affixed solely for component integrity and warranty identification without altering statutory consumer rights.
  </div>

  <div class="footer">
    <div>
      <div class="sign-line">Customer Acknowledgment (Received in certified condition)</div>
    </div>
    <div>
      <div class="sign-line">Authorized Cashier Stamp & Signature</div>
    </div>
  </div>
</body>
</html>`;
}

export const ESC_POS = {
  INIT: Buffer.from([0x1b, 0x40]),
  KICK_DRAWER_PIN2: Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]),
  KICK_DRAWER_PIN5: Buffer.from([0x1b, 0x70, 0x01, 0x19, 0xfa]),
  CUT_PARTIAL: Buffer.from([0x1d, 0x56, 0x41, 0x03]),
  ALIGN_LEFT: Buffer.from([0x1b, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([0x1b, 0x61, 0x01]),
  TEXT_DOUBLE: Buffer.from([0x1b, 0x21, 0x30]),
  TEXT_BOLD: Buffer.from([0x1b, 0x21, 0x08]),
  TEXT_NORMAL: Buffer.from([0x1b, 0x21, 0x00]),
  FEED_3_LINES: Buffer.from([0x1b, 0x64, 0x03]),
};

export async function generateRawEscPosCommands(invoiceReference: string, origin = "http://localhost:3000", openDrawer = true): Promise<Buffer> {
  const data = await getInvoiceData(invoiceReference, origin);
  if (!data) throw new Error(`Invoice not found for reference ${invoiceReference}`);

  const chunks: Buffer[] = [];
  chunks.push(ESC_POS.INIT);
  if (openDrawer) {
    chunks.push(ESC_POS.KICK_DRAWER_PIN2);
  }
  chunks.push(ESC_POS.ALIGN_CENTER);
  chunks.push(ESC_POS.TEXT_DOUBLE);
  chunks.push(Buffer.from(`${data.shop.name}\n`, "utf8"));
  chunks.push(ESC_POS.TEXT_NORMAL);
  if (data.shop.tagline) chunks.push(Buffer.from(`${data.shop.tagline}\n`, "utf8"));
  chunks.push(Buffer.from(`${data.shop.address}\n`, "utf8"));
  chunks.push(Buffer.from(`Tel: ${data.shop.phone}\n`, "utf8"));
  chunks.push(Buffer.from("--------------------------------\n", "utf8"));
  chunks.push(ESC_POS.ALIGN_LEFT);
  chunks.push(Buffer.from(`Invoice: ${data.invoiceReference}\n`, "utf8"));
  chunks.push(Buffer.from(`Date: ${data.soldAt}\n`, "utf8"));
  chunks.push(Buffer.from(`Cashier: ${data.activatedBy}\n`, "utf8"));
  chunks.push(Buffer.from(`Customer: ${data.customerName}\n`, "utf8"));
  chunks.push(Buffer.from(`Mobile: ${data.customerPhone}\n`, "utf8"));
  chunks.push(Buffer.from("--------------------------------\n", "utf8"));
  chunks.push(ESC_POS.TEXT_BOLD);
  chunks.push(Buffer.from(`${data.device.name}\n`, "utf8"));
  chunks.push(ESC_POS.TEXT_NORMAL);
  chunks.push(Buffer.from(`S/N: ${data.device.serial}\n`, "utf8"));
  chunks.push(Buffer.from(`Spec: ${data.device.processor}\n`, "utf8"));
  chunks.push(Buffer.from(`RAM/SSD: ${data.device.memory} / ${data.device.storage}\n`, "utf8"));
  chunks.push(Buffer.from("================================\n", "utf8"));
  chunks.push(ESC_POS.TEXT_BOLD);
  chunks.push(Buffer.from(`TOTAL: ${data.formattedPrice}\n`, "utf8"));
  chunks.push(ESC_POS.TEXT_NORMAL);
  if (data.discountCents > 0) {
    chunks.push(Buffer.from(`Discount: -${data.formattedDiscount}\n`, "utf8"));
  }
  chunks.push(Buffer.from(`Payment: ${data.paymentSummary}\n`, "utf8"));
  chunks.push(Buffer.from("================================\n", "utf8"));
  chunks.push(ESC_POS.ALIGN_CENTER);
  chunks.push(Buffer.from("Verify Warranty & Digital Passport:\n", "utf8"));
  chunks.push(Buffer.from(`${origin}/passport/${data.device.id}\n\n`, "utf8"));
  chunks.push(Buffer.from("Thank you for your business!\n", "utf8"));
  chunks.push(ESC_POS.FEED_3_LINES);
  chunks.push(ESC_POS.CUT_PARTIAL);

  return Buffer.concat(chunks);
}
