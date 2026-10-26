import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWhatsAppPhone,
  generateWhatsAppClickToChatUrl,
  sendWarrantyActivationMessage,
  sendClaimStatusMessage,
  sendClaimCompletedMessage,
  sendWarrantyExpiryReminder,
  sendWhatsAppMessage,
} from "../lib/whatsapp.ts";
import {
  buildGoogleReviewUrl,
  createReviewPromptMessage,
  createReviewPromptClickToChatUrl,
  sendReviewPromptNotification,
} from "../lib/google-reviews.ts";
import {
  extractBrand,
  parseRamGb,
  extractProcessorTier,
  maskSerialNumber,
  queryPublicCatalog,
  getCatalogItemBySerial,
} from "../lib/public-catalog.ts";
import {
  generateSocialCardSvg,
  generateSocialCardHtml,
  buildSocialCardOptionsForDevice,
} from "../lib/social-graphics.ts";
import { getDatabase } from "../lib/database.ts";

test.before(() => {
  // Ensure database schema and seed devices are ready
  getDatabase();
});

test("WhatsApp phone normalization and click-to-chat url generation", () => {
  assert.equal(normalizeWhatsAppPhone("0771234567"), "94771234567");
  assert.equal(normalizeWhatsAppPhone("+94 77 123 4567"), "94771234567");
  assert.equal(normalizeWhatsAppPhone("771234567"), "94771234567");
  assert.equal(normalizeWhatsAppPhone("+1 (555) 234-5678"), "15552345678");

  const clickUrl = generateWhatsAppClickToChatUrl("0771234567", "Hello Lapmart!");
  assert.ok(clickUrl.startsWith("https://wa.me/94771234567?text="));
  assert.ok(clickUrl.includes("Hello%20Lapmart!"));
});

test("WhatsApp omnichannel notification triggers in simulated/fallback mode", async () => {
  // 1. Warranty Activation
  const activationRes = await sendWarrantyActivationMessage({
    phone: "0771234567",
    customerName: "Sunil Silva",
    deviceName: "ThinkPad T14 Gen 2",
    serialNumber: "PF3K9L2A",
    warrantyEnds: "2027-02-10",
    passportUrl: "https://devicepassport.io/passport/PF3K9L2A",
    shopName: "Lapmart Test Lab",
  }, { simulate: true });

  assert.equal(activationRes.success, true);
  assert.equal(activationRes.recipient, "94771234567");
  assert.ok(activationRes.messageText.includes("Sunil Silva"));
  assert.ok(activationRes.messageText.includes("PF3K9L2A"));
  assert.ok(activationRes.messageText.includes("https://devicepassport.io/passport/PF3K9L2A"));

  // 2. Claim Status Update
  const statusRes = await sendClaimStatusMessage({
    phone: "+94719876543",
    customerName: "Amara Perera",
    claimId: "CLM-9921",
    deviceName: "Dell Latitude 7420",
    status: "Quality Check",
    technicianNote: "Screen replaced and 2-hour stress test passed.",
    trackingUrl: "https://devicepassport.io/claim/CLM-9921",
  }, { simulate: true });

  assert.equal(statusRes.success, true);
  assert.ok(statusRes.messageText.includes("QUALITY CHECK"));
  assert.ok(statusRes.messageText.includes("CLM-9921"));

  // 3. Claim Completed & Ready for Pickup
  const completedRes = await sendClaimCompletedMessage({
    phone: "0771122334",
    customerName: "Nimal Fernando",
    claimId: "CLM-9921",
    deviceName: "Dell Latitude 7420",
    pickupAddress: "123 Galle Road, Colombo 03",
    trackingUrl: "https://devicepassport.io/claim/CLM-9921",
    googleReviewUrl: "https://g.page/r/lapmart-colombo/review",
  }, { simulate: true });

  assert.equal(completedRes.success, true);
  assert.ok(completedRes.messageText.includes("Ready for Pickup"));
  assert.ok(completedRes.messageText.includes("123 Galle Road"));
  assert.ok(completedRes.messageText.includes("https://g.page/r/lapmart-colombo/review"));

  // 4. Warranty Expiry Reminder
  const expiryRes = await sendWarrantyExpiryReminder({
    phone: "0770001122",
    customerName: "Kamal Gunawardena",
    deviceName: "HP EliteBook 840 G7",
    serialNumber: "5CG1124KQJ",
    warrantyEnds: "2026-11-01",
    daysRemaining: 7,
    tradeInUrl: "https://devicepassport.io/trade-in",
  }, { simulate: true });

  assert.equal(expiryRes.success, true);
  assert.ok(expiryRes.messageText.includes("7 Days Remaining"));
  assert.ok(expiryRes.messageText.includes("5CG1124KQJ"));
});

