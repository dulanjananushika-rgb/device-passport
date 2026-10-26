import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../lib/database.ts";
import {
  createSparePart,
  getSparePart,
  listSpareParts,
  adjustSparePartStock,
  allocatePartToTask,
  listTaskPartAllocations,
} from "../lib/spare-parts.ts";
import { calculateDeviceLedger, calculateShopLedgerSummary } from "../lib/profit-ledger.ts";
import {
  createStockTransfer,
  receiveStockTransfer,
  getStockTransfer,
  listStockTransfers,
} from "../lib/branch-transfers.ts";

test.before(() => {
  // Ensure database tables are initialized
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO suppliers (id, name, contact_name, email, phone, active, created_by, created_at, updated_at)
    VALUES ('sup_test', 'Global Laptop Wholesale Ltd', 'David Smith', 'david@example.com', '+94770001122', 1, 'admin', ?, ?)
  `).run(now, now);
});

// -------------------------------------------------------------
// Test 1: Spare Parts Creation, Low-Stock Filter & Validation
// -------------------------------------------------------------
test("Spare parts can be created, updated, and queried with low-stock alerts", () => {
  const ramSku = `RAM-${randomUUID().slice(0, 6).toUpperCase()}`;
  const part = createSparePart(
    {
      sku: ramSku,
      name: "Samsung 8GB DDR4 3200MHz SODIMM",
      category: "RAM",
      specifications: "DDR4-3200 PC4-25600 Non-ECC",
      unitCostCents: 450000, // 4,500 LKR
      quantity: 5,
      minAlertQuantity: 2,
    },
    "owner@lapmart.lk"
  );

  assert.ok(part.id.startsWith("part_"));
  assert.equal(part.sku, ramSku);
  assert.equal(part.quantity, 5);
  assert.equal(part.unitCostCents, 450000);

  // Stock Adjustment (+3)
  const adjusted = adjustSparePartStock(part.id, 3, "New wholesale intake", "owner@lapmart.lk");
  assert.equal(adjusted.quantity, 8);

  // Stock Adjustment (-7) -> quantity is 1 (below minAlertQuantity 2)
  const lowStock = adjustSparePartStock(part.id, -7, "Workshop repairs", "technician@lapmart.lk");
  assert.equal(lowStock.quantity, 1);

  // Check low stock query
  const alertParts = listSpareParts({ lowStockOnly: true });
  const found = alertParts.find((p) => p.sku === ramSku);
  assert.ok(found, "Part with quantity 1 must be flagged in lowStockOnly query");

  // Prevent negative stock
  assert.throws(() => {
    adjustSparePartStock(part.id, -5, "Illegal decrement", "technician@lapmart.lk");
  }, /Insufficient stock/);
});

// -------------------------------------------------------------
// Test 2: Refurbishment Task Parts Allocation & Cost Auto-Update
// -------------------------------------------------------------
test("allocatePartToTask decrements inventory and increments task cost", () => {
  const db = getDatabase();
  const intakeId = `intake_${randomUUID().slice(0, 8)}`;
  const taskId = `task_${randomUUID().slice(0, 8)}`;
  const testSerial = `TEST-SR-${randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  // Create mock intake and task
  db.prepare(`
    INSERT INTO stock_intakes (
      id, organization_id, branch_id, supplier_id, device_name, model, serial,
      supplier_invoice, purchased_at, purchase_cost_cents, status, created_by, created_at, updated_at
    ) VALUES (?, 'default_org', 'default_branch', 'sup_test', 'Lenovo ThinkPad T480', 'ThinkPad T480', ?, 'INV-001', ?, 4500000, 'In refurbishment', 'owner@lapmart.lk', ?, ?)
  `).run(intakeId, testSerial, now, now, now);

  db.prepare(`
    INSERT INTO refurbishment_tasks (
      id, intake_id, category, description, cost_cents, completed, created_by, completed_by, created_at, completed_at, updated_at
    ) VALUES (?, ?, 'Hardware upgrade', 'Upgrade SSD to NVMe', 50000, 0, 'technician@lapmart.lk', '', ?, '', ?)
  `).run(taskId, intakeId, now, now);

  // Create SSD spare part with 3 in stock
  const ssdSku = `SSD-${randomUUID().slice(0, 6).toUpperCase()}`;
  const ssdPart = createSparePart(
    {
      sku: ssdSku,
      name: "Kingston 512GB NVMe PCIe M.2 SSD",
      category: "Storage",
      unitCostCents: 750000, // 7,500 LKR
      quantity: 3,
    },
    "owner@lapmart.lk"
  );

  // Allocate 1x SSD
  const allocation = allocatePartToTask(taskId, intakeId, ssdPart.id, 1, "technician@lapmart.lk");
  assert.equal(allocation.quantity, 1);
  assert.equal(allocation.totalCostCents, 750000);

  // Check inventory decremented from 3 to 2
  const updatedPart = getSparePart(ssdPart.id);
  assert.equal(updatedPart?.quantity, 2);

  // Check task cost increased by 750,000 (initial 50,000 + 750,000 = 800,000)
  const taskRow = db.prepare("SELECT cost_cents FROM refurbishment_tasks WHERE id = ?").get(taskId);
  assert.equal(taskRow.cost_cents, 800000);

  // Check allocation history
  const history = listTaskPartAllocations(intakeId);
  assert.equal(history.length, 1);
  assert.equal(history[0].partSku, ssdSku);

  // Prevent allocating more than remaining stock (available 2, requesting 5)
  assert.throws(() => {
    allocatePartToTask(taskId, intakeId, ssdPart.id, 5, "technician@lapmart.lk");
  }, /Insufficient stock/);
});

// -------------------------------------------------------------
// Test 3: True Realized Net Profit (P&L) Ledger Precision
// -------------------------------------------------------------
test("calculateDeviceLedger computes exact realized net profit and margins", () => {
  const db = getDatabase();
  const testSerial = `PNL-${randomUUID().slice(0, 8).toUpperCase()}`;
  const intakeId = `intake_pnl_${randomUUID().slice(0, 6)}`;
  const deviceId = `dev_pnl_${randomUUID().slice(0, 6)}`;
  const taskId = `task_pnl_${randomUUID().slice(0, 6)}`;
  const now = new Date().toISOString();

  // 1. Intake: 50,000 LKR (5,000,000 cents)
  db.prepare(`
    INSERT INTO stock_intakes (
      id, organization_id, branch_id, supplier_id, device_name, model, serial,
      supplier_invoice, purchased_at, purchase_cost_cents, status, created_by, created_at, updated_at
    ) VALUES (?, 'default_org', 'default_branch', 'sup_test', 'Dell Latitude 7490', 'Latitude 7490', ?, 'INV-99', ?, 5000000, 'Sold', 'owner@lapmart.lk', ?, ?)
  `).run(intakeId, testSerial, now, now, now);

  // 2. Device
  db.prepare(`
    INSERT INTO devices (
      id, organization_id, branch_id, name, model, serial, grade, score,
      battery_health, storage_health, memory, storage, processor, tested_at,
      technician, warranty_ends, status, created_at
    ) VALUES (?, 'default_org', 'default_branch', 'Dell Latitude 7490', 'Latitude 7490', ?, 'A', 95, 92, 100, '16GB', '512GB', 'Core i7', ?, 'Tech', '2027-10-26', 'Sold', ?)
  `).run(deviceId, testSerial, now, now);

  // 3. Task with Allocated Battery: 10,000 LKR (1,000,000 cents)
  db.prepare(`
    INSERT INTO refurbishment_tasks (
      id, intake_id, category, description, cost_cents, completed, created_by, completed_by, created_at, completed_at, updated_at
    ) VALUES (?, ?, 'Battery Replacement', 'Replaced degraded battery', 1000000, 1, 'Tech', 'Tech', ?, ?, ?)
  `).run(taskId, intakeId, now, now, now);

  const battPart = createSparePart(
    {
      sku: `BAT-${randomUUID().slice(0, 5).toUpperCase()}`,
      name: "Dell 60Wh Replacement Battery",
      category: "Battery",
      unitCostCents: 1000000,
      quantity: 5,
    },
    "owner@lapmart.lk"
  );
  allocatePartToTask(taskId, intakeId, battPart.id, 1, "Tech");

  // 4. Warranty Claim: 2,500 LKR (250,000 cents)
  db.prepare(`
    INSERT INTO warranty_claims (
      id, tracking_token, device_id, customer_name, customer_email, customer_phone,
      category, description, status, service_cost_cents, warranty_valid, created_at, updated_at
    ) VALUES (?, ?, ?, 'Amal Perera', 'amal@example.com', '+94771234567', 'Keyboard', 'Key stuck', 'Resolved', 250000, 1, ?, ?)
  `).run(`claim_${randomUUID().slice(0, 6)}`, `trk_${randomUUID().slice(0, 8)}`, deviceId, now, now);

  // 5. Sale Price: 80,000 LKR (8,000,000 cents)
  db.prepare(`
    INSERT INTO device_sales (
      device_id, customer_name, customer_email, customer_phone, invoice_reference,
      sale_price_cents, sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at
    ) VALUES (?, 'Amal Perera', 'amal@example.com', '+94771234567', ?, 8000000, ?, ?, '2027-10-26', ?, 'Owner', ?)
  `).run(deviceId, `INV-${randomUUID().slice(0, 6)}`, now, now, `token_${randomUUID().slice(0, 8)}`, now);

  // 6. Calculate P&L Ledger
  const ledger = calculateDeviceLedger(testSerial);
  assert.ok(ledger, "Ledger must be generated");
  assert.equal(ledger.purchaseCostCents, 5000000);
  assert.equal(ledger.partsCostCents, 1000000);
  assert.equal(ledger.warrantyCostCents, 250000);

  // Total Invested = 5,000,000 + 1,000,000 + 250,000 = 6,250,000 cents (62,500 LKR)
  assert.equal(ledger.totalInvestedCostCents, 6250000);
  assert.equal(ledger.salePriceCents, 8000000);

  // Realized Net Profit = 8,000,000 - 6,250,000 = 1,750,000 cents (17,500 LKR)
  assert.equal(ledger.realizedProfitCents, 1750000);

  // Margin % = (1,750,000 / 8,000,000) * 100 = 21.88%
  assert.equal(ledger.marginPercent, 21.88);
});

// -------------------------------------------------------------
// Test 4: Multi-Branch Stock Transfers (Dispatched -> Received)
// -------------------------------------------------------------
test("createStockTransfer and receiveStockTransfer shift branch inventory cleanly", () => {
  const db = getDatabase();
  const testSerial = `TRF-DEV-${randomUUID().slice(0, 6).toUpperCase()}`;
  const now = new Date().toISOString();

  // Create second branch: Kandy Showroom
  db.prepare(`
    INSERT OR IGNORE INTO branches (id, organization_id, name, code, is_warehouse, address, phone, created_at)
    VALUES ('branch_kandy', 'default_org', 'Kandy Showroom', 'KDY-01', 0, 'Dalada Veediya, Kandy', '+94 81 222 3344', ?)
  `).run(now);

  // Create device at default_branch (HQ)
  db.prepare(`
    INSERT INTO stock_intakes (
      id, organization_id, branch_id, supplier_id, device_name, model, serial,
      supplier_invoice, purchased_at, purchase_cost_cents, status, created_by, created_at, updated_at
    ) VALUES (?, 'default_org', 'default_branch', 'sup_test', 'HP EliteBook 840 G5', '840 G5', ?, 'INV-55', ?, 4200000, 'Ready', 'owner', ?, ?)
  `).run(`intake_trf_${randomUUID().slice(0, 6)}`, testSerial, now, now, now);

  db.prepare(`
    INSERT INTO devices (
      id, organization_id, branch_id, name, model, serial, grade, score,
      battery_health, storage_health, memory, storage, processor, tested_at,
      technician, warranty_ends, status, created_at
    ) VALUES (?, 'default_org', 'default_branch', 'HP EliteBook 840 G5', '840 G5', ?, 'A', 90, 88, 100, '8GB', '256GB', 'i5', ?, 'Tech', '2027-10-26', 'Ready', ?)
  `).run(`dev_trf_${randomUUID().slice(0, 6)}`, testSerial, now, now);

  // Dispatch Transfer: HQ -> Kandy
  const transfer = createStockTransfer(
    {
      fromBranchId: "default_branch",
      toBranchId: "branch_kandy",
      entityType: "device",
      entityId: testSerial,
      notes: "Showroom stock replenishment",
    },
    "owner@lapmart.lk"
  );

  assert.ok(transfer.trackingNumber.startsWith("TRF-"));
  assert.equal(transfer.status, "Dispatched");
  assert.equal(transfer.fromBranchId, "default_branch");
  assert.equal(transfer.toBranchId, "branch_kandy");

  // Receive Transfer at Kandy
  const received = receiveStockTransfer(transfer.id, "kandy_manager@lapmart.lk");
  assert.equal(received.status, "Received");
  assert.equal(received.receivedBy, "kandy_manager@lapmart.lk");

  // Verify device branch is now Kandy
  const updatedDevice = db.prepare("SELECT branch_id FROM devices WHERE serial = ?").get(testSerial);
  assert.equal(updatedDevice.branch_id, "branch_kandy");

  const updatedIntake = db.prepare("SELECT branch_id FROM stock_intakes WHERE serial = ?").get(testSerial);
  assert.equal(updatedIntake.branch_id, "branch_kandy");
});
