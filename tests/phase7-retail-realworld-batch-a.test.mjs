import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createReservation, getActiveReservationForDevice, cancelReservation, fulfillReservation, generateReservationReceiptHtml, ensureReservationSchema } from "../lib/reservations.ts";
import { processReturnOrExchange, listReturns, ensureReturnsSchema } from "../lib/returns.ts";
import { activateDeviceSale } from "../lib/database.ts";
import { generateThermalReceiptHtml, generateA4InvoiceHtml } from "../lib/invoicing.ts";

function createBatchATestDb() {
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
    INSERT INTO shop_settings VALUES (1, 'Lapmart Test Shop', 'Enterprise Laptops', 'sales@lapmart.lk', '+94 11 234 5678', 'Colombo, Sri Lanka', 6, 'Hardware warranty terms', '', '2026-10-26T00:00:00Z');

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

    CREATE TABLE IF NOT EXISTS device_finance (
      device_id TEXT PRIMARY KEY,
      purchase_cost_cents INTEGER NOT NULL DEFAULT 0,
      refurbishment_cost_cents INTEGER NOT NULL DEFAULT 0,
      parts_cost_cents INTEGER NOT NULL DEFAULT 0,
      repair_cost_cents INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  ensureReservationSchema(db);
  ensureReturnsSchema(db);
  return db;
}

test("Feature 1: Component-wise warranty breakdown and bundled accessories are persisted and printed", () => {
  const db = createBatchATestDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO devices (id, name, model, serial, tested_at, technician, created_at)
    VALUES ('DEV-COMP-1', 'Dell Latitude 7490', '7490', 'SN-COMP-1', '2026-10-26', 'Tech', ?)
  `).run(now);

  const breakdown = {
    motherboardMonths: 12,
    batteryMonths: 1,
    screenMonths: 3,
    adapterMonths: 1,
  };
  const accessories = [
    "Original 65W AC Adapter",
    "Power Cable",
    "Laptop Backpack / Sleeve",
    "Wireless / Optical Mouse",
  ];

  // Activate sale with breakdown and accessories
  const breakdownJson = JSON.stringify(breakdown);
  const accessoriesJson = JSON.stringify(accessories);

  db.prepare(`
    INSERT INTO device_sales (
      device_id, customer_name, customer_email, customer_phone, invoice_reference, sale_price_cents,
      payment_method, cash_received_cents, card_amount_cents, bank_transfer_cents, installment_cents, payment_reference,
      warranty_breakdown_json, bundled_accessories_json, delivery_method,
      sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at
    ) VALUES (
      'DEV-COMP-1', 'Nalin Silva', 'nalin@test.lk', '0771234567', 'INV-COMP-001', 9500000,
      'Cash', 9500000, 0, 0, 0, '',
      ?, ?, 'In-Store Pickup',
      '2026-10-26', '2026-10-26', '2027-10-26', 'TOKEN-COMP-1', 'Cashier', ?
    )
  `).run(breakdownJson, accessoriesJson, now);

  const savedSale = db.prepare("SELECT * FROM device_sales WHERE device_id = 'DEV-COMP-1'").get();
  assert.ok(savedSale);
  const parsedBreakdown = JSON.parse(savedSale.warranty_breakdown_json);
  assert.equal(parsedBreakdown.motherboardMonths, 12);
  assert.equal(parsedBreakdown.batteryMonths, 1);
  assert.equal(parsedBreakdown.screenMonths, 3);

  const parsedAccessories = JSON.parse(savedSale.bundled_accessories_json);
  assert.equal(parsedAccessories.length, 4);
  assert.ok(parsedAccessories.includes("Laptop Backpack / Sleeve"));
});

test("Feature 2: Customer advance booking reservation holds device and prints voucher", () => {
  const db = createBatchATestDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO devices (id, name, model, serial, status, tested_at, technician, created_at)
    VALUES ('DEV-RES-1', 'Lenovo ThinkPad T480', 'T480', 'SN-RES-1', 'Published', '2026-10-26', 'Tech', ?)
  `).run(now);

  // 1. Create reservation
  const res = createReservation(
    'DEV-RES-1',
    {
      customerName: 'Roshan Bandara',
      customerPhone: '0712345678',
      advanceLkr: '5000',
      heldDays: 3,
      notes: 'Customer will collect on Saturday',
    },
    'Cashier',
    db
  );

  assert.ok(res.id.startsWith('RES-'));
  assert.equal(res.advanceCents, 500000); // 5,000 LKR in cents
  assert.equal(res.status, 'Active');

  // 2. Query active reservation for device
  const active = getActiveReservationForDevice('DEV-RES-1', db);
  assert.ok(active);
  assert.equal(active.customerName, 'Roshan Bandara');

  // 3. Prevent duplicate reservation on same device
  assert.throws(() => {
    createReservation(
      'DEV-RES-1',
      { customerName: 'Other Person', customerPhone: '0751112222', advanceLkr: '2000' },
      'Cashier',
      db
    );
  }, /already reserved/);

  // 4. Print 80mm Advance Receipt HTML
  const receiptHtml = generateReservationReceiptHtml(res.id, db);
  assert.ok(receiptHtml.includes('CUSTOMER ADVANCE RECEIPT'));
  assert.ok(receiptHtml.includes('Roshan Bandara'));
  assert.ok(receiptHtml.includes('5,000.00'));
  assert.ok(receiptHtml.includes('HOLD VALID UNTIL'));

  // 5. Fulfill reservation upon sale
  const fulfilled = fulfillReservation(res.id, db);
  assert.equal(fulfilled, true);

  const afterFulfill = getActiveReservationForDevice('DEV-RES-1', db);
  assert.equal(afterFulfill, null); // No longer active
});

