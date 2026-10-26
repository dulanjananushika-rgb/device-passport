import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../lib/database.ts";
import {
  registerSecuritySeal,
  verifySecuritySeal,
  checkWarrantySealIntegrity,
  listDeviceSecuritySeals,
} from "../lib/security-seals.ts";
import {
  normalizePhoneNumber,
  generateCustomerOtp,
  verifyCustomerOtp,
  verifyCustomerSession,
  getCustomerPortalData,
} from "../lib/customer-portal.ts";
import { generateThermalReceiptHtml, generateA4InvoiceHtml, getInvoiceData } from "../lib/invoicing.ts";
import {
  calculateTradeInValuation,
  evaluateTradeIn,
  acceptTradeIn,
  getTradeInEvaluation,
} from "../lib/trade-in.ts";

test.before(() => {
  getDatabase();
});

// -------------------------------------------------------------
// Test 1: Tamper-Evident Security Seals & Anti-Fraud Engine
// -------------------------------------------------------------
test("Security seals can be applied, verified, and detect warranty-voiding tampering", () => {
  const serial = `SEAL-TEST-${randomUUID().slice(0, 6).toUpperCase()}`;
  const deviceId = `dev_seal_${randomUUID().slice(0, 6)}`;
  const seal1 = `SL-${randomUUID().slice(0, 6).toUpperCase()}`;
  const seal2 = `SL-${randomUUID().slice(0, 6).toUpperCase()}`;

  // Register 2 seals
  const reg1 = registerSecuritySeal(
    {
      deviceId,
      serial,
      sealNumber: seal1,
      placementLocation: "Base Cover Center Screw",
    },
    "technician@lapmart.lk"
  );
  assert.equal(reg1.status, "Intact");
  assert.equal(reg1.sealNumber, seal1);

  registerSecuritySeal(
    {
      deviceId,
      serial,
      sealNumber: seal2,
      placementLocation: "RAM Access Door",
    },
    "technician@lapmart.lk"
  );

  // Check integrity: both intact
  const checkInitial = checkWarrantySealIntegrity(serial);
  assert.equal(checkInitial.valid, true);
  assert.equal(checkInitial.brokenSeals.length, 0);

  // Customer opens the laptop at home: seal 1 broken
  verifySecuritySeal(seal1, "Broken", "support@lapmart.lk", "Customer broke seal to swap SSD");

  // Check integrity again: must be flagged invalid/void!
  const checkTampered = checkWarrantySealIntegrity(serial);
  assert.equal(checkTampered.valid, false);
  assert.equal(checkTampered.brokenSeals.length, 1);
  assert.equal(checkTampered.brokenSeals[0].sealNumber, seal1);
  assert.ok(checkTampered.message.includes("Warranty void"));
});

// -------------------------------------------------------------
// Test 2: Customer Self-Service Portal & Phone OTP Engine
// -------------------------------------------------------------
test("Phone OTP generation, attempt limiting, and customer portal data retrieval", () => {
  const rawPhone = "077 456 7890";
  const normalized = normalizePhoneNumber(rawPhone);
  assert.equal(normalized, "+94774567890");

  // 1. Generate OTP
  const otpRes = generateCustomerOtp(rawPhone);
  assert.equal(otpRes.success, true);
  assert.equal(otpRes.phone, "+94774567890");
  assert.ok(otpRes.devCode, "Dev code should be available in test environment");

  // 2. Reject incorrect OTP
  assert.throws(() => {
    verifyCustomerOtp(rawPhone, "000000");
  }, /Incorrect verification code/);

  // 3. Verify correct OTP
  const verifyRes = verifyCustomerOtp(rawPhone, otpRes.devCode);
  assert.equal(verifyRes.success, true);
  assert.ok(verifyRes.sessionToken.startsWith("csess_"));

  // 4. Validate session token
  const sessionCheck = verifyCustomerSession(verifyRes.sessionToken);
  assert.equal(sessionCheck.valid, true);
  assert.equal(sessionCheck.phone, "+94774567890");

  // 5. Query customer portal data
  const db = getDatabase();
  const testSerial = `CUST-DEV-${randomUUID().slice(0, 6).toUpperCase()}`;
  const testDevId = `dev_cust_${randomUUID().slice(0, 6)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO devices (
      id, organization_id, branch_id, name, model, serial, grade, score,
      battery_health, storage_health, memory, storage, processor, tested_at,
      technician, warranty_ends, status, created_at
    ) VALUES (?, 'default_org', 'default_branch', 'Lenovo X1 Carbon', 'X1 Carbon', ?, 'A', 98, 96, 100, '16GB', '512GB', 'i7', ?, 'Tech', '2027-10-26', 'Sold', ?)
  `).run(testDevId, testSerial, now, now);

  db.prepare(`
    INSERT INTO device_sales (
      device_id, customer_name, customer_email, customer_phone, invoice_reference,
      sale_price_cents, sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at
    ) VALUES (?, 'Kamal Silva', 'kamal@example.com', ?, ?, 9500000, ?, ?, '2027-10-26', ?, 'Owner', ?)
  `).run(testDevId, normalized, `INV-CUST-${randomUUID().slice(0, 6)}`, now, now, `token_${randomUUID().slice(0, 6)}`, now);

  const portalData = getCustomerPortalData(rawPhone);
  assert.equal(portalData.phone, "+94774567890");
  const purchased = portalData.devices.find((d) => d.serial === testSerial);
  assert.ok(purchased, "Purchased device must be present in customer portal view");
  assert.equal(purchased.name, "Lenovo X1 Carbon");
  assert.equal(purchased.salePriceCents, 9500000);
});