test("Google review booster generates high-converting messages and URLs", async () => {
  const directUrl = buildGoogleReviewUrl("ChIJN1t_tDeuEmsRUsoyG83frY4");
  assert.equal(
    directUrl,
    "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4"
  );

  const existingUrl = buildGoogleReviewUrl("https://g.page/r/lapmart/review");
  assert.equal(existingUrl, "https://g.page/r/lapmart/review");

  const msg = createReviewPromptMessage({
    customerName: "Dinesh",
    shopName: "Lapmart",
    deviceModel: "ThinkPad T14",
    serviceType: "purchase",
    reviewUrl: existingUrl,
    offerIncentive: true,
  });

  assert.ok(msg.includes("Dinesh"));
  assert.ok(msg.includes("Lapmart"));
  assert.ok(msg.includes("https://g.page/r/lapmart/review"));
  assert.ok(msg.includes("10% OFF"));

  const clickUrl = createReviewPromptClickToChatUrl("0771234567", {
    customerName: "Dinesh",
    shopName: "Lapmart",
    deviceModel: "ThinkPad T14",
    serviceType: "purchase",
    reviewUrl: existingUrl,
  });
  assert.ok(clickUrl.startsWith("https://wa.me/94771234567"));

  const sendRes = await sendReviewPromptNotification("0771234567", {
    customerName: "Dinesh",
    shopName: "Lapmart",
    deviceModel: "ThinkPad T14",
    serviceType: "purchase",
    reviewUrl: existingUrl,
  });
  assert.equal(sendRes.success, true);
});

test("Public catalog query engine filters, calculates prices, and builds WhatsApp inquiry links", async () => {
  // Unit extraction tests
  assert.equal(extractBrand("Lenovo ThinkPad T14 Gen 2", "20W0S4KD00"), "Lenovo");
  assert.equal(extractBrand("Dell Latitude 7420", "Latitude 7420"), "Dell");
  assert.equal(extractBrand("HP EliteBook 840 G7", "1C9P6AV"), "HP");

  assert.equal(parseRamGb("16 GB DDR4"), 16);
  assert.equal(parseRamGb("8GB"), 8);
  assert.equal(parseRamGb("32 GB LPDDR4x"), 32);

  assert.equal(extractProcessorTier("Intel Core i7-1185G7"), "i7");
  assert.equal(extractProcessorTier("Intel Core i5-1135G7"), "i5");
  assert.equal(extractProcessorTier("AMD Ryzen 7 5850U"), "ryzen7");
  assert.equal(extractProcessorTier("Apple M1 Pro"), "apple_m");

  assert.equal(maskSerialNumber("PF3K9L2A"), "PF****2A");

  // Query catalog from database
  const catalog = await queryPublicCatalog({ pageSize: 10 });
  assert.ok(catalog.totalCount >= 1);
  assert.ok(catalog.items.length >= 1);

  const firstItem = catalog.items[0];
  assert.ok(firstItem.name);
  assert.ok(firstItem.brand);
  assert.ok(firstItem.priceCents > 0);
  assert.ok(firstItem.formattedPrice.includes("LKR") || firstItem.formattedPrice.includes("Rs."));
  assert.ok(firstItem.inquiryWhatsAppUrl.startsWith("https://wa.me/"));
  assert.ok(firstItem.passportUrl.startsWith("/passport/"));

  // Brand filter
  const lenovoOnly = await queryPublicCatalog({ brand: "Lenovo" });
  for (const item of lenovoOnly.items) {
    assert.equal(item.brand, "Lenovo");
  }

  // RAM filter
  const min16Ram = await queryPublicCatalog({ minRamGb: 16 });
  for (const item of min16Ram.items) {
    assert.ok(item.ramGb >= 16);
  }

  // Lookup single item by serial
  const single = await getCatalogItemBySerial(firstItem.serial);
  assert.ok(single);
  assert.equal(single.serial, firstItem.serial);
});

test("1-Click Social Media Graphic Generator produces valid 1080x1080 SVG & HTML with embedded QR", async () => {
  const options = {
    shopName: "LAPMART CERTIFIED",
    tagline: "Corporate Refurbished Laptops",
    phone: "+94 77 123 4567",
    address: "Liberty Plaza, Colombo 03",
    brand: "LENOVO",
    name: "ThinkPad T14 Gen 2",
    model: "20W0S4KD00",
    serial: "PF3K9L2A",
    grade: "A",
    score: 96,
    batteryHealth: 88,
    processor: "Intel Core i5-1135G7 (4.2GHz)",
    memory: "16 GB DDR4",
    storage: "512 GB NVMe SSD",
    warrantyPeriod: "6 Months Comprehensive Warranty",
    priceLkr: "Rs. 135,000 /=",
    passportUrl: "https://devicepassport.io/passport/PF3K9L2A",
  };

  const svg = await generateSocialCardSvg(options);
  assert.ok(svg.includes('viewBox="0 0 1080 1080"'));
  assert.ok(svg.includes("ThinkPad T14 Gen 2"));
  assert.ok(svg.includes("Intel Core i5-1135G7"));
  assert.ok(svg.includes("Rs. 135,000 /="));
  assert.ok(svg.includes("data:image/png;base64,")); // QR code embedded
  assert.ok(svg.includes("PF3K9L2A"));

  const html = await generateSocialCardHtml(options);
  assert.ok(html.includes("<!DOCTYPE html>"));
  assert.ok(html.includes("1080px"));
  assert.ok(html.includes(svg));

  // Build options from live database device
  const builtOptions = await buildSocialCardOptionsForDevice("PF3K9L2A");
  assert.ok(builtOptions);
  assert.equal(builtOptions.serial, "PF3K9L2A");
  assert.ok(builtOptions.priceLkr.includes("LKR") || builtOptions.priceLkr.includes("Rs."));
});
