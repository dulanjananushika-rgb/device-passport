import test from "node:test";
import assert from "node:assert/strict";
import { getDatabase, createDeviceFromReport, activateDeviceSale } from "../lib/database.ts";
import { evaluateTradeIn, generateTradeInLegalVoucherHtml } from "../lib/trade-in.ts";
import { generateRawEscPosCommands, ESC_POS } from "../lib/invoicing.ts";

test("Real-World Shop Workflow Suite", async (t) => {
  
  const db = getDatabase();

  await t.test("Feature 1: Re-Intake Lifecycle Loop allows trade-in/buyback of previously sold serials", () => {
    const serial = `RE-INTAKE-${Date.now()}`;
    const report1 = {
      reportVersion: "2.5",
      device: { manufacturer: "Dell", model: "Latitude 5490", serialNumber: serial, memoryGB: 16, processor: "Intel Core i7" },
      battery: { present: true, healthPercent: 88, cycleCount: 150 },
      storage: [{ model: "Toshiba NVMe", healthStatus: "Healthy", sizeGB: 256 }]
    };
    const checks = { display: "pass", keyboard: "pass", camera: "pass", audio: "pass", ports: "pass", wireless: "pass" };

    // 1. Initial Intake & Publication
    const dev1 = createDeviceFromReport(report1, checks, "Cycle 1 initial intake", [], "tech@lapmart.lk");
    assert.equal(dev1.serial, serial);
    assert.equal(dev1.status, "Published");

    // 2. Sell to customer
    activateDeviceSale(dev1.id, {
      customerName: "Kamal Perera",
      customerPhone: "0771234567",
      customerEmail: "kamal@example.com",
      invoiceReference: `INV-C1-${Date.now()}`,
      soldAt: new Date().toISOString().slice(0, 10),
      salePriceLkr: "85000",
      paymentMethod: "Cash"
    }, "cashier@lapmart.lk");

    const soldDev = db.prepare("SELECT status FROM devices WHERE id = ?").get(dev1.id);
    assert.equal(soldDev.status, "Sold");

    // 3. Customer returns 1 year later to Trade-In / Sell back this exact laptop
    // Re-intake should NOT crash with 409 error; it archives Cycle 1 and issues Cycle 2 passport!
    const report2 = {
      reportVersion: "2.5",
      device: { manufacturer: "Dell", model: "Latitude 5490", serialNumber: serial, memoryGB: 16, processor: "Intel Core i7" },
      battery: { present: true, healthPercent: 78, cycleCount: 320 },
      storage: [{ model: "Toshiba NVMe", healthStatus: "Healthy", sizeGB: 256 }]
    };

    const dev2 = createDeviceFromReport(report2, checks, "Cycle 2 trade-in re-intake", [], "tech@lapmart.lk");
    assert.equal(dev2.serial, serial);
    assert.notEqual(dev2.id, dev1.id);

    // Verify Cycle 1 historical record was cleanly archived
    const cycle1Archived = db.prepare("SELECT serial, status FROM devices WHERE id = ?").get(dev1.id);
    assert.match(cycle1Archived.serial, /#CYCLE_/);
    assert.equal(cycle1Archived.status, "Sold");
  });

  await t.test("Feature 2: Trade-In Legal Compliance & Anti-Stolen Property Declaration", () => {
    const tradeIn = evaluateTradeIn({
      customerName: "Sunil Shantha",
      customerPhone: "0719876543",
      customerNicPassport: "198512345678",
      legalDeclarationSigned: true,
      legalNotes: "Original national ID card verified at counter. Accounts removed.",
      brand: "HP",
      model: "EliteBook 840 G5",
      serial: `HP-TIN-${Date.now()}`,
      grade: "A",
      processorTier: "Core i5",
      ramGb: 16,
      storageGb: 512,
      hasCharger: true,
      batteryHealthPercent: 85
    }, "evaluator@lapmart.lk");

    assert.equal(tradeIn.customerNicPassport, "198512345678");
    assert.equal(tradeIn.legalDeclarationSigned, true);
    assert.ok(tradeIn.offeredTradeInValueCents > 0);

    // Generate Legal Ownership Transfer Voucher
    const voucherHtml = generateTradeInLegalVoucherHtml(tradeIn.id);
    assert.match(voucherHtml, /Legal Equipment Purchase & Ownership Transfer Voucher/);
    assert.match(voucherHtml, /198512345678/);
    assert.match(voucherHtml, /ANTI-STOLEN GOODS DECLARATION/);
    assert.match(voucherHtml, /Customer \/ Seller Signature/);
  });

  await t.test("Feature 3: Anti-Fraud Manager PIN Protection for High Cashier Discounts", () => {
    const serial = `DISC-TEST-${Date.now()}`;
    const report = {
      reportVersion: "2.5",
      device: { manufacturer: "Lenovo", model: "ThinkPad T480", serialNumber: serial, memoryGB: 16, processor: "Intel Core i5" },
      battery: { present: true, healthPercent: 90, cycleCount: 80 },
      storage: [{ model: "Samsung SSD", healthStatus: "Healthy", sizeGB: 512 }]
    };
    const checks = { display: "pass", keyboard: "pass", camera: "pass", audio: "pass", ports: "pass", wireless: "pass" };
    const dev = createDeviceFromReport(report, checks, "Clean device", [], "tech@lapmart.lk");

    // 1. Attempt 20% discount without Manager PIN -> Must be blocked
    assert.throws(() => {
      activateDeviceSale(dev.id, {
        customerName: "Discount Seeker",
        customerPhone: "0770001122",
        invoiceReference: `INV-DISC-1-${Date.now()}`,
        soldAt: new Date().toISOString().slice(0, 10),
        salePriceLkr: "100000",
        discountLkr: "20000", // 20% discount (exceeds default 10% threshold)
        discountReason: "Friend Discount",
        paymentMethod: "Cash"
      }, "cashier@lapmart.lk");
    }, /Manager authorization required/);

    // 2. Attempt with invalid PIN -> Must be blocked
    assert.throws(() => {
      activateDeviceSale(dev.id, {
        customerName: "Discount Seeker",
        customerPhone: "0770001122",
        invoiceReference: `INV-DISC-2-${Date.now()}`,
        soldAt: new Date().toISOString().slice(0, 10),
        salePriceLkr: "100000",
        discountLkr: "20000",
        discountReason: "Friend Discount",
        managerPin: "9999", // Wrong PIN
        paymentMethod: "Cash"
      }, "cashier@lapmart.lk");
    }, /Manager authorization required/);

    // 3. Authorized with valid Manager PIN ('1234') -> Must succeed
    const sale = activateDeviceSale(dev.id, {
      customerName: "Discount Seeker",
      customerPhone: "0770001122",
      invoiceReference: `INV-DISC-3-${Date.now()}`,
      soldAt: new Date().toISOString().slice(0, 10),
      salePriceLkr: "100000",
      discountLkr: "20000",
      discountReason: "Approved Promo Discount",
      managerPin: "1234",
      paymentMethod: "Cash"
    }, "cashier@lapmart.lk");

    assert.equal(sale.status, "Sold");
    const auditEvent = db.prepare("SELECT * FROM audit_events WHERE action = 'sales.manager_override' ORDER BY created_at DESC LIMIT 1").get();
    assert.ok(auditEvent);
  });

  await t.test("Feature 4: Raw ESC/POS Thermal Printing & Cash Drawer Kick Pulse", async () => {
    const serial = `PRNT-TEST-${Date.now()}`;
    const report = {
      reportVersion: "2.5",
      device: { manufacturer: "Asus", model: "ZenBook 14", serialNumber: serial, memoryGB: 16, processor: "AMD Ryzen 7" },
      battery: { present: true, healthPercent: 95, cycleCount: 40 },
      storage: [{ model: "WD Black NVMe", healthStatus: "Healthy", sizeGB: 512 }]
    };
    const checks = { display: "pass", keyboard: "pass", camera: "pass", audio: "pass", ports: "pass", wireless: "pass" };
    const dev = createDeviceFromReport(report, checks, "Printer test device", [], "tech@lapmart.lk");
    const invRef = `INV-PRNT-${Date.now()}`;

    activateDeviceSale(dev.id, {
      customerName: "Nimal Silva",
      customerPhone: "0775556677",
      invoiceReference: invRef,
      soldAt: new Date().toISOString().slice(0, 10),
      salePriceLkr: "125000",
      paymentMethod: "Card"
    }, "cashier@lapmart.lk");

    const escposBuffer = await generateRawEscPosCommands(invRef, "http://localhost:3000", true);
    assert.ok(escposBuffer instanceof Buffer);
    assert.ok(escposBuffer.length > 50);

    // Verify contains RJ11 drawer kick pulse sequence (\x1B\x70\x00\x19\xFA)
    const kickIndex = escposBuffer.indexOf(ESC_POS.KICK_DRAWER_PIN2);
    assert.ok(kickIndex >= 0, "Buffer must contain cash drawer kick pulse");

    // Verify contains cut command (\x1D\x56\x41\x03)
    const cutIndex = escposBuffer.indexOf(ESC_POS.CUT_PARTIAL);
    assert.ok(cutIndex >= 0, "Buffer must contain paper cut command");
  });
});