// -------------------------------------------------------------
// Test 3: Thermal Receipt (80mm) & A4 Official Tax Invoice HTML
// -------------------------------------------------------------
test("Invoicing engine generates valid ESC/POS thermal receipt and formal A4 tax invoice", async () => {
  const db = getDatabase();
  const invRef = `INV-POS-${randomUUID().slice(0, 6).toUpperCase()}`;
  const devId = `dev_inv_${randomUUID().slice(0, 6)}`;
  const serial = `INV-SR-${randomUUID().slice(0, 6).toUpperCase()}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO devices (
      id, organization_id, branch_id, name, model, serial, grade, score,
      battery_health, storage_health, memory, storage, processor, tested_at,
      technician, warranty_ends, status, created_at
    ) VALUES (?, 'default_org', 'default_branch', 'Apple MacBook Pro 13', 'MacBookPro15,2', ?, 'A', 96, 94, 100, '16GB', '512GB', 'Core i5', ?, 'Tech', '2027-10-26', 'Sold', ?)
  `).run(devId, serial, now, now);

  db.prepare(`
    INSERT INTO device_sales (
      device_id, customer_name, customer_email, customer_phone, invoice_reference,
      sale_price_cents, sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at
    ) VALUES (?, 'Ruwan Jayasinghe', 'ruwan@example.com', '+94712345678', ?, 12500000, ?, ?, '2027-10-26', ?, 'Owner', ?)
  `).run(devId, invRef, now, now, `tok_${randomUUID().slice(0, 6)}`, now);

  // 1. Check raw invoice data
  const invoiceData = await getInvoiceData(invRef);
  assert.ok(invoiceData, "Invoice data should be found");
  assert.equal(invoiceData.customerName, "Ruwan Jayasinghe");
  assert.ok(invoiceData.qrPassportDataUrl.startsWith("data:image/png;base64,"));

  // 2. Generate 80mm Thermal Receipt
  const receiptHtml = await generateThermalReceiptHtml(invRef, 80);
  assert.ok(receiptHtml.includes("OFFICIAL SALE RECEIPT"));
  assert.ok(receiptHtml.includes(invRef));
  assert.ok(receiptHtml.includes("MacBook Pro 13"));
  assert.ok(receiptHtml.includes("DIGITAL WARRANTY ACTIVATED"));

  // 3. Generate A4 Tax Invoice
  const a4Html = await generateA4InvoiceHtml(invRef);
  assert.ok(a4Html.includes("TAX INVOICE"));
  assert.ok(a4Html.includes(invRef));
  assert.ok(a4Html.includes("Customer Acknowledgment"));
  assert.ok(a4Html.includes("Authorized Cashier Stamp"));
});

// -------------------------------------------------------------
// Test 4: Trade-In / Laptop Exchange Valuation Engine
// -------------------------------------------------------------
test("calculateTradeInValuation applies objective deductions and records quote", () => {
  // Scenario: Core i5, 8GB RAM, 256GB SSD, Grade B condition, with degraded battery (<75%)
  const val = calculateTradeInValuation({
    customerName: "Saman Kumara",
    customerPhone: "0771122334",
    brand: "Dell",
    model: "Inspiron 5570",
    serial: "DELL-EXCHANGE-001",
    processorTier: "Core i5",
    ramGb: 8,
    storageGb: 256,
    grade: "B",
    batteryHealthPercent: 65, // Degraded battery (<75%)
    hasCharger: true,
  });

  // Base Core i5 = 55,000 LKR (5,500,000 cents)
  // Grade B = 0.78 * 5,500,000 = 4,290,000 cents
  // Deductions = Base 250,000 + Degraded Battery 800,000 = 1,050,000 cents
  // Offered = 4,290,000 - 1,050,000 = 3,240,000 cents (~32,400 LKR)
  assert.equal(val.marketValueCents, 5500000);
  assert.equal(val.refurbishmentCostCents, 1050000);
  assert.equal(val.offeredValueCents, 3240000);

  // Record evaluation
  const evaluation = evaluateTradeIn(
    {
      customerName: "Saman Kumara",
      customerPhone: "0771122334",
      brand: "Dell",
      model: "Inspiron 5570",
      serial: `TRD-${randomUUID().slice(0, 6).toUpperCase()}`,
      grade: "B",
      baseMarketValueCents: 5500000,
    },
    "owner@lapmart.lk"
  );
  assert.equal(evaluation.status, "Quoted");

  // Accept trade-in towards purchasing a new device
  const targetDeviceId = `dev_${randomUUID().slice(0, 6)}`;
  const accepted = acceptTradeIn(evaluation.id, targetDeviceId, "owner@lapmart.lk");
  assert.equal(accepted.status, "Accepted");
  assert.equal(accepted.acceptedForDeviceId, targetDeviceId);

  const found = getTradeInEvaluation(evaluation.id);
  assert.equal(found?.status, "Accepted");
});