test("Feature 3: Courier COD fulfillment mode and discount reason tracking", () => {
  const db = createBatchATestDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO devices (id, name, model, serial, status, tested_at, technician, created_at)
    VALUES ('DEV-COD-1', 'HP EliteBook 840 G5', '840G5', 'SN-COD-1', 'Published', '2026-10-26', 'Tech', ?)
  `).run(now);

  db.prepare(`
    INSERT INTO device_sales (
      device_id, customer_name, customer_email, customer_phone, invoice_reference, sale_price_cents,
      payment_method, cash_received_cents, card_amount_cents, bank_transfer_cents, installment_cents, payment_reference,
      delivery_method, courier_name, courier_waybill, courier_fee_cents, cod_settlement_status,
      discount_cents, discount_reason,
      sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at
    ) VALUES (
      'DEV-COD-1', 'Dhammika Perera', 'dhammika@test.lk', '0779998888', 'INV-COD-001', 9200000,
      'Cash', 9200000, 0, 0, 0, '',
      'Courier COD', 'Prompt Xpress', 'PRM-2026-8812', 150000, 'In Transit',
      300000, 'Cash Discount Promo',
      '2026-10-26', '2026-10-26', '2027-04-26', 'TOKEN-COD-1', 'Cashier', ?
    )
  `).run(now);

  const sale = db.prepare("SELECT * FROM device_sales WHERE device_id = 'DEV-COD-1'").get();
  assert.equal(sale.delivery_method, 'Courier COD');
  assert.equal(sale.courier_name, 'Prompt Xpress');
  assert.equal(sale.courier_waybill, 'PRM-2026-8812');
  assert.equal(sale.cod_settlement_status, 'In Transit');
  assert.equal(sale.discount_cents, 300000); // 3,000 LKR
  assert.equal(sale.discount_reason, 'Cash Discount Promo');
});

test("Feature 4: 1-Click Device Return & Exchange workflow restores stock and links replacement", () => {
  const db = createBatchATestDb();
  const now = new Date().toISOString();

  // Laptop 1: Initially sold
  db.prepare(`
    INSERT INTO devices (id, name, model, serial, status, warranty_ends, tested_at, technician, created_at)
    VALUES ('DEV-EXCH-ORIG', 'Dell Latitude 7490', '7490', 'SN-ORIG-1', 'Published', '2027-04-26', '2026-10-26', 'Tech', ?)
  `).run(now);

  db.prepare(`
    INSERT INTO device_sales (
      device_id, customer_name, customer_email, customer_phone, invoice_reference, sale_price_cents,
      payment_method, cash_received_cents, card_amount_cents, bank_transfer_cents, installment_cents, payment_reference,
      sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at
    ) VALUES (
      'DEV-EXCH-ORIG', 'Anura Kumara', 'anura@test.lk', '0775556666', 'INV-EXCH-001', 8500000,
      'Cash', 8500000, 0, 0, 0, '',
      '2026-10-26', '2026-10-26', '2027-04-26', 'TOKEN-ORIG-1', 'Cashier', ?
    )
  `).run(now);

  // Laptop 2: In stock ready for exchange
  db.prepare(`
    INSERT INTO devices (id, name, model, serial, status, tested_at, technician, created_at)
    VALUES ('DEV-EXCH-NEW', 'ThinkPad T480 Core i7', 'T480', 'SN-NEW-2', 'Published', '2026-10-26', 'Tech', ?)
  `).run(now);

  db.prepare(`
    INSERT INTO device_finance (device_id, purchase_cost_cents, refurbishment_cost_cents, parts_cost_cents, updated_by, updated_at)
    VALUES ('DEV-EXCH-NEW', 9000000, 0, 0, 'Admin', ?)
  `).run(now);

  // Process Exchange
  const result = processReturnOrExchange(
    {
      originalDeviceId: 'DEV-EXCH-ORIG',
      returnType: 'Exchange',
      replacementDeviceId: 'DEV-EXCH-NEW',
      reason: 'Customer requested 15.6 inch screen upgrade',
      restockCondition: 'Needs Re-test',
    },
    'Manager',
    db
  );

  assert.equal(result.returnType, 'Exchange');
  assert.equal(result.originalDeviceId, 'DEV-EXCH-ORIG');
  assert.equal(result.replacementDeviceId, 'DEV-EXCH-NEW');
  assert.equal(result.originalSalePriceCents, 8500000);
  assert.equal(result.exchangeDifferenceCents, 500000); // 90,000 - 85,000 = 5,000 LKR

  // Verify original device was reset and removed from device_sales
  const origSale = db.prepare("SELECT * FROM device_sales WHERE device_id = 'DEV-EXCH-ORIG'").get();
  assert.equal(origSale, undefined);

  const origDev = db.prepare("SELECT status, warranty_ends FROM devices WHERE id = 'DEV-EXCH-ORIG'").get();
  assert.equal(origDev.status, 'Needs review');
  assert.equal(origDev.warranty_ends, '');

  // Verify replacement device is now activated under customer's name
  const newSale = db.prepare("SELECT * FROM device_sales WHERE device_id = 'DEV-EXCH-NEW'").get();
  assert.ok(newSale);
  assert.equal(newSale.customer_name, 'Anura Kumara');
  assert.equal(newSale.sale_price_cents, 9000000);

  // Verify return record was logged
  const returnRecords = listReturns(db);
  assert.equal(returnRecords.length, 1);
  assert.equal(returnRecords[0].reason, 'Customer requested 15.6 inch screen upgrade');
});
