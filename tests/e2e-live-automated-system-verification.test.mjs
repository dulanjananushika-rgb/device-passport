import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Import core modules
import { calculateInspectionScore } from "../lib/inspection.ts";
import {
  getDatabase,
  findDevice,
  createDeviceFromReport,
  activateDeviceSale,
} from "../lib/database.ts";
import { evaluateTradeIn, generateTradeInLegalVoucherHtml } from "../lib/trade-in.ts";
import { generateRawEscPosCommands, ESC_POS } from "../lib/invoicing.ts";

test("100% End-to-End Automated Live System Verification", async (t) => {
  const liveJsonPath = path.join(rootDir, "tools", "windows", "live_test_output.json");
  assert.ok(fs.existsSync(liveJsonPath), "Live hardware JSON report must exist");

  const rawContent = fs.readFileSync(liveJsonPath, "utf-8");
  const parsed = JSON.parse(rawContent);

  const mockChecks = {
    display: "pass",
    keyboard: "pass",
    camera: "pass",
    audio: "pass",
    ports: "pass",
    wireless: "pass",
  };

  let createdDeviceId = "";
  let currentSerial = parsed.device.serialNumber || "1FX6VN2";
  const uniqueInvRef = `INV-TEST-${Date.now()}`;

  await t.test("Step 1: Ingest Live Laptop Diagnostic Report & Calculate Score", async () => {
    assert.equal(parsed.device.manufacturer, "Dell Inc.");
    assert.equal(parsed.device.model, "Latitude 5490");
    assert.equal(parsed.device.serialNumber, "1FX6VN2");
    assert.equal(parsed.device.ramSlotsTotal, 2);
    assert.equal(parsed.device.ramSlotsFree, 1);

    const scoreResult = calculateInspectionScore(parsed, mockChecks);
    assert.ok(scoreResult.score > 0, "Score must be greater than 0");
    assert.ok(["A", "B", "C"].includes(scoreResult.grade), "Must be assigned an official grade");
    // Since battery health is 33% (< 75%), needsReview must be true to protect the shop
    assert.equal(scoreResult.needsReview, true, "Battery at 33% must trigger technician review");
    console.log(`   ✔ Device Evaluated: ${parsed.device.manufacturer} ${parsed.device.model} - Grade: ${scoreResult.grade} (Score: ${scoreResult.score}%, Battery: ${scoreResult.batteryHealth}%)`);
  });

  await t.test("Step 2: Save Diagnostic Run to Database, Flag Needs Review & Approve for Retail", async () => {
    const db = getDatabase();
    // Clean up any old test record with same serial
    db.prepare("DELETE FROM devices WHERE serial LIKE ?").run(`${currentSerial}%`);

    const created = createDeviceFromReport(
      parsed,
      mockChecks,
      "Live automated system verification test",
      [],
      "AutoTester"
    );

    assert.ok(created.id, "Must generate a DevicePassport ID");
    assert.equal(created.serial, currentSerial);
    assert.equal(created.model, "Latitude 5490");
    // Verified: low battery triggers "Needs review" safeguarding quality
    assert.equal(created.status, "Needs review");
    createdDeviceId = created.id;

    // Senior Technician inspects battery notes and explicitly approves device for retail publication
    db.prepare("UPDATE devices SET status = 'Published' WHERE id = ?").run(createdDeviceId);
    const approved = findDevice(createdDeviceId);
    assert.equal(approved.status, "Published");

    console.log(`   ✔ Passport Stored: ID ${created.id} (Quality Flag: Needs review -> Approved to Published)`);
  });

  await t.test("Step 3: Anti-Fraud POS Sale with Cashier & Manager PIN", async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Attempt high discount (> 10%) without Manager PIN -> Must throw
    assert.throws(
      () => {
        activateDeviceSale(
          createdDeviceId,
          {
            customerName: "Kamal Perera",
            customerPhone: "+94771234567",
            customerEmail: "kamal@example.com",
            invoiceReference: uniqueInvRef,
            soldAt: today,
            salePriceLkr: "100000",
            paymentMethod: "Cash",
            discountLkr: "25000",
            discountReason: "Discretionary cash discount",
            // managerPin omitted
          },
          "Cashier01"
        );
      },
      /Manager authorization required/,
      "High discount without manager PIN must be blocked"
    );

    // Attempt high discount WITH Valid Manager PIN -> Must succeed
    const sold = activateDeviceSale(
      createdDeviceId,
      {
        customerName: "Kamal Perera",
        customerPhone: "+94771234567",
        customerEmail: "kamal@example.com",
        invoiceReference: uniqueInvRef,
        soldAt: today,
        salePriceLkr: "100000",
        paymentMethod: "Cash",
        discountLkr: "25000",
        discountReason: "Approved promotional discount",
        managerPin: "1234",
      },
      "Cashier01"
    );

    assert.equal(sold.status, "Sold");
    assert.ok(sold.sale?.handoverToken, "Handover warranty token must be generated");
    console.log(`   ✔ POS Sale Completed: Warranty Token ${sold.sale?.handoverToken?.slice(0, 8)}... (Manager PIN Verified)`);
  });

  await t.test("Step 4: Thermal ESC/POS Receipt & RJ11 Cash Drawer Kick Generation", async () => {
    const escposBuffer = await generateRawEscPosCommands(uniqueInvRef, "http://localhost:3000", true);
    assert.ok(escposBuffer instanceof Buffer);
    assert.ok(escposBuffer.length > 50);

    // Verify contains RJ11 drawer kick pulse sequence (\x1B\x70\x00\x19\xFA)
    const kickIndex = escposBuffer.indexOf(ESC_POS.KICK_DRAWER_PIN2);
    assert.ok(kickIndex >= 0, "Buffer must contain cash drawer kick pulse");

    // Verify contains cut command (\x1D\x56\x41\x03)
    const cutIndex = escposBuffer.indexOf(ESC_POS.CUT_PARTIAL);
    assert.ok(cutIndex >= 0, "Buffer must contain paper cut command");
    console.log(`   ✔ ESC/POS Thermal Payload Generated: RJ11 Drawer Kick Pulse & Cut Verified (${escposBuffer.length} bytes)`);
  });

  await t.test("Step 5: Trade-In Anti-Stolen Legal Voucher Generation", async () => {
    const tradeIn = evaluateTradeIn({
      customerName: "Sunil Shantha",
      customerPhone: "0719876543",
      customerNicPassport: "198812345678",
      legalDeclarationSigned: true,
      legalNotes: "Original national ID card verified at counter. Accounts removed.",
      brand: "HP",
      model: "EliteBook 840 G5",
      serial: `HP-LIVE-${Date.now()}`,
      grade: "A",
      processorTier: "Core i5",
      ramGb: 16,
      storageGb: 512,
      hasCharger: true,
      batteryHealthPercent: 85,
    }, "evaluator@lapmart.lk");

    assert.equal(tradeIn.customerNicPassport, "198812345678");
    assert.equal(tradeIn.legalDeclarationSigned, true);

    const voucherHtml = generateTradeInLegalVoucherHtml(tradeIn.id);
    assert.match(voucherHtml, /ANTI-STOLEN GOODS DECLARATION/);
    assert.match(voucherHtml, /198812345678/);
    assert.match(voucherHtml, /Customer \/ Seller Signature/);
    console.log(`   ✔ Legal Trade-In Voucher Generated: NIC 198812345678 & Anti-Stolen Declaration Validated`);
  });

  await t.test("Step 6: Asset Re-Intake Lifecycle Loop (Trade-In of Sold Device)", async () => {
    // Re-intake the Dell Latitude 5490 serial "1FX6VN2" (which was sold in Step 3)
    // Must archive previous cycle as `${serial}#CYCLE_...` and issue a new passport without collision!
    const reIntakeDevice = createDeviceFromReport(
      parsed,
      mockChecks,
      "Second lifecycle intake: customer traded back after 6 months",
      [],
      "SeniorTech"
    );

    assert.ok(reIntakeDevice.id, "Must generate fresh passport ID for new lifecycle");
    assert.notEqual(reIntakeDevice.id, createdDeviceId, "Must be a distinct passport from previous cycle");
    assert.equal(reIntakeDevice.serial, currentSerial, "New active passport must have original serial");

    // Check that previous record was safely archived
    const db = getDatabase();
    const archivedRow = db.prepare("SELECT id, serial, status FROM devices WHERE id = ?").get(createdDeviceId);
    assert.ok(archivedRow.serial.startsWith(`${currentSerial}#CYCLE_`), "Old record serial must be archived with #CYCLE_ suffix");
    assert.equal(archivedRow.status, "Sold", "Old record status must remain Sold");

    console.log(`   ✔ Re-Intake Lifecycle Loop: Previous cycle ${createdDeviceId} archived as ${archivedRow.serial}, fresh passport ${reIntakeDevice.id} issued!`);
  });
});
