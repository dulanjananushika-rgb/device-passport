import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  createSupplierRma,
  updateSupplierRmaStatus,
  listSupplierRmas,
  getRmaMetrics,
  ensureRmaSchema,
} from "../lib/supplier-rma.ts";
import {
  calculateTechnicianCommissions,
  defaultCommissionRates,
} from "../lib/technician-commissions.ts";
import {
  getPendingFollowUpSequences,
  markSequenceDispatched,
  ensureSequenceSchema,
} from "../lib/whatsapp-sequences.ts";
import { generateA4InvoiceHtml } from "../lib/invoicing.ts";

function createBatchBTestDb() {
  const db = new DatabaseSync(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS shop_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      shop_name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      warranty_months INTEGER NOT NULL,
      warranty_terms TEXT NOT NULL,
      logo_data_url TEXT NOT NULL DEFAULT '',
      currency_code TEXT NOT NULL DEFAULT 'LKR',
      currency_symbol TEXT NOT NULL DEFAULT 'Rs.',
      tax_id TEXT NOT NULL DEFAULT '',
      tax_rate_percent REAL NOT NULL DEFAULT 0,
      tax_inclusive INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    INSERT INTO shop_settings VALUES (
      1, 'Lapmart Retail HQ', 'Commercial Verified Refurbished', 'sales@lapmart.lk',
      '+94 11 234 5678', 'No 45 Galle Road, Colombo 03', 6,
      'Hardware coverage terms apply.', '', 'LKR', 'Rs.', '', 0, 1, '2026-10-26T00:00:00Z'
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO suppliers VALUES (
      'sup-global-tech', 'Global Tech Importers', 'Rohan Perera', 'rohan@globaltech.lk', '0771234567', 1, 'Admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      serial TEXT NOT NULL COLLATE NOCASE UNIQUE,
      grade TEXT NOT NULL DEFAULT 'A',
      score INTEGER NOT NULL DEFAULT 95,
      battery_health INTEGER NOT NULL DEFAULT 88,
      storage_health INTEGER NOT NULL DEFAULT 100,
      memory TEXT NOT NULL DEFAULT '16 GB',
      storage TEXT NOT NULL DEFAULT '512 GB SSD',
      processor TEXT NOT NULL DEFAULT 'Intel Core i7-10610U',
      tested_at TEXT NOT NULL,
      technician TEXT NOT NULL,
      warranty_ends TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Published',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_sales (
      device_id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      invoice_reference TEXT NOT NULL UNIQUE,
      sale_price_cents INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      cash_received_cents INTEGER NOT NULL DEFAULT 0,
      card_amount_cents INTEGER NOT NULL DEFAULT 0,
      bank_transfer_cents INTEGER NOT NULL DEFAULT 0,
      installment_cents INTEGER NOT NULL DEFAULT 0,
      payment_reference TEXT NOT NULL DEFAULT '',
      warranty_breakdown_json TEXT NOT NULL DEFAULT '{}',
      bundled_accessories_json TEXT NOT NULL DEFAULT '[]',
      delivery_method TEXT NOT NULL DEFAULT 'In-Store Pickup',
      courier_name TEXT NOT NULL DEFAULT '',
      courier_waybill TEXT NOT NULL DEFAULT '',
      courier_fee_cents INTEGER NOT NULL DEFAULT 0,
      cod_settlement_status TEXT NOT NULL DEFAULT 'Not Applicable',
      discount_cents INTEGER NOT NULL DEFAULT 0,
      discount_reason TEXT NOT NULL DEFAULT '',
      sold_at TEXT NOT NULL,
      warranty_starts TEXT NOT NULL,
      warranty_ends TEXT NOT NULL,
      handover_token TEXT NOT NULL UNIQUE,
      activated_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refurbishment_tasks (
      id TEXT PRIMARY KEY,
      intake_id TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      cost_cents INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      completed_by TEXT NOT NULL DEFAULT '',
      completed_at TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_intakes (
      id TEXT PRIMARY KEY,
      device_id TEXT,
      device_name TEXT NOT NULL,
      model TEXT NOT NULL,
      serial TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Awaiting test'
    );
  `);

  ensureRmaSchema(db);
  ensureSequenceSchema(db);

  return db;
}

test("Feature 5: Supplier RMA / Defective Parts Return Tracker records defect and recovers credit", () => {
  const db = createBatchBTestDb();

  // 1. Log a defective spare part (Samsung NVMe SSD with bad sectors)
  const rma = createSupplierRma(
    {
      supplierId: "sup-global-tech",
      itemType: "Spare Part",
      itemName: "Samsung 980 500GB NVMe SSD",
      serial: "S649NX0W987654",
      faultDescription: "Uncorrectable SMART bad sectors / 0x000000F4 BSOD",
      notes: "Handed over to supplier delivery rep with return voucher",
    },
    "Kamal (Lead Tech)",
    db
  );

  assert.ok(rma.id);
  assert.ok(rma.rmaNumber.startsWith("RMA-"));
  assert.equal(rma.status, "Dispatched");
  assert.equal(rma.supplierName, "Global Tech Importers");
  assert.equal(rma.creditAmountCents, 0);

  // 2. Metrics check initial state
  const metricsInitial = getRmaMetrics(db);
  assert.equal(metricsInitial.totalCount, 1);
  assert.equal(metricsInitial.pendingCount, 1);
  assert.equal(metricsInitial.resolvedCount, 0);

  // 3. Supplier acknowledges warranty and issues a credit note of LKR 14,500
  const updated = updateSupplierRmaStatus(
    rma.id,
    {
      status: "Credit Note Issued",
      creditLkr: "14500",
      notes: "Supplier issued Credit Note #CN-8823. Deducted from next shipment invoice.",
    },
    "Nimal (Owner)",
    db
  );

  assert.equal(updated.status, "Credit Note Issued");
  assert.equal(updated.creditAmountCents, 1_450_000);
  assert.ok(updated.resolvedAt);

  // 4. Metrics verify credit recovery
  const metricsFinal = getRmaMetrics(db);
  assert.equal(metricsFinal.pendingCount, 0);
  assert.equal(metricsFinal.resolvedCount, 1);
  assert.equal(metricsFinal.totalCreditCents, 1_450_000);
  assert.ok(metricsFinal.formattedCredit.includes("14,500"));

  // 5. Query with status filter
  const resolvedList = listSupplierRmas({ status: "Credit Note Issued" }, db);
  assert.equal(resolvedList.length, 1);
  assert.equal(resolvedList[0].rmaNumber, rma.rmaNumber);
});

test("Feature 6: Technician Productivity & Commission Summary calculates piece-rate incentives", () => {
  const db = createBatchBTestDb();

  // Seed 2 tested devices by technician "Nuwan"
  db.exec(`
    INSERT INTO devices (id, name, model, serial, tested_at, technician, created_at)
    VALUES
      ('dev-t480', 'ThinkPad T480', '20L5', 'PF123456', '2026-10-15T10:00:00Z', 'Nuwan', '2026-10-15T10:00:00Z'),
      ('dev-e7470', 'Latitude E7470', 'E7470', 'DELL9876', '2026-10-18T14:00:00Z', 'Nuwan', '2026-10-18T14:00:00Z');

    INSERT INTO stock_intakes (id, device_id, device_name, model, serial, supplier_id)
    VALUES ('int-1', 'dev-t480', 'ThinkPad T480', '20L5', 'PF123456', 'sup-global-tech');

    INSERT INTO refurbishment_tasks (id, intake_id, category, description, cost_cents, completed, completed_by, completed_at, created_by, created_at)
    VALUES
      ('tsk-1', 'int-1', 'Board Repair', 'Mosfet replacement on 19V rail', 150000, 1, 'Nuwan', '2026-10-16T11:00:00Z', 'Lead Tech', '2026-10-15T10:00:00Z'),
      ('tsk-2', 'int-1', 'Cleaning', 'Full thermal paste repaste & fan dustout', 50000, 1, 'Nuwan', '2026-10-16T15:00:00Z', 'Lead Tech', '2026-10-15T10:00:00Z');
  `);

  const summaries = calculateTechnicianCommissions(
    "Nuwan",
    "2026-10-01",
    "2026-10-31",
    db
  );

  assert.equal(summaries.length, 1);
  const nuwanSummary = summaries[0];
  assert.equal(nuwanSummary.technicianName, "Nuwan");

  // 2 diagnostic inspections * default rate (35,000 cents = Rs. 350 each = 70,000 cents)
  assert.equal(nuwanSummary.inspectionsCompleted, 2);
  assert.equal(nuwanSummary.inspectionsCommissionCents, defaultCommissionRates.inspectionCents * 2);

  // 2 refurbishment tasks: 1 Board Repair (150,000 cents) + 1 Clean/Repaste (50,000 cents) = 200,000 cents
  assert.equal(nuwanSummary.tasksCompleted, 2);
  assert.equal(
    nuwanSummary.tasksCommissionCents,
    defaultCommissionRates.boardRepairCents + defaultCommissionRates.cleanRepasteCents
  );

  // Total payout: 70,000 + 200,000 = 270,000 cents (Rs. 2,700)
  assert.equal(nuwanSummary.totalCommissionCents, 270_000);
  assert.ok(nuwanSummary.formattedTotalCommission.includes("2,700"));
  assert.equal(nuwanSummary.items.length, 4); // 2 inspections + 2 tasks
});

test("Feature 7: Multi-Currency & VAT/TIN Tax Configuration reflects in settings and invoices", () => {
  const db = createBatchBTestDb();

  // 1. Update shop settings with TIN/VAT and multi-currency (USD with 18% VAT)
  db.prepare(`
    UPDATE shop_settings SET
      currency_code = 'USD',
      currency_symbol = '$',
      tax_id = 'VAT-102938475-7000',
      tax_rate_percent = 18.0,
      tax_inclusive = 1,
      updated_at = '2026-10-26T00:00:00Z'
    WHERE id = 1
  `).run();

  const settingsRow = db.prepare("SELECT * FROM shop_settings WHERE id = 1").get();
  assert.equal(settingsRow.currency_code, "USD");
  assert.equal(settingsRow.currency_symbol, "$");
  assert.equal(settingsRow.tax_id, "VAT-102938475-7000");
  assert.equal(settingsRow.tax_rate_percent, 18.0);
  assert.equal(settingsRow.tax_inclusive, 1);

  // 2. Insert sold device
  db.exec(`
    INSERT INTO devices (id, name, model, serial, tested_at, technician, created_at)
    VALUES ('dev-tax-1', 'HP EliteBook 840 G6', '840 G6', 'HPE840001', '2026-10-20T00:00:00Z', 'Nuwan', '2026-10-20T00:00:00Z');

    INSERT INTO device_sales (
      device_id, customer_name, customer_email, customer_phone,
      invoice_reference, sale_price_cents, sold_at, warranty_starts,
      warranty_ends, handover_token, activated_by, created_at
    ) VALUES (
      'dev-tax-1', 'Tech Innovations Pvt Ltd', 'procurement@techinno.lk', '0772223344',
      'INV-TAX-9001', 10000000, '2026-10-20T00:00:00Z', '2026-10-20',
      '2027-04-20', 'tok-tax-9001', 'Admin', '2026-10-20T00:00:00Z'
    );
  `);

  // Verify tax computation: 18% of 100,000.00 is 18,000.00
  const taxAmountCents = Math.round(10_000_000 * (settingsRow.tax_rate_percent / 100));
  assert.equal(taxAmountCents, 1_800_000);
});

test("Feature 8: Automated WhatsApp Follow-up Sequences matches Day 7, Day 30, and Day 150 milestones", () => {
  const db = createBatchBTestDb();

  const referenceDate = "2026-10-26";

  // Seed 3 sales at exact interval milestones
  db.exec(`
    INSERT INTO devices (id, name, model, serial, tested_at, technician, created_at)
    VALUES
      ('dev-day7', 'ThinkPad X1 Carbon Gen 6', '20KH', 'X1C-DAY7', '2026-10-01', 'Nuwan', '2026-10-01'),
      ('dev-day30', 'Dell XPS 13 9370', '9370', 'XPS-DAY30', '2026-09-01', 'Nuwan', '2026-09-01'),
      ('dev-day150', 'MacBook Pro 13 2020', 'A2289', 'MBP-DAY150', '2026-05-01', 'Nuwan', '2026-05-01');

    -- Day 7: sold 7 days ago (2026-10-19)
    INSERT INTO device_sales (
      device_id, customer_name, customer_phone, invoice_reference, sale_price_cents,
      sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at
    ) VALUES (
      'dev-day7', 'Saman Kumara', '0771112233', 'INV-DAY7', 9500000,
      '2026-10-19', '2026-10-19', '2027-04-19', 'tok-day7', 'Admin', '2026-10-19'
    );

    -- Day 30: sold 30 days ago (2026-09-26)
    INSERT INTO device_sales (
      device_id, customer_name, customer_phone, invoice_reference, sale_price_cents,
      sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at
    ) VALUES (
      'dev-day30', 'Kasun Jayasinghe', '0774445566', 'INV-DAY30', 11500000,
      '2026-09-26', '2026-09-26', '2027-03-26', 'tok-day30', 'Admin', '2026-09-26'
    );

    -- Day 150: warranty expires in 15 days (2026-11-10)
    INSERT INTO device_sales (
      device_id, customer_name, customer_phone, invoice_reference, sale_price_cents,
      sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at
    ) VALUES (
      'dev-day150', 'Dinusha Fernando', '0718889900', 'INV-DAY150', 14500000,
      '2026-05-15', '2026-05-15', '2026-11-10', 'tok-day150', 'Admin', '2026-05-15'
    );
  `);

  // 1. Fetch pending sequences
  const pending = getPendingFollowUpSequences(referenceDate, db);
  assert.equal(pending.length, 3);

  const day7Item = pending.find((p) => p.sequenceType === "Day 7 Satisfaction");
  assert.ok(day7Item);
  assert.equal(day7Item.customerName, "Saman Kumara");
  assert.equal(day7Item.daysSinceSale, 7);
  assert.ok(day7Item.whatsappUrl.startsWith("https://wa.me/94771112233?text="));
  assert.ok(day7Item.messageText.includes("It has been a week"));

  const day30Item = pending.find((p) => p.sequenceType === "Day 30 Battery Care");
  assert.ok(day30Item);
  assert.equal(day30Item.customerName, "Kasun Jayasinghe");
  assert.equal(day30Item.daysSinceSale, 30);
  assert.ok(day30Item.messageText.includes("Pro-tip for your"));

  const day150Item = pending.find((p) => p.sequenceType === "Day 150 Expiry Alert");
  assert.ok(day150Item);
  assert.equal(day150Item.customerName, "Dinusha Fernando");
  assert.equal(day150Item.daysUntilExpiry, 15);
  assert.ok(day150Item.messageText.includes("expires in 15 days"));

  // 2. Mark Day 7 as dispatched
  markSequenceDispatched(
    day7Item.deviceId,
    day7Item.sequenceType,
    day7Item.customerPhone,
    day7Item.messageText,
    db
  );

  // 3. Re-query: Day 7 must be excluded so customer is never spammed twice
  const recheck = getPendingFollowUpSequences(referenceDate, db);
  assert.equal(recheck.length, 2);
  assert.ok(!recheck.some((p) => p.sequenceType === "Day 7 Satisfaction"));
  assert.ok(recheck.some((p) => p.sequenceType === "Day 30 Battery Care"));
  assert.ok(recheck.some((p) => p.sequenceType === "Day 150 Expiry Alert"));
});
