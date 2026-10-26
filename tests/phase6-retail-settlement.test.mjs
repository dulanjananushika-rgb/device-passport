import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { bulkImportStockIntakes } from "../lib/bulk-intake.ts";
import { listAvailableUpgrades, applySaleCustomization } from "../lib/pos-customization.ts";
import { getDailySettlement, generateDailySettlementThermalHtml } from "../lib/daily-settlement.ts";

function createInMemoryTestDb() {
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
      updated_at TEXT NOT NULL
    );
    INSERT INTO shop_settings VALUES (1, 'Lapmart Test Shop', 'Enterprise Laptops', 'sales@lapmart.lk', '+94 11 234 5678', 'Colombo, Sri Lanka', 12, '1-Year Warranty Terms', '', '2026-10-26T00:00:00Z');

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      contact_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      serial TEXT NOT NULL COLLATE NOCASE UNIQUE,
      grade TEXT NOT NULL DEFAULT 'A',
      score INTEGER NOT NULL DEFAULT 90,
      battery_health INTEGER NOT NULL DEFAULT 85,
      storage_health INTEGER NOT NULL DEFAULT 100,
      memory TEXT NOT NULL DEFAULT '8 GB',
      storage TEXT NOT NULL DEFAULT '256 GB',
      processor TEXT NOT NULL DEFAULT 'Intel Core i5',
      tested_at TEXT NOT NULL,
      technician TEXT NOT NULL,
      warranty_ends TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Draft',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_intakes (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      device_id TEXT UNIQUE,
      device_name TEXT NOT NULL,
      model TEXT NOT NULL,
      serial TEXT NOT NULL COLLATE NOCASE UNIQUE,
      supplier_invoice TEXT NOT NULL,
      purchased_at TEXT NOT NULL,
      purchase_cost_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Awaiting test',
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_finance (
      device_id TEXT PRIMARY KEY,
      purchase_cost_cents INTEGER NOT NULL DEFAULT 0,
      refurbishment_cost_cents INTEGER NOT NULL DEFAULT 0,
      parts_cost_cents INTEGER NOT NULL DEFAULT 0,
      repair_cost_cents INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
      sold_at TEXT NOT NULL,
      warranty_starts TEXT NOT NULL,
      warranty_ends TEXT NOT NULL,
      handover_token TEXT NOT NULL UNIQUE,
      activated_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spare_parts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT 'default_org',
      branch_id TEXT NOT NULL DEFAULT 'default_branch',
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      specifications TEXT NOT NULL DEFAULT '',
      unit_cost_cents INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0,
      min_alert_quantity INTEGER NOT NULL DEFAULT 2,
      supplier_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_part_allocations (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      intake_id TEXT NOT NULL,
      spare_part_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_cost_cents INTEGER NOT NULL DEFAULT 0,
      total_cost_cents INTEGER NOT NULL DEFAULT 0,
      allocated_by TEXT NOT NULL,
      allocated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS warranty_claims (
      id TEXT PRIMARY KEY,
      tracking_token TEXT NOT NULL UNIQUE,
      device_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'New',
      priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '',
      warranty_valid INTEGER NOT NULL DEFAULT 1,
      service_cost_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

test("Bulk Stock CSV / Excel Import Engine parses, validates and ingests wholesale shipments", () => {
  const db = createInMemoryTestDb();

  const csv = `Model,Serial,CostLkr,Processor,RAM,Storage,Grade,SupplierName,SupplierInvoice
Dell Latitude 7490,DEL7490-001,85000,Intel Core i5-8350U,8GB DDR4,256GB SSD,A,Tokyo Global Exports,TK-2026-99
Lenovo ThinkPad T480,TP480-002,92000,Intel Core i5-8250U,16GB DDR4,512GB SSD,A,Dubai Wholesale IT,DXB-771
HP EliteBook 840 G5,HP840-003,89000,Intel Core i7-8550U,16GB DDR4,256GB SSD,B,Tokyo Global Exports,TK-2026-99`;

  const result = bulkImportStockIntakes(csv, "default_supplier", "CONTAINER-BATCH", "Admin", db);

  assert.equal(result.success, true);
  assert.equal(result.totalRows, 3);
  assert.equal(result.importedCount, 3);
  assert.equal(result.errors.length, 0);

  // Check database rows
  const intakes = db.prepare("SELECT * FROM stock_intakes").all();
  assert.equal(intakes.length, 3);

  const devices = db.prepare("SELECT * FROM devices").all();
  assert.equal(devices.length, 3);

  // Check supplier auto-creation
  const suppliers = db.prepare("SELECT * FROM suppliers").all();
  assert.equal(suppliers.length >= 2, true);

  // Check duplicate rejection within batch and against existing DB
  const duplicateCsv = `Model,Serial,CostLkr
Dell Latitude 7490,DEL7490-001,85000
Dell Latitude 7490,DEL-NEW-999,85000
Dell Latitude 7490,DEL-NEW-999,85000`;

  const dupResult = bulkImportStockIntakes(duplicateCsv, "default_supplier", "CONTAINER-BATCH", "Admin", db);
  assert.equal(dupResult.importedCount, 1); // Only DEL-NEW-999 the first time
  assert.equal(dupResult.skippedCount, 2); // 1 DB duplicate, 1 batch duplicate
});

test("POS Hardware Upgrades deducts inventory and reflects in device finance", () => {
  const db = createInMemoryTestDb();
  const now = new Date().toISOString();

  // Seed a device and a spare part
  db.prepare(`
    INSERT INTO devices (id, name, model, serial, tested_at, technician, created_at)
    VALUES ('DEV-UPGRADE-1', 'Lenovo ThinkPad T480', 'T480', 'SN-UP-001', '2026-10-26', 'Tech', ?)
  `).run(now);

  db.prepare(`
    INSERT INTO spare_parts (id, sku, name, category, specifications, unit_cost_cents, quantity, created_at, updated_at)
    VALUES ('PART-RAM-16GB', 'RAM-DDR4-16G', 'Samsung 16GB DDR4 RAM', 'RAM', 'DDR4 3200MHz', 1250000, 5, ?, ?)
  `).run(now, now);

  const available = listAvailableUpgrades(); // default db
  assert.ok(Array.isArray(available));

  // Apply upgrade using in-memory DB
  const upgradeResult = applySaleCustomization("DEV-UPGRADE-1", ["PART-RAM-16GB"], "Cashier", db);
  assert.equal(upgradeResult.appliedParts.length, 1);
  assert.equal(upgradeResult.totalPartsCostCents, 1250000); // 12,500 LKR in cents

  // Verify stock decremented
  const updatedPart = db.prepare("SELECT quantity FROM spare_parts WHERE id = 'PART-RAM-16GB'").get();
  assert.equal(updatedPart.quantity, 4);

  // Verify device finance was recorded
  const finance = db.prepare("SELECT * FROM device_finance WHERE device_id = 'DEV-UPGRADE-1'").get();
  assert.equal(finance.parts_cost_cents, 1250000);
  assert.equal(finance.refurbishment_cost_cents, 1250000);

  // Verify task part allocation was recorded
  const allocation = db.prepare("SELECT * FROM task_part_allocations WHERE spare_part_id = 'PART-RAM-16GB'").get();
  assert.ok(allocation);
  assert.equal(allocation.quantity, 1);
});

test("Day-End Z-Report accurately computes tender breakdown, cash reconciliation & net profit", () => {
  const db = createInMemoryTestDb();
  const today = "2026-10-26";
  const now = `${today}T14:30:00Z`;

  // Seed 3 sales on the same date: 1 Cash, 1 Card, 1 Split (Cash + Card)
  // Laptop 1: Cash sale
  db.prepare(`
    INSERT INTO devices (id, name, model, serial, tested_at, technician, created_at)
    VALUES ('DEV-S1', 'Dell Latitude 7490', '7490', 'SN-S1', '2026-10-26', 'Tech', ?)
  `).run(now);
  db.prepare(`
    INSERT INTO device_finance (device_id, purchase_cost_cents, refurbishment_cost_cents, parts_cost_cents, updated_by, updated_at)
    VALUES ('DEV-S1', 7000000, 500000, 500000, 'Admin', ?)
  `).run(now);
  db.prepare(`
    INSERT INTO device_sales (
      device_id, customer_name, customer_email, customer_phone, invoice_reference, sale_price_cents,
      payment_method, cash_received_cents, card_amount_cents, bank_transfer_cents, installment_cents, payment_reference,
      sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at
    ) VALUES (
      'DEV-S1', 'Sunil Perera', 'sunil@gmail.com', '0771234567', 'INV-2026-001', 9500000,
      'Cash', 9500000, 0, 0, 0, '',
      ?, ?, '2027-10-26', 'TOKEN-S1', 'Cashier', ?
    )
  `).run(today, today, now);

  // Laptop 2: Card sale
  db.prepare(`
    INSERT INTO devices (id, name, model, serial, tested_at, technician, created_at)
    VALUES ('DEV-S2', 'ThinkPad T480', 'T480', 'SN-S2', '2026-10-26', 'Tech', ?)
  `).run(now);
  db.prepare(`
    INSERT INTO device_finance (device_id, purchase_cost_cents, refurbishment_cost_cents, parts_cost_cents, updated_by, updated_at)
    VALUES ('DEV-S2', 8500000, 0, 0, 'Admin', ?)
  `).run(now);
  db.prepare(`
    INSERT INTO device_sales (
      device_id, customer_name, customer_email, customer_phone, invoice_reference, sale_price_cents,
      payment_method, cash_received_cents, card_amount_cents, bank_transfer_cents, installment_cents, payment_reference,
      sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at
    ) VALUES (
      'DEV-S2', 'Kamal Silva', 'kamal@gmail.com', '0719876543', 'INV-2026-002', 11500000,
      'Card', 0, 11500000, 0, 0, 'APPR-99881',
      ?, ?, '2027-10-26', 'TOKEN-S2', 'Cashier', ?
    )
  `).run(today, today, now);

  // Laptop 3: Split payment (50,000 Cash + 70,000 Bank Transfer = 120,000 total)
  db.prepare(`
    INSERT INTO devices (id, name, model, serial, tested_at, technician, created_at)
    VALUES ('DEV-S3', 'HP EliteBook 840 G5', '840G5', 'SN-S3', '2026-10-26', 'Tech', ?)
  `).run(now);
  db.prepare(`
    INSERT INTO device_finance (device_id, purchase_cost_cents, refurbishment_cost_cents, parts_cost_cents, updated_by, updated_at)
    VALUES ('DEV-S3', 9000000, 1000000, 1000000, 'Admin', ?)
  `).run(now);
  db.prepare(`
    INSERT INTO device_sales (
      device_id, customer_name, customer_email, customer_phone, invoice_reference, sale_price_cents,
      payment_method, cash_received_cents, card_amount_cents, bank_transfer_cents, installment_cents, payment_reference,
      sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at
    ) VALUES (
      'DEV-S3', 'Nimal Jayawardena', 'nimal@yahoo.com', '0755554444', 'INV-2026-003', 12000000,
      'Split', 5000000, 0, 7000000, 0, 'TX-BOC-5511',
      ?, ?, '2027-10-26', 'TOKEN-S3', 'Cashier', ?
    )
  `).run(today, today, now);

  // Seed 1 warranty claim resolved today with service cost
  db.prepare(`
    INSERT INTO warranty_claims (
      id, tracking_token, device_id, customer_name, category, description, status, service_cost_cents, created_at, updated_at
    ) VALUES (
      'CLM-TODAY-01', 'TOKEN-CLM-1', 'DEV-S1', 'Sunil Perera', 'Display', 'Backlight test', 'Resolved', 200000, ?, ?
    )
  `).run(now, now);

  // Run Settlement Calculation
  const settlement = getDailySettlement(today, db);

  assert.equal(settlement.totalUnitsSold, 3);
  // Total Revenue: 95,000 + 115,000 + 120,000 = 330,000 LKR (33,000,000 cents)
  assert.equal(settlement.totalGrossRevenueCents, 33000000);

  // Tenders:
  // Cash: 95,000 + 50,000 = 145,000 LKR (14,500,000 cents)
  assert.equal(settlement.totalCashCents, 14500000);
  // Card: 115,000 LKR (11,500,000 cents)
  assert.equal(settlement.totalCardCents, 11500000);
  // Bank: 70,000 LKR (7,000,000 cents)
  assert.equal(settlement.totalBankTransferCents, 7000000);

  // Inventory Cost: 70k + 85k + 90k = 245,000 LKR (24,500,000 cents)
  assert.equal(settlement.totalCostOfGoodsSoldCents, 24500000);
  // Parts Cost: 5k + 0 + 10k = 15,000 LKR (1,500,000 cents)
  assert.equal(settlement.totalRefurbPartsCostCents, 1500000);

  // Net Profit: 330,000 - 245,000 - 15,000 = 70,000 LKR (7,000,000 cents)
  assert.equal(settlement.netRealizedProfitCents, 7000000);

  // Warranty claims summary
  assert.equal(settlement.claimsSummary.openedCount, 1);
  assert.equal(settlement.claimsSummary.resolvedCount, 1);
  assert.equal(settlement.claimsSummary.serviceCostCents, 200000);

  // Generate 80mm ESC/POS Thermal Receipt HTML
  const thermalHtml = generateDailySettlementThermalHtml(settlement);
  assert.ok(thermalHtml.includes("DAY-END Z-REPORT"));
  assert.ok(thermalHtml.includes("CASH DRAWER RECONCILIATION"));
  assert.ok(thermalHtml.includes("INV-2026-001"));
  assert.ok(thermalHtml.includes("INV-2026-002"));
  assert.ok(thermalHtml.includes("INV-2026-003"));
  assert.ok(thermalHtml.includes("Cashier Signature"));
  assert.ok(thermalHtml.includes("Manager Signature"));
});
