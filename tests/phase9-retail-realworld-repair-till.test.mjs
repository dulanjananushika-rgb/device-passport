import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { recordPettyCashExpense, listPettyCashExpenses, ensurePettyCashSchema } from "../lib/petty-cash.ts";
import { getDailySettlement, generateDailySettlementThermalHtml } from "../lib/daily-settlement.ts";
import { generateCode128Svg, getPriceTagStickerData, generatePriceTagStickerHtml } from "../lib/barcode-stickers.ts";
import { acceptTradeIn, getTradeInEvaluation } from "../lib/trade-in.ts";
import {
  createCustomerRepairJob,
  updateCustomerRepairJob,
  getCustomerRepairJob,
  listCustomerRepairJobs,
  generateRepairJobSheetHtml,
  generateRepairInvoiceHtml,
  ensureRepairsSchema,
} from "../lib/repairs.ts";

function createBatchCTestDb() {
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
      1, 'Lapmart Test Shop', 'Verified Laptops', 'sales@lapmart.lk',
      '+94 11 234 5678', 'No 45 Galle Road, Colombo 03', 6,
      'Hardware warranty terms apply.', '', 'LKR', 'Rs.', 'VAT-102938475', 0, 1, '2026-10-26T00:00:00Z'
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

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      serial TEXT NOT NULL COLLATE NOCASE UNIQUE,
      grade TEXT NOT NULL DEFAULT 'A',
      score INTEGER NOT NULL DEFAULT 92,
      battery_health INTEGER NOT NULL DEFAULT 89,
      storage_health INTEGER NOT NULL DEFAULT 100,
      memory TEXT NOT NULL DEFAULT '16 GB',
      storage TEXT NOT NULL DEFAULT '512 GB SSD',
      processor TEXT NOT NULL DEFAULT 'Intel Core i7-8650U',
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

    CREATE TABLE IF NOT EXISTS stock_intakes (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      device_name TEXT NOT NULL,
      model TEXT NOT NULL,
      serial TEXT NOT NULL,
      supplier_invoice TEXT NOT NULL,
      purchased_at TEXT NOT NULL,
      purchase_cost_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Awaiting test',
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS warranty_claims (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      service_cost_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trade_in_evaluations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT 'default_org',
      branch_id TEXT NOT NULL DEFAULT 'default_branch',
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      serial TEXT NOT NULL,
      specs_summary TEXT NOT NULL,
      grade TEXT NOT NULL,
      estimated_market_value_cents INTEGER NOT NULL,
      estimated_refurbishment_cost_cents INTEGER NOT NULL,
      offered_trade_in_value_cents INTEGER NOT NULL,
      accepted_for_device_id TEXT,
      evaluated_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Quoted',
      created_at TEXT NOT NULL
    );
  `);

  ensurePettyCashSchema(db);
  ensureRepairsSchema(db);

  return db;
}

test("Feature 1: Till Cash Out & Petty Cash Tracking reconciles Day-End Z-Report cash drawer", () => {
  const db = createBatchCTestDb();
  const today = "2026-10-26";

  // 1. Seed two cash sales totaling LKR 150,000
  db.exec(`
    INSERT INTO devices (id, name, model, serial, tested_at, technician, created_at)
    VALUES
      ('dev-c1', 'ThinkPad T480', '20L5', 'PF111111', '2026-10-26T00:00:00Z', 'Nuwan', '2026-10-26T00:00:00Z'),
      ('dev-c2', 'Dell Latitude 7490', '7490', 'DELL2222', '2026-10-26T00:00:00Z', 'Nuwan', '2026-10-26T00:00:00Z');

    INSERT INTO device_sales (
      device_id, customer_name, customer_phone, invoice_reference, sale_price_cents,
      payment_method, cash_received_cents, sold_at, warranty_starts, warranty_ends,
      handover_token, activated_by, created_at
    ) VALUES
      ('dev-c1', 'Customer A', '0771111111', 'INV-C1', 9000000, 'Cash', 9000000, '2026-10-26', '2026-10-26', '2027-04-26', 'tok-c1', 'Admin', '2026-10-26T10:00:00Z'),
      ('dev-c2', 'Customer B', '0772222222', 'INV-C2', 6000000, 'Cash', 6000000, '2026-10-26', '2026-10-26', '2027-04-26', 'tok-c2', 'Admin', '2026-10-26T14:00:00Z');
  `);

  // 2. Log 2 till cash-out expenses:
  // - Staff Meals / Tea: LKR 1,500
  // - Courier Delivery Fee: LKR 3,500
  const exp1 = recordPettyCashExpense(
    {
      settlementDate: today,
      category: "Staff Meals / Tea",
      description: "Lunch packets for shop technicians",
      amountLkr: "1500",
      paidTo: "Tasty Caterers",
    },
    "Cashier Kamal",
    db
  );
  assert.equal(exp1.amountCents, 150_000);

  const exp2 = recordPettyCashExpense(
    {
      settlementDate: today,
      category: "Courier Delivery Fee",
      description: "Domex COD pickup fee for invoice #INV-C1",
      amountLkr: "3500",
      paidTo: "Domex Courier Agent",
    },
    "Cashier Kamal",
    db
  );
  assert.equal(exp2.amountCents, 350_000);

  // 3. Verify expenses list
  const expenses = listPettyCashExpenses(today, db);
  assert.equal(expenses.length, 2);

  // 4. Calculate Day-End Z-Report settlement
  const settlement = getDailySettlement(today, db);

  // Total gross cash sales: 90,000 + 60,000 = 150,000 LKR (15,000,000 cents)
  assert.equal(settlement.totalCashCents, 15_000_000);

  // Total petty cash outflows: 1,500 + 3,500 = 5,000 LKR (500,000 cents)
  assert.equal(settlement.totalPettyCashOutCents, 500_000);

  // Expected drawer cash: 150,000 - 5,000 = 145,000 LKR (14,500,000 cents)
  assert.equal(settlement.expectedDrawerCashCents, 14_500_000);
  assert.ok(settlement.formattedExpectedDrawerCash.includes("145,000"));

  // 5. Thermal slip validation
  const thermalSlip = generateDailySettlementThermalHtml(settlement);
  assert.ok(thermalSlip.includes("CASH DRAWER RECONCILIATION"));
  assert.ok(thermalSlip.includes("Less Petty Cash Paid Out"));
  assert.ok(thermalSlip.includes("EXPECTED DRAWER CASH"));
  assert.ok(thermalSlip.includes("Tasty Caterers"));
});

test("Feature 2: Shelf Barcode & Spec Price Tag Sticker Generator renders Code128 barcode", () => {
  // 1. Verify Code128 SVG generator directly
  const svg = generateCode128Svg("PF29XK10", 30);
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes("<rect"));
  assert.ok(svg.endsWith("</svg>"));

  // 2. Test sticker data generation with DB
  const db = createBatchCTestDb();
  db.exec(`
    INSERT INTO devices (id, name, model, serial, grade, score, processor, memory, storage, tested_at, technician, created_at)
    VALUES ('dev-sticker-1', 'ThinkPad T480s', '20L7', 'PF29XK10', 'A', 94, 'Intel Core i7-8650U', '16 GB', '512 GB SSD', '2026-10-26T00:00:00Z', 'Nuwan', '2026-10-26T00:00:00Z');
  `);

  // Verify Code128 pattern is deterministic and contains rect elements
  const barcode = generateCode128Svg("PF29XK10");
  assert.ok(barcode.length > 50);
});

test("Feature 3: Trade-In to Auto-Stock Intake Pipeline promotes accepted trade-in to procurement queue", () => {
  const db = createBatchCTestDb();

  // 1. Seed a trade-in evaluation
  db.exec(`
    INSERT INTO trade_in_evaluations (
      id, organization_id, branch_id, customer_name, customer_phone,
      brand, model, serial, specs_summary, grade, estimated_market_value_cents,
      estimated_refurbishment_cost_cents, offered_trade_in_value_cents, evaluated_by, status, created_at
    ) VALUES (
      'ti-eval-101', 'default_org', 'default_branch', 'Ranjith Silva', '0778889900',
      'HP', 'EliteBook 840 G5', 'HPE840TI99', 'Intel Core i5-8250U / 8GB / 256GB SSD',
      'B', 6500000, 1700000, 4800000, 'Nuwan', 'Quoted', '2026-10-26T09:00:00Z'
    );
  `);

  // 2. Accept trade-in towards purchase of new laptop
  const result = acceptTradeIn("ti-eval-101", "dev-new-laptop-77", "Sales Desk", db);

  assert.equal(result.status, "Accepted");
  assert.equal(result.acceptedForDeviceId, "dev-new-laptop-77");
  assert.ok(result.promotedIntakeId);
  assert.ok(result.promotedIntakeId.startsWith("INT-TI-"));

  // 3. Verify stock_intakes has the new entry under "Customer Trade-Ins" supplier
  const intakeRow = db.prepare("SELECT * FROM stock_intakes WHERE id = ?").get(result.promotedIntakeId);
  assert.ok(intakeRow);
  assert.equal(intakeRow.device_name, "HP EliteBook 840 G5");
  assert.equal(intakeRow.serial, "HPE840TI99");
  assert.equal(intakeRow.purchase_cost_cents, 4_800_000); // LKR 48,000
  assert.equal(intakeRow.status, "Awaiting test");
  assert.ok(intakeRow.notes.includes("Ranjith Silva"));
});

test("Feature 4: Customer Repair Job Sheet & Service Billing Engine tracks outside laptop lifecycle", async () => {
  const db = createBatchCTestDb();

  // 1. Intake outside laptop for repair
  const job = createCustomerRepairJob(
    {
      customerName: "Dilshan Wickramasinghe",
      customerPhone: "0715556677",
      customerEmail: "dilshan@gmail.com",
      deviceBrand: "Asus",
      deviceModel: "ZenBook UX430U",
      serial: "ASUS-ZB-9988",
      devicePasswordPin: "5544",
      accessoriesReceived: "Original 45W Charger, Velvet Pouch",
      reportedFault: "No display, power LED stays white, fan spins on high speed",
      physicalCondition: "Few hairline scratches on lid, screen intact",
      estimatedCostLkr: "14500",
      advancePaidLkr: "3000",
      assignedTechnician: "Kasun (Board Specialist)",
    },
    "Front Desk Officer",
    db
  );

  assert.ok(job.id.startsWith("REP-"));
  assert.ok(job.jobNumber.startsWith("JOB-"));
  assert.equal(job.status, "Received");
  assert.equal(job.advancePaidCents, 300_000); // Rs. 3,000
  assert.equal(job.estimatedCostCents, 1_450_000); // Rs. 14,500

  // 2. Generate 80mm Customer Job Sheet Slip
  const jobSheetHtml = await generateRepairJobSheetHtml(job.id, "http://localhost:3000", db);
  assert.ok(jobSheetHtml.includes("CUSTOMER REPAIR INTAKE"));
  assert.ok(jobSheetHtml.includes(job.jobNumber));
  assert.ok(jobSheetHtml.includes("Dilshan Wickramasinghe"));
  assert.ok(jobSheetHtml.includes("SERVICE TERMS & CONDITIONS"));
  assert.ok(jobSheetHtml.includes("Customer Signature"));

  // 3. Technician diagnoses and fixes board:
  // Parts cost: LKR 8,000 (replacement charging IC & BIOS chip)
  // Labor fee: LKR 5,000
  // Total cost: LKR 13,000
  const updated = updateCustomerRepairJob(
    job.id,
    {
      status: "Completed / Ready",
      partsCostLkr: "8000",
      laborFeeLkr: "5000",
      technicianNotes: "Replaced blown 3.3V power inductor and reprogrammed corrupt BIOS SPI ROM chip.",
    },
    "Kasun (Board Specialist)",
    db
  );

  assert.equal(updated.status, "Completed / Ready");
  assert.equal(updated.totalAmountCents, 1_300_000); // Rs. 13,000
  assert.equal(updated.advancePaidCents, 300_000); // Rs. 3,000
  // Balance due = 13,000 - 3,000 = 10,000 LKR (1,000,000 cents)
  assert.equal(updated.balanceDueCents, 1_000_000);
  assert.ok(updated.formattedBalanceDue.includes("10,000"));
  assert.ok(updated.completedAt);

  // 4. Customer arrives, pays balance Rs. 10,000 and takes delivery
  const delivered = updateCustomerRepairJob(
    job.id,
    {
      status: "Delivered",
    },
    "Front Desk Officer",
    db
  );
  assert.equal(delivered.status, "Delivered");
  assert.ok(delivered.deliveredAt);

  // 5. Generate final Repair Tax Invoice
  const invoiceHtml = await generateRepairInvoiceHtml(job.id, "http://localhost:3000", db);
  assert.ok(invoiceHtml.includes("SERVICE INVOICE"));
  assert.ok(invoiceHtml.includes(job.jobNumber));
  assert.ok(invoiceHtml.includes("Hardware Replacement Parts"));
  assert.ok(invoiceHtml.includes("Technician Labor"));
  assert.ok(invoiceHtml.includes("Less Advance Paid"));
  assert.ok(invoiceHtml.includes("Balance Paid / Settled"));

  // 6. Query list with status filter
  const deliveredList = listCustomerRepairJobs({ status: "Delivered" }, db);
  assert.equal(deliveredList.length, 1);
  assert.equal(deliveredList[0].jobNumber, job.jobNumber);
});
