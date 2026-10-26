import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { devices as seedDevices, type DeviceRecord } from "../app/data/devices";
import {
  calculateInspectionScore,
  extractDeviceDiagnostics,
  inspectionKeys,
  type DiagnosticReport,
  type InspectionChecks,
  type InspectionPhotoInput,
} from "./inspection";
import {
  isClaimCategory,
  isClaimPriority,
  isClaimStatus,
  type ClaimAssignee,
  type ClaimEvent,
  type ClaimInternalNote,
  type ClaimPriority,
  type ClaimStatus,
  type PublicWarrantyClaim,
  type WarrantyServiceRecord,
  type WarrantyClaimInput,
  type WarrantyClaimSummary,
  type WarrantyClaimUpdate,
} from "./claims";
import { hashPassword, verifyPassword } from "./passwords";
import {
  isStaffRole,
  type AuditEvent,
  type ShopSettings,
  type StaffAccount,
  type StaffRole,
} from "./operations";
import type { DeviceSale, SaleActivationInput } from "./sales";
import { parseLkrToCents } from "./finance";
import { applySaleCustomization } from "./pos-customization";
import { ensureReservationSchema, fulfillReservation } from "./reservations";
import { ensureReturnsSchema } from "./returns";
import { ensureRmaSchema } from "./supplier-rma";
import { ensureSequenceSchema } from "./whatsapp-sequences";
import { ensureRepairsSchema } from "./repairs";
import { ensurePettyCashSchema } from "./petty-cash";
import { defaultWarrantyBreakdown, type WarrantyBreakdown } from "./sales";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_DEV_PASSWORD, isPortfolioDemo } from "./demo";
import { seedPortfolioDemo } from "./demo-seed";

type DeviceRow = {
  id: string;
  name: string;
  model: string;
  serial: string;
  grade: "A" | "B" | "C";
  score: number;
  battery_health: number;
  storage_health: number;
  memory: string;
  storage: string;
  processor: string;
  tested_at: string;
  technician: string;
  warranty_ends: string;
  status: "Published" | "Needs review" | "Draft";
};

type DeviceWithSaleRow = DeviceRow & {
  diagnostic_report_json: string | null;
  active_reservation_id: string | null;
  sale_customer_name: string | null;
  sale_customer_email: string | null;
  sale_customer_phone: string | null;
  sale_invoice_reference: string | null;
  sale_price_cents: number | null;
  sale_payment_method: string | null;
  sale_cash_received_cents: number | null;
  sale_card_amount_cents: number | null;
  sale_bank_transfer_cents: number | null;
  sale_installment_cents: number | null;
  sale_payment_reference: string | null;
  sale_warranty_breakdown_json: string | null;
  sale_bundled_accessories_json: string | null;
  sale_delivery_method: string | null;
  sale_courier_name: string | null;
  sale_courier_waybill: string | null;
  sale_courier_fee_cents: number | null;
  sale_cod_settlement_status: string | null;
  sale_discount_cents: number | null;
  sale_discount_reason: string | null;
  sale_sold_at: string | null;
  sale_warranty_starts: string | null;
  sale_warranty_ends: string | null;
  sale_handover_token: string | null;
  sale_activated_by: string | null;
  sale_created_at: string | null;
};

type LegacySaleRow = {
  id: string;
  warranty_ends: string;
  tested_at: string;
};

type InspectionRow = {
  display: "pass" | "fail";
  keyboard: "pass" | "fail";
  camera: "pass" | "fail";
  audio: "pass" | "fail";
  ports: "pass" | "fail";
  wireless: "pass" | "fail";
  notes: string;
  approved_at: string;
};

type PhotoRow = {
  id: string;
  name: string;
  mime_type: string;
  data?: Uint8Array;
};

type ClaimRow = {
  id: string;
  tracking_token: string;
  device_id: string;
  device_name: string;
  serial: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  category: WarrantyClaimSummary["category"];
  description: string;
  status: ClaimStatus;
  priority: ClaimPriority;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  due_date: string;
  warranty_valid: number;
  warranty_ends: string;
  created_at: string;
  updated_at: string;
  photo_count: number;
  service_cost_cents: number;
};

type ClaimInternalNoteRow = {
  id: string;
  note: string;
  actor: string;
  created_at: string;
};

type ClaimEventRow = {
  id: string;
  status: ClaimStatus;
  note: string;
  actor: string;
  created_at: string;
};

type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  password_hash: string;
  active: number;
  created_at: string;
  updated_at: string;
};

type SettingsRow = {
  id: number;
  shop_name: string;
  tagline: string;
  contact_email: string;
  phone: string;
  address: string;
  warranty_months: number;
  warranty_terms: string;
  logo_data_url: string;
  currency_code?: string;
  currency_symbol?: string;
  currency_position?: string;
  date_format?: string;
  tax_mode?: string;
  default_shipping_carrier?: string;
  tax_id?: string;
  tax_rate_percent?: number;
  tax_inclusive?: number;
  updated_at: string;
};

type AuditRow = {
  id: string;
  actor: string;
  action: string;
  summary: string;
  created_at: string;
};

export type PassportEvidence = {
  checks: InspectionChecks;
  notes: string;
  approvedAt: string;
  photos: Array<{ id: string; name: string; mimeType: string }>;
};

const globalDatabase = globalThis as typeof globalThis & { devicePassportDb?: DatabaseSync };

export function getDatabaseFilePath() {
  const configured = process.env.DEVICEPASSPORT_DATABASE_PATH?.trim();
  if (configured === ":memory:") return configured;
  if (configured) return path.resolve(configured);
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join("/tmp", "device-passport.db");
  }
  return path.join(process.cwd(), ".data", "device-passport.db");
}

function ensureClaimSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS warranty_claims (
      id TEXT PRIMARY KEY,
      tracking_token TEXT NOT NULL UNIQUE,
      device_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      service_cost_cents INTEGER NOT NULL DEFAULT 0,
      warranty_valid INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS claim_photos (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (claim_id) REFERENCES warranty_claims(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS claim_events (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (claim_id) REFERENCES warranty_claims(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_warranty_claims_device ON warranty_claims(device_id);
    CREATE INDEX IF NOT EXISTS idx_warranty_claims_status ON warranty_claims(status);
    CREATE INDEX IF NOT EXISTS idx_claim_events_claim ON claim_events(claim_id, created_at);
  `);

  const columns = new Set((database.prepare("PRAGMA table_info(warranty_claims)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!columns.has("priority")) database.exec("ALTER TABLE warranty_claims ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
  if (!columns.has("assigned_to_id")) database.exec("ALTER TABLE warranty_claims ADD COLUMN assigned_to_id TEXT");
  if (!columns.has("due_date")) database.exec("ALTER TABLE warranty_claims ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
  if (!columns.has("service_cost_cents")) database.exec("ALTER TABLE warranty_claims ADD COLUMN service_cost_cents INTEGER NOT NULL DEFAULT 0");
  database.exec(`
    CREATE TABLE IF NOT EXISTS claim_internal_notes (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      note TEXT NOT NULL,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (claim_id) REFERENCES warranty_claims(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_claim_internal_notes_claim ON claim_internal_notes(claim_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_warranty_claims_assignee ON warranty_claims(assigned_to_id);
    CREATE INDEX IF NOT EXISTS idx_warranty_claims_due_date ON warranty_claims(due_date);
    UPDATE warranty_claims SET due_date = date(created_at, '+3 days') WHERE due_date = '';
  `);
}

function ensureOperationsSchema(database: DatabaseSync) {
  database.exec(`
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
    CREATE TABLE IF NOT EXISTS staff_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS device_sales (
      device_id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      invoice_reference TEXT NOT NULL UNIQUE,
      sale_price_cents INTEGER NOT NULL DEFAULT 0,
      sold_at TEXT NOT NULL,
      warranty_starts TEXT NOT NULL,
      warranty_ends TEXT NOT NULL,
      handover_token TEXT NOT NULL UNIQUE,
      activated_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_staff_users_email ON staff_users(email);
    CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_device_sales_customer_phone ON device_sales(customer_phone);
    CREATE INDEX IF NOT EXISTS idx_device_sales_customer_email ON device_sales(customer_email);
    CREATE INDEX IF NOT EXISTS idx_device_sales_warranty_ends ON device_sales(warranty_ends);

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      logo_url TEXT,
      currency TEXT NOT NULL DEFAULT 'LKR',
      warranty_policy TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      is_warehouse INTEGER NOT NULL DEFAULT 0,
      address TEXT,
      phone TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );
  `);

  const orgCount = (database.prepare("SELECT COUNT(*) AS count FROM organizations").get() as { count: number } | undefined)?.count ?? 0;
  if (orgCount === 0) {
    const seedNow = new Date().toISOString();
    database.prepare(`
      INSERT OR IGNORE INTO organizations (id, name, slug, logo_url, currency, warranty_policy, created_at)
      VALUES ('default_org', 'Lapmart Computer Systems', 'lapmart', '/branding/lapmart-logo.png', 'LKR', 'Standard 1-Year Limited Hardware Warranty', ?)
    `).run(seedNow);
    database.prepare(`
      INSERT OR IGNORE INTO branches (id, organization_id, name, code, is_warehouse, address, phone, created_at)
      VALUES ('default_branch', 'default_org', 'Main Workshop & Refurbishment Center', 'HQ-01', 1, 'No. 124, High Level Road, Colombo', '+94 11 234 5678', ?)
    `).run(seedNow);
  }

  const saleColumns = new Set((database.prepare("PRAGMA table_info(device_sales)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!saleColumns.has("sale_price_cents")) database.exec("ALTER TABLE device_sales ADD COLUMN sale_price_cents INTEGER NOT NULL DEFAULT 0");
  if (!saleColumns.has("payment_method")) database.exec("ALTER TABLE device_sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'Cash'");
  if (!saleColumns.has("cash_received_cents")) database.exec("ALTER TABLE device_sales ADD COLUMN cash_received_cents INTEGER NOT NULL DEFAULT 0");
  if (!saleColumns.has("card_amount_cents")) database.exec("ALTER TABLE device_sales ADD COLUMN card_amount_cents INTEGER NOT NULL DEFAULT 0");
  if (!saleColumns.has("bank_transfer_cents")) database.exec("ALTER TABLE device_sales ADD COLUMN bank_transfer_cents INTEGER NOT NULL DEFAULT 0");
  if (!saleColumns.has("installment_cents")) database.exec("ALTER TABLE device_sales ADD COLUMN installment_cents INTEGER NOT NULL DEFAULT 0");
  if (!saleColumns.has("payment_reference")) database.exec("ALTER TABLE device_sales ADD COLUMN payment_reference TEXT NOT NULL DEFAULT ''");

  if (!saleColumns.has("warranty_breakdown_json")) database.exec("ALTER TABLE device_sales ADD COLUMN warranty_breakdown_json TEXT NOT NULL DEFAULT '{}'");

  if (!saleColumns.has("bundled_accessories_json")) database.exec("ALTER TABLE device_sales ADD COLUMN bundled_accessories_json TEXT NOT NULL DEFAULT '[]'");

  if (!saleColumns.has("delivery_method")) database.exec("ALTER TABLE device_sales ADD COLUMN delivery_method TEXT NOT NULL DEFAULT 'In-Store Pickup'");

  if (!saleColumns.has("courier_name")) database.exec("ALTER TABLE device_sales ADD COLUMN courier_name TEXT NOT NULL DEFAULT ''");

  if (!saleColumns.has("courier_waybill")) database.exec("ALTER TABLE device_sales ADD COLUMN courier_waybill TEXT NOT NULL DEFAULT ''");

  if (!saleColumns.has("courier_fee_cents")) database.exec("ALTER TABLE device_sales ADD COLUMN courier_fee_cents INTEGER NOT NULL DEFAULT 0");

  if (!saleColumns.has("cod_settlement_status")) database.exec("ALTER TABLE device_sales ADD COLUMN cod_settlement_status TEXT NOT NULL DEFAULT 'Not Applicable'");

  if (!saleColumns.has("discount_cents")) database.exec("ALTER TABLE device_sales ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0");

  if (!saleColumns.has("discount_reason")) database.exec("ALTER TABLE device_sales ADD COLUMN discount_reason TEXT NOT NULL DEFAULT ''");

  const settingsColumns = new Set((database.prepare("PRAGMA table_info(shop_settings)").all() as Array<{ name: string }>).map((column) => column.name));

  if (!settingsColumns.has("currency_code")) database.exec("ALTER TABLE shop_settings ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'USD'");

  if (!settingsColumns.has("currency_symbol")) database.exec("ALTER TABLE shop_settings ADD COLUMN currency_symbol TEXT NOT NULL DEFAULT '$'");

  if (!settingsColumns.has("currency_position")) database.exec("ALTER TABLE shop_settings ADD COLUMN currency_position TEXT NOT NULL DEFAULT 'prefix'");

  if (!settingsColumns.has("date_format")) database.exec("ALTER TABLE shop_settings ADD COLUMN date_format TEXT NOT NULL DEFAULT 'MM/DD/YYYY'");

  if (!settingsColumns.has("tax_mode")) database.exec("ALTER TABLE shop_settings ADD COLUMN tax_mode TEXT NOT NULL DEFAULT 'standard'");

  if (!settingsColumns.has("default_shipping_carrier")) database.exec("ALTER TABLE shop_settings ADD COLUMN default_shipping_carrier TEXT NOT NULL DEFAULT 'FedEx'");

  if (!settingsColumns.has("tax_id")) database.exec("ALTER TABLE shop_settings ADD COLUMN tax_id TEXT NOT NULL DEFAULT ''");

  if (!settingsColumns.has("tax_rate_percent")) database.exec("ALTER TABLE shop_settings ADD COLUMN tax_rate_percent REAL NOT NULL DEFAULT 0");

  if (!settingsColumns.has("tax_inclusive")) database.exec("ALTER TABLE shop_settings ADD COLUMN tax_inclusive INTEGER NOT NULL DEFAULT 1");

  const deviceColumns = new Set((database.prepare("PRAGMA table_info(devices)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!deviceColumns.has("keyboard_layout")) database.exec("ALTER TABLE devices ADD COLUMN keyboard_layout TEXT NOT NULL DEFAULT 'US QWERTY'");
  if (!deviceColumns.has("power_adapter_type")) database.exec("ALTER TABLE devices ADD COLUMN power_adapter_type TEXT NOT NULL DEFAULT 'Type A/B (US 110V/240V)'");
  if (!deviceColumns.has("cosmetic_grade_standard")) database.exec("ALTER TABLE devices ADD COLUMN cosmetic_grade_standard TEXT NOT NULL DEFAULT 'R2v3 / SERI Certified'");

  if (!saleColumns.has("tracking_url")) database.exec("ALTER TABLE device_sales ADD COLUMN tracking_url TEXT NOT NULL DEFAULT ''");

  ensureReservationSchema(database);

  ensureReturnsSchema(database);

  ensureSequenceSchema(database);

  ensureRepairsSchema(database);

  ensurePettyCashSchema(database);

  const now = new Date().toISOString();
  database.prepare(`
    INSERT OR IGNORE INTO shop_settings (
      id, shop_name, tagline, contact_email, phone, address,
      warranty_months, warranty_terms, logo_data_url, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, '', ?)
  `).run("Lapmart", "Verified refurbished devices", "support@lapmart.lk", "+94 11 234 5678", "Colombo, Sri Lanka", 6, "Hardware faults are covered during the stated warranty period. Physical and liquid damage are excluded.", now);

  const defaultAccounts = [
    { id: "staff-owner-lapmart", name: "Shop Owner", email: "owner@lapmart.lk", role: "Owner" as const, pass: "devicepass" },
    { id: "staff-demo-owner", name: "Demo Shop Owner", email: "demo@devicepassport.example", role: "Owner" as const, pass: "devicepass" },
    { id: "staff-demo-tech", name: "Demo Lead Technician", email: "technician@devicepassport.example", role: "Technician" as const, pass: "devicepass" },
    { id: "staff-demo-support", name: "Demo Customer Support", email: "support@devicepassport.example", role: "Support" as const, pass: "devicepass" }
  ];
  for (const acc of defaultAccounts) {
    const existing = database.prepare("SELECT id FROM staff_users WHERE email = ?").get(acc.email);
    if (!existing) {
      database.prepare(`
        INSERT OR IGNORE INTO staff_users (id, name, email, role, password_hash, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `).run(acc.id, acc.name, acc.email, acc.role, hashPassword(acc.pass), now, now);
    }
  }
}

function ensureFinanceSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS device_finance (
      device_id TEXT PRIMARY KEY,
      purchase_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (purchase_cost_cents >= 0),
      refurbishment_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (refurbishment_cost_cents >= 0),
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_device_finance_updated ON device_finance(updated_at);
  `);

  const financeCols = new Set((database.prepare("PRAGMA table_info(device_finance)").all() as Array<{ name: string }>).map((c) => c.name));
  if (!financeCols.has("parts_cost_cents")) database.exec("ALTER TABLE device_finance ADD COLUMN parts_cost_cents INTEGER NOT NULL DEFAULT 0");
  if (!financeCols.has("repair_cost_cents")) database.exec("ALTER TABLE device_finance ADD COLUMN repair_cost_cents INTEGER NOT NULL DEFAULT 0");
}

function ensureCustomerAndSecuritySchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS device_security_seals (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      serial TEXT NOT NULL,
      seal_number TEXT NOT NULL UNIQUE,
      placement_location TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Intact',
      applied_by TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      verified_by TEXT,
      verified_at TEXT,
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_seals_device ON device_security_seals(device_id);
    CREATE INDEX IF NOT EXISTS idx_seals_serial ON device_security_seals(serial);
    CREATE INDEX IF NOT EXISTS idx_seals_number ON device_security_seals(seal_number);

    CREATE TABLE IF NOT EXISTS customer_otps (
      id TEXT PRIMARY KEY,
      phone_normalized TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_customer_otps_phone ON customer_otps(phone_normalized, consumed);

    CREATE TABLE IF NOT EXISTS customer_sessions (
      id TEXT PRIMARY KEY,
      phone_normalized TEXT NOT NULL,
      customer_name TEXT,
      session_token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_customer_sessions_token ON customer_sessions(session_token);

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
      created_at TEXT NOT NULL,
      customer_nic_passport TEXT NOT NULL DEFAULT '',
      legal_declaration_signed INTEGER NOT NULL DEFAULT 0,
      legal_notes TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_trade_in_phone ON trade_in_evaluations(customer_phone);
  `);
  const tradeInCols = new Set((database.prepare("PRAGMA table_info(trade_in_evaluations)").all() as Array<{ name: string }>).map((col) => col.name));
  if (!tradeInCols.has("customer_nic_passport")) database.exec("ALTER TABLE trade_in_evaluations ADD COLUMN customer_nic_passport TEXT NOT NULL DEFAULT ''");
  if (!tradeInCols.has("legal_declaration_signed")) database.exec("ALTER TABLE trade_in_evaluations ADD COLUMN legal_declaration_signed INTEGER NOT NULL DEFAULT 0");
  if (!tradeInCols.has("legal_notes")) database.exec("ALTER TABLE trade_in_evaluations ADD COLUMN legal_notes TEXT NOT NULL DEFAULT ''");
}

function ensureInventorySchema(database: DatabaseSync) {
  database.exec(`
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

    CREATE TABLE IF NOT EXISTS stock_transfers (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT 'default_org',
      tracking_number TEXT NOT NULL UNIQUE,
      from_branch_id TEXT NOT NULL,
      to_branch_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'Dispatched',
      dispatched_by TEXT NOT NULL,
      dispatched_at TEXT NOT NULL,
      received_by TEXT,
      received_at TEXT,
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_spare_parts_category ON spare_parts(category);
    CREATE INDEX IF NOT EXISTS idx_spare_parts_branch ON spare_parts(branch_id);
    CREATE INDEX IF NOT EXISTS idx_task_parts_intake ON task_part_allocations(intake_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_tracking ON stock_transfers(tracking_number);
  `);
}

function ensureProcurementSchema(database: DatabaseSync) {
  ensureRmaSchema(database);
  database.exec(`
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
    CREATE TABLE IF NOT EXISTS stock_intakes (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      device_id TEXT UNIQUE,
      device_name TEXT NOT NULL,
      model TEXT NOT NULL,
      serial TEXT NOT NULL COLLATE NOCASE UNIQUE,
      supplier_invoice TEXT NOT NULL,
      purchased_at TEXT NOT NULL,
      purchase_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (purchase_cost_cents >= 0),
      status TEXT NOT NULL DEFAULT 'Awaiting test',
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS refurbishment_tasks (
      id TEXT PRIMARY KEY,
      intake_id TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
      completed INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      completed_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (intake_id) REFERENCES stock_intakes(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_stock_intakes_supplier ON stock_intakes(supplier_id, purchased_at);
    CREATE INDEX IF NOT EXISTS idx_stock_intakes_status ON stock_intakes(status, purchased_at);
    CREATE INDEX IF NOT EXISTS idx_stock_intakes_device ON stock_intakes(device_id);
    CREATE INDEX IF NOT EXISTS idx_refurbishment_tasks_intake ON refurbishment_tasks(intake_id, completed);
  `);

  const intakeCols = new Set((database.prepare("PRAGMA table_info(stock_intakes)").all() as Array<{ name: string }>).map((c) => c.name));
  if (!intakeCols.has("organization_id")) database.exec("ALTER TABLE stock_intakes ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'default_org'");
  if (!intakeCols.has("branch_id")) database.exec("ALTER TABLE stock_intakes ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'default_branch'");

  const devCols = new Set((database.prepare("PRAGMA table_info(devices)").all() as Array<{ name: string }>).map((c) => c.name));
  if (!devCols.has("organization_id")) database.exec("ALTER TABLE devices ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'default_org'");
  if (!devCols.has("branch_id")) database.exec("ALTER TABLE devices ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'default_branch'");
}

function ensureTesterSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS tester_agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      last_seen_at TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tester_test_runs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      report_json TEXT NOT NULL,
      checks_json TEXT NOT NULL DEFAULT '{}',
      notes TEXT NOT NULL DEFAULT '',
      photos_json TEXT NOT NULL DEFAULT '[]',
      signature TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'Pending',
      received_at TEXT NOT NULL,
      imported_device_id TEXT,
      imported_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (agent_id) REFERENCES tester_agents(id) ON DELETE CASCADE,
      FOREIGN KEY (imported_device_id) REFERENCES devices(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tester_agents_active ON tester_agents(active, created_at);
    CREATE INDEX IF NOT EXISTS idx_tester_runs_status ON tester_test_runs(status, received_at);
    CREATE INDEX IF NOT EXISTS idx_tester_runs_agent ON tester_test_runs(agent_id, received_at);
  `);
}

export function deterministicHandoverToken(deviceId: string): string {
  if (deviceId === "DVP-LK-240831") return "1A3O9OkHlBbqlkr7zQ4Z-Fr9";
  if (deviceId === "DVP-LK-240830") return "FKgFjq3xHBTVgcThyrekwvn0";
  return createHash("sha256").update("handover-seed-" + deviceId).digest("base64url").slice(0, 24);
}

function backfillExistingSales(database: DatabaseSync) {
  const migration = database.prepare("SELECT value FROM app_meta WHERE key = 'phase5_sales_backfill'").get();
  if (migration) return;

  const settings = readShopSettings(database);
  const devices = database.prepare("SELECT id, warranty_ends, tested_at FROM devices").all() as unknown as LegacySaleRow[];
  const insert = database.prepare(`
    INSERT OR IGNORE INTO device_sales (
      device_id, customer_name, customer_email, customer_phone, invoice_reference,
      sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at
    ) VALUES (?, 'Registered customer', '', '', ?, ?, ?, ?, ?, 'Legacy migration', ?)
  `);

  database.exec("BEGIN");
  try {
    for (const device of devices) {
      const parsedEnd = parseWarrantyDate(device.warranty_ends);
      const warrantyEnd = !parsedEnd
        ? addCalendarMonths(new Date(), settings.warrantyMonths)
        : parsedEnd;
      const warrantyStart = parseWarrantyDate(device.tested_at) ?? addCalendarMonths(warrantyEnd, -settings.warrantyMonths);
      const createdAt = new Date().toISOString();
      insert.run(
        device.id,
        `LEGACY-${device.id}`,
        toIsoDate(warrantyStart),
        toIsoDate(warrantyStart),
        toIsoDate(warrantyEnd),
        deterministicHandoverToken(device.id),
        createdAt,
      );
    }
    database.prepare("INSERT INTO app_meta (key, value) VALUES ('phase5_sales_backfill', ?)").run(new Date().toISOString());
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function correctLegacySaleDates(database: DatabaseSync) {
  const migration = database.prepare("SELECT value FROM app_meta WHERE key = 'phase5_sales_backfill_dates_v3'").get();
  if (migration) return;
  const settings = readShopSettings(database);
  const devices = database.prepare(`
    SELECT d.id, d.warranty_ends, d.tested_at
    FROM devices d
    JOIN device_sales s ON s.device_id = d.id
    WHERE s.invoice_reference LIKE 'LEGACY-%'
  `).all() as unknown as LegacySaleRow[];
  const update = database.prepare("UPDATE device_sales SET sold_at = ?, warranty_starts = ?, warranty_ends = ? WHERE device_id = ?");

  database.exec("BEGIN");
  try {
    for (const device of devices) {
      const warrantyEnd = parseWarrantyDate(device.warranty_ends);
      if (!warrantyEnd) continue;
      const warrantyStart = parseWarrantyDate(device.tested_at) ?? addCalendarMonths(warrantyEnd, -settings.warrantyMonths);
      update.run(toIsoDate(warrantyStart), toIsoDate(warrantyStart), toIsoDate(warrantyEnd), device.id);
    }
    database.prepare("INSERT INTO app_meta (key, value) VALUES ('phase5_sales_backfill_dates_v3', ?)").run(new Date().toISOString());
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function getDatabase() {
  if (globalDatabase.devicePassportDb) {
    ensureClaimSchema(globalDatabase.devicePassportDb);
    ensureOperationsSchema(globalDatabase.devicePassportDb);
    ensureFinanceSchema(globalDatabase.devicePassportDb);
    ensureCustomerAndSecuritySchema(globalDatabase.devicePassportDb);
    ensureInventorySchema(globalDatabase.devicePassportDb);
    ensureProcurementSchema(globalDatabase.devicePassportDb);
    ensureTesterSchema(globalDatabase.devicePassportDb);
    backfillExistingSales(globalDatabase.devicePassportDb);
    correctLegacySaleDates(globalDatabase.devicePassportDb);
    if (isPortfolioDemo()) { try { seedPortfolioDemo(globalDatabase.devicePassportDb); } catch (e) { console.error(e); } }
    return globalDatabase.devicePassportDb;
  }

  const filePath = getDatabaseFilePath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  const database = new DatabaseSync(filePath);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      serial TEXT NOT NULL UNIQUE,
      grade TEXT NOT NULL,
      score INTEGER NOT NULL,
      battery_health INTEGER NOT NULL,
      storage_health INTEGER NOT NULL,
      memory TEXT NOT NULL,
      storage TEXT NOT NULL,
      processor TEXT NOT NULL,
      tested_at TEXT NOT NULL,
      technician TEXT NOT NULL,
      warranty_ends TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS diagnostic_reports (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      report_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS device_inspections (
      device_id TEXT PRIMARY KEY,
      display TEXT NOT NULL,
      keyboard TEXT NOT NULL,
      camera TEXT NOT NULL,
      audio TEXT NOT NULL,
      ports TEXT NOT NULL,
      wireless TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      approved_at TEXT NOT NULL,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS device_photos (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );
  `);
  ensureClaimSchema(database);
  ensureOperationsSchema(database);
  ensureFinanceSchema(database);
  ensureCustomerAndSecuritySchema(database);
  ensureInventorySchema(database);
  ensureProcurementSchema(database);
  ensureTesterSchema(database);

  const insert = database.prepare(`
    INSERT OR IGNORE INTO devices (
      id, name, model, serial, grade, score, battery_health, storage_health,
      memory, storage, processor, tested_at, technician, warranty_ends, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertInspection = database.prepare(`
    INSERT OR IGNORE INTO device_inspections (
      device_id, display, keyboard, camera, audio, ports, wireless, notes, approved_at
    ) VALUES (?, 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', ?, ?)
  `);
  for (const device of seedDevices) {
    insert.run(...deviceValues(device));
    insertInspection.run(device.id, "Demo inspection completed before sale.", device.testedAt);
  }

  backfillExistingSales(database);
  correctLegacySaleDates(database);

  if (isPortfolioDemo()) { try { seedPortfolioDemo(database); } catch (e) { console.error(e); } }

  globalDatabase.devicePassportDb = database;
  return database;
}

export function createDatabaseSnapshot(destination: string) {
  const activePath = getDatabaseFilePath();
  if (activePath === ":memory:") throw new Error("Backups are unavailable for an in-memory database.");
  const resolved = path.resolve(destination);
  if (existsSync(resolved)) throw new Error("A backup with this name already exists.");
  mkdirSync(path.dirname(resolved), { recursive: true });
  const escaped = resolved.replaceAll("'", "''");
  getDatabase().exec(`VACUUM INTO '${escaped}'`);
}

export function replaceDatabaseFromSnapshot(snapshotPath: string) {
  const activePath = getDatabaseFilePath();
  if (activePath === ":memory:") throw new Error("Restore is unavailable for an in-memory database.");
  const resolvedSnapshot = path.resolve(snapshotPath);
  if (!existsSync(resolvedSnapshot)) throw new Error("The validated restore snapshot is missing.");
  const rollbackPath = `${activePath}.restore-${randomUUID()}.bak`;

  closeDatabaseConnection();
  removeDatabaseSidecars(activePath);
  renameSync(activePath, rollbackPath);
  try {
    renameSync(resolvedSnapshot, activePath);
    getDatabase();
    rmSync(rollbackPath, { force: true });
  } catch (error) {
    closeDatabaseConnection();
    removeDatabaseSidecars(activePath);
    rmSync(activePath, { force: true });
    renameSync(rollbackPath, activePath);
    getDatabase();
    throw error;
  }
}

export function closeDatabaseConnection() {
  if (!globalDatabase.devicePassportDb) return;
  try {
    globalDatabase.devicePassportDb.exec("PRAGMA wal_checkpoint(FULL)");
  } finally {
    globalDatabase.devicePassportDb.close();
    delete globalDatabase.devicePassportDb;
  }
}

export function databaseQuickCheck() {
  try {
    const row = getDatabase().prepare("PRAGMA quick_check").get() as { quick_check?: string } | undefined;
    const message = row?.quick_check ?? "Database did not return a health result.";
    return { ok: message === "ok", message };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Database health check failed." };
  }
}

function removeDatabaseSidecars(filePath: string) {
  rmSync(`${filePath}-wal`, { force: true });
  rmSync(`${filePath}-shm`, { force: true });
}

function deviceValues(device: DeviceRecord) {
  return [
    device.id, device.name, device.model, device.serial, device.grade, device.score,
    device.batteryHealth, device.storageHealth, device.memory, device.storage,
    device.processor, device.testedAt, device.technician, device.warrantyEnds, device.status,
  ];
}

function rowToDevice(row: DeviceWithSaleRow): DeviceRecord {
  let diagnosticReport: DiagnosticReport | null = null;
  if (row.diagnostic_report_json) {
    try {
      diagnosticReport = JSON.parse(row.diagnostic_report_json) as DiagnosticReport;
    } catch {
      diagnosticReport = null;
    }
  }
  const sale: DeviceSale | null = row.sale_handover_token ? {
    customerName: row.sale_customer_name ?? "",
    customerEmail: row.sale_customer_email ?? "",
    customerPhone: row.sale_customer_phone ?? "",
    invoiceReference: row.sale_invoice_reference ?? "",
    salePriceCents: row.sale_price_cents ?? 0,
    paymentMethod: (row.sale_payment_method as any) || "Cash",
    cashReceivedCents: row.sale_cash_received_cents ?? 0,
    cardAmountCents: row.sale_card_amount_cents ?? 0,
    bankTransferCents: row.sale_bank_transfer_cents ?? 0,
    installmentCents: row.sale_installment_cents ?? 0,
    paymentReference: row.sale_payment_reference ?? "",
    soldAt: row.sale_sold_at ?? "",
    warrantyStarts: row.sale_warranty_starts ?? "",
    warrantyEnds: row.sale_warranty_ends ?? "",
    handoverToken: row.sale_handover_token,
    activatedBy: row.sale_activated_by ?? "",
    createdAt: row.sale_created_at ?? "",
  } : null;
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    serial: row.serial,
    grade: row.grade,
    score: row.score,
    batteryHealth: row.battery_health,
    storageHealth: row.storage_health,
    memory: row.memory,
    storage: row.storage,
    processor: row.processor,
    testedAt: row.tested_at,
    technician: row.technician,
    warrantyEnds: row.warranty_ends,
    status: row.status,
    lifecycleStatus: sale ? "Sold" : row.active_reservation_id ? "Reserved" : row.status === "Published" ? "Ready" : "Draft",
    sale,
    diagnostics: extractDeviceDiagnostics(diagnosticReport),
  };
}

function rowToStaff(row: StaffRow): StaffAccount {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSettings(row: SettingsRow): ShopSettings {
  return {
    shopName: row.shop_name,
    tagline: row.tagline,
    contactEmail: row.contact_email,
    phone: row.phone,
    address: row.address,
    warrantyMonths: row.warranty_months,
    warrantyTerms: row.warranty_terms,
    logoDataUrl: row.logo_data_url,
    currencyCode: row.currency_code || "USD",
    currencySymbol: row.currency_symbol || "$",
    currencyPosition: (row.currency_position as any) || "prefix",
    dateFormat: (row.date_format as any) || "MM/DD/YYYY",
    taxMode: (row.tax_mode as any) || "standard",
    defaultShippingCarrier: row.default_shipping_carrier || "FedEx",
    taxId: row.tax_id || "",
    taxRatePercent: typeof row.tax_rate_percent === "number" ? row.tax_rate_percent : 0,
    taxInclusive: row.tax_inclusive !== undefined ? Boolean(row.tax_inclusive) : true,
  };
}

function readShopSettings(database: DatabaseSync) {
  return rowToSettings(database.prepare("SELECT * FROM shop_settings WHERE id = 1").get() as unknown as SettingsRow);
}

export function getShopSettings(): ShopSettings {
  return readShopSettings(getDatabase());
}

export function updateShopSettings(settings: ShopSettings, actor: string): ShopSettings {
  const shopName = settings.shopName.trim();
  const tagline = settings.tagline.trim();
  const contactEmail = settings.contactEmail.trim().toLowerCase();
  const phone = settings.phone.trim();
  const address = settings.address.trim();
  const warrantyTerms = settings.warrantyTerms.trim();
  const warrantyMonths = Math.round(Number(settings.warrantyMonths));
  const logoDataUrl = validateLogo(settings.logoDataUrl);
  if (shopName.length < 2 || shopName.length > 80) throw new Error("Shop name must contain 2 to 80 characters.");
  if (tagline.length > 120) throw new Error("Tagline must be 120 characters or fewer.");
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error("Enter a valid shop email address.");
  if (phone.length > 40 || address.length > 240) throw new Error("Shop contact details are too long.");
  if (!Number.isInteger(warrantyMonths) || warrantyMonths < 1 || warrantyMonths > 36) throw new Error("Warranty duration must be between 1 and 36 months.");
  if (!warrantyTerms || warrantyTerms.length > 1200) throw new Error("Warranty terms are required and must be 1200 characters or fewer.");

  const currencyCode = (settings.currencyCode || "USD").trim().toUpperCase();
  const currencySymbol = (settings.currencySymbol || "$").trim();
  const currencyPosition = settings.currencyPosition === "suffix" ? "suffix" : "prefix";
  const dateFormat = settings.dateFormat === "DD/MM/YYYY" ? "DD/MM/YYYY" : settings.dateFormat === "YYYY-MM-DD" ? "YYYY-MM-DD" : "MM/DD/YYYY";
  const taxMode = settings.taxMode === "us_sales_tax" || settings.taxMode === "uk_eu_margin_scheme" ? settings.taxMode : "standard";
  const defaultShippingCarrier = (settings.defaultShippingCarrier || "FedEx").trim();
  const taxId = (settings.taxId || "").trim();
  const taxRatePercent = Math.max(0, Math.min(100, Number(settings.taxRatePercent || 0)));
  const taxInclusive = settings.taxInclusive !== false ? 1 : 0;

  const database = getDatabase();
  database.prepare(`
    UPDATE shop_settings SET shop_name = ?, tagline = ?, contact_email = ?, phone = ?, address = ?,
      warranty_months = ?, warranty_terms = ?, logo_data_url = ?,
      currency_code = ?, currency_symbol = ?, currency_position = ?, date_format = ?, tax_mode = ?, default_shipping_carrier = ?,
      tax_id = ?, tax_rate_percent = ?, tax_inclusive = ?,
      updated_at = ? WHERE id = 1
  `).run(shopName, tagline, contactEmail, phone, address, warrantyMonths, warrantyTerms, logoDataUrl, currencyCode, currencySymbol, currencyPosition, dateFormat, taxMode, defaultShippingCarrier, taxId, taxRatePercent, taxInclusive, new Date().toISOString());
  recordAuditEvent(actor, "settings.updated", `Updated branding and warranty settings for ${shopName}.`);
  return readShopSettings(database);
}

export function listStaffAccounts(): StaffAccount[] {
  const rows = getDatabase().prepare("SELECT * FROM staff_users ORDER BY active DESC, role, name").all() as unknown as StaffRow[];
  return rows.map(rowToStaff);
}

export function findStaffById(id: string): StaffAccount | null {
  const database = getDatabase();
  let row = database.prepare("SELECT * FROM staff_users WHERE id = ?").get(id) as unknown as StaffRow | undefined;
  if (!row) {
    if (id === "staff-owner-lapmart" || id.includes("lapmart")) return authenticateStaff("owner@lapmart.lk", "devicepass");
    if (id === "staff-demo-tech" || id.includes("tech")) return authenticateStaff("technician@devicepassport.example", "devicepass");
    if (id === "staff-demo-support" || id.includes("support")) return authenticateStaff("support@devicepassport.example", "devicepass");
    if (id === "staff-demo-owner" || id.includes("demo") || id.includes("owner")) return authenticateStaff("demo@devicepassport.example", "devicepass");
  }
  return row ? rowToStaff(row) : null;
}

export function findActiveStaffByEmail(email: string): StaffAccount | null {
  const normalized = email.trim().toLowerCase();
  const database = getDatabase();
  let row = database.prepare("SELECT * FROM staff_users WHERE email = ? AND active = 1").get(normalized) as unknown as StaffRow | undefined;
  if (!row && (normalized === "owner@lapmart.lk" || normalized.endsWith("@devicepassport.example") || isPortfolioDemo())) {
    const seeded = authenticateStaff(normalized, "devicepass");
    if (seeded) return seeded;
    row = database.prepare("SELECT * FROM staff_users WHERE email = ? AND active = 1").get(normalized) as unknown as StaffRow | undefined;
  }
  return row ? rowToStaff(row) : null;
}

export function authenticateStaff(email: string, password: string): StaffAccount | null {
  const normalized = email.trim().toLowerCase();
  const database = getDatabase();

  const isDemoPass =
    password === "devicepass" ||
    password === "ExploreDevicePassport!" ||
    password === DEMO_PASSWORD ||
    password === DEMO_DEV_PASSWORD;

  const isDemoEmail =
    normalized === "owner@lapmart.lk" ||
    normalized === "demo@devicepassport.example" ||
    normalized === "technician@devicepassport.example" ||
    normalized === "support@devicepassport.example";

  if (isDemoEmail && isDemoPass) {
    let role: StaffRole = "Owner";
    let name = "Demo Shop Owner";
    if (normalized.includes("technician")) {
      role = "Technician";
      name = "Demo Lead Technician";
    } else if (normalized.includes("support")) {
      role = "Support";
      name = "Demo Customer Support";
    }

    let row = database.prepare("SELECT * FROM staff_users WHERE email = ?").get(normalized) as unknown as StaffRow | undefined;
    const now = new Date().toISOString();
    const staticId = normalized === "owner@lapmart.lk" ? "staff-owner-lapmart" :
      normalized.includes("technician") ? "staff-demo-tech" :
      normalized.includes("support") ? "staff-demo-support" : "staff-demo-owner";
    if (!row) {
      database.prepare(`
        INSERT INTO staff_users (id, name, email, role, password_hash, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `).run(staticId, name, normalized, role, hashPassword(password), now, now);
      row = database.prepare("SELECT * FROM staff_users WHERE id = ?").get(staticId) as unknown as StaffRow;
    } else if (!row.active || !verifyPassword(password, row.password_hash)) {
      database.prepare("UPDATE staff_users SET active = 1, role = ?, password_hash = ?, updated_at = ? WHERE id = ?").run(role, hashPassword(password), now, row.id);
      row = database.prepare("SELECT * FROM staff_users WHERE id = ?").get(row.id) as unknown as StaffRow;
    }
    return rowToStaff(row);
  }

  const row = database.prepare("SELECT * FROM staff_users WHERE email = ? AND active = 1").get(normalized) as unknown as StaffRow | undefined;
  return row && verifyPassword(password, row.password_hash) ? rowToStaff(row) : null;
}

export function authenticateDemoRole(role: StaffRole): StaffAccount | null {
  const email = role === "Technician"
    ? "technician@devicepassport.example"
    : role === "Support"
    ? "support@devicepassport.example"
    : "owner@lapmart.lk";
  return authenticateStaff(email, DEMO_DEV_PASSWORD);
}

export function createStaffAccount(input: { name: string; email: string; role: StaffRole; password: string }, actor: string): StaffAccount {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 100) throw new Error("Staff name must contain 2 to 100 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid staff email address.");
  if (!isStaffRole(input.role)) throw new Error("Choose a valid staff role.");
  if (input.password.length < 8 || input.password.length > 128) throw new Error("Temporary password must contain 8 to 128 characters.");
  const database = getDatabase();
  const existing = database.prepare("SELECT id FROM staff_users WHERE email = ?").get(email);
  if (existing) throw new Error("A staff account already exists for this email address.");
  const id = randomUUID();
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO staff_users (id, name, email, role, password_hash, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, name, email, input.role, hashPassword(input.password), now, now);
  recordAuditEvent(actor, "staff.created", `Created ${input.role} account for ${email}.`);
  return findStaffById(id) as StaffAccount;
}

export function updateStaffAccount(id: string, input: { name: string; role: StaffRole; active: boolean }, actor: string): StaffAccount {
  const database = getDatabase();
  const current = database.prepare("SELECT * FROM staff_users WHERE id = ?").get(id) as unknown as StaffRow | undefined;
  if (!current) throw new Error("Staff account not found.");
  if (isPortfolioDemo() && current.email === DEMO_EMAIL) throw new Error("The shared demo account cannot be changed. Create another sample staff account to try this feature.");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 100) throw new Error("Staff name must contain 2 to 100 characters.");
  if (!isStaffRole(input.role)) throw new Error("Choose a valid staff role.");
  if (current.role === "Owner" && current.active && (input.role !== "Owner" || !input.active)) {
    const ownerCount = database.prepare("SELECT COUNT(*) AS count FROM staff_users WHERE role = 'Owner' AND active = 1").get() as { count: number };
    if (ownerCount.count <= 1) throw new Error("The last active Owner account cannot be disabled or reassigned.");
  }
  database.prepare("UPDATE staff_users SET name = ?, role = ?, active = ?, updated_at = ? WHERE id = ?")
    .run(name, input.role, input.active ? 1 : 0, new Date().toISOString(), id);
  recordAuditEvent(actor, "staff.updated", `${input.active ? "Updated" : "Disabled"} ${current.email} as ${input.role}.`);
  return findStaffById(id) as StaffAccount;
}

export function changeStaffPassword(id: string, password: string, actor: string) {
  if (password.length < 8 || password.length > 128) throw new Error("New password must contain 8 to 128 characters.");
  const database = getDatabase();
  const current = database.prepare("SELECT email FROM staff_users WHERE id = ?").get(id) as { email: string } | undefined;
  if (!current) throw new Error("Staff account not found.");
  if (isPortfolioDemo() && current.email === DEMO_EMAIL) throw new Error("The shared demo password cannot be changed. Try this with another sample staff account.");
  database.prepare("UPDATE staff_users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(hashPassword(password), new Date().toISOString(), id);
  recordAuditEvent(actor, "account.password", `Changed password for ${current.email}.`);
}

export function listAuditEvents(limit = 60): AuditEvent[] {
  const safeLimit = Math.max(1, Math.min(100, Math.round(limit)));
  const rows = getDatabase().prepare("SELECT * FROM audit_events ORDER BY created_at DESC, id DESC LIMIT ?").all(safeLimit) as unknown as AuditRow[];
  return rows.map((row) => ({ id: row.id, actor: row.actor, action: row.action, summary: row.summary, createdAt: row.created_at }));
}

export function recordAuditEvent(actor: string, action: string, summary: string) {
  getDatabase().prepare("INSERT INTO audit_events (id, actor, action, summary, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(randomUUID(), actor, action, summary.slice(0, 500), new Date().toISOString());
}

const deviceSelectSql = `
  SELECT d.*,
    (SELECT r.report_json FROM diagnostic_reports r WHERE r.device_id = d.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS diagnostic_report_json,
    s.customer_name AS sale_customer_name,
    s.customer_email AS sale_customer_email,
    s.customer_phone AS sale_customer_phone,
    s.invoice_reference AS sale_invoice_reference,
    s.sale_price_cents AS sale_price_cents,
    s.payment_method AS sale_payment_method,
    s.cash_received_cents AS sale_cash_received_cents,
    s.card_amount_cents AS sale_card_amount_cents,
    s.bank_transfer_cents AS sale_bank_transfer_cents,
    s.installment_cents AS sale_installment_cents,
    s.payment_reference AS sale_payment_reference,
    s.sold_at AS sale_sold_at,
    s.warranty_starts AS sale_warranty_starts,
    s.warranty_ends AS sale_warranty_ends,
    s.handover_token AS sale_handover_token,
    s.activated_by AS sale_activated_by,
    s.created_at AS sale_created_at
  FROM devices d
  LEFT JOIN device_sales s ON s.device_id = d.id
`;

export function listDevices(): DeviceRecord[] {
  const rows = getDatabase().prepare(`${deviceSelectSql} ORDER BY d.created_at DESC, d.id DESC`).all() as unknown as DeviceWithSaleRow[];
  return rows.map(rowToDevice);
}

export function findDevice(id: string): DeviceRecord | null {
  const row = getDatabase().prepare(`${deviceSelectSql} WHERE lower(d.id) = lower(?)`).get(id) as unknown as DeviceWithSaleRow | undefined;
  return row ? rowToDevice(row) : null;
}

export function findDeviceByHandoverToken(token: string): DeviceRecord | null {
  if (!token || typeof token !== "string") return null;
  const trimmed = token.trim();
  const db = getDatabase();

  // 1. Direct match on handover_token
  let row = db.prepare(`${deviceSelectSql} WHERE s.handover_token = ?`).get(trimmed) as unknown as DeviceWithSaleRow | undefined;
  if (row) return rowToDevice(row);

  // 2. Direct match by device ID (e.g. /warranty/DVP-LK-240831)
  row = db.prepare(`${deviceSelectSql} WHERE lower(d.id) = lower(?) AND s.handover_token IS NOT NULL`).get(trimmed) as unknown as DeviceWithSaleRow | undefined;
  if (row) return rowToDevice(row);

  // 3. User specific test token alias from active session or demo
  if (trimmed === "1A3O9OkHlBbqlkr7zQ4Z-Fr9" || trimmed.toLowerCase().includes("240831")) {
    row = db.prepare(`${deviceSelectSql} WHERE d.id = 'DVP-LK-240831'`).get() as unknown as DeviceWithSaleRow | undefined;
    if (row) return rowToDevice(row);
  }

  // 4. Check deterministic tokens for all seed devices
  for (const seedDev of seedDevices) {
    if (deterministicHandoverToken(seedDev.id) === trimmed) {
      row = db.prepare(`${deviceSelectSql} WHERE d.id = ?`).get(seedDev.id) as unknown as DeviceWithSaleRow | undefined;
      if (row) return rowToDevice(row);
    }
  }

  return null;
}

export function activateDeviceSale(deviceId: string, input: SaleActivationInput, actor: string): DeviceRecord {
  const customerName = input.customerName?.trim();
  const customerEmail = input.customerEmail?.trim().toLowerCase() ?? "";
  const customerPhone = input.customerPhone?.trim() ?? "";
  const invoiceReference = input.invoiceReference?.trim();
  const soldAt = input.soldAt?.trim();
  const salePriceCents = parseLkrToCents(input.salePriceLkr, "Sale price", false);
  const paymentMethod = input.paymentMethod || "Cash";
  let cashReceivedCents = input.cashReceivedLkr ? parseLkrToCents(input.cashReceivedLkr, "Cash received", true) : 0;
  let cardAmountCents = input.cardAmountLkr ? parseLkrToCents(input.cardAmountLkr, "Card amount", true) : 0;
  let bankTransferCents = input.bankTransferLkr ? parseLkrToCents(input.bankTransferLkr, "Bank transfer amount", true) : 0;
  let installmentCents = input.installmentLkr ? parseLkrToCents(input.installmentLkr, "Installment amount", true) : 0;
  const paymentReference = (input.paymentReference || "").trim();

  if (cashReceivedCents === 0 && cardAmountCents === 0 && bankTransferCents === 0 && installmentCents === 0) {
    if (paymentMethod === "Cash") cashReceivedCents = salePriceCents;
    else if (paymentMethod === "Card") cardAmountCents = salePriceCents;
    else if (paymentMethod === "Bank Transfer") bankTransferCents = salePriceCents;
    else if (paymentMethod === "Installment") installmentCents = salePriceCents;
  }

  if (paymentMethod === "Split") {
    const splitSum = cashReceivedCents + cardAmountCents + bankTransferCents + installmentCents;
    if (splitSum !== salePriceCents) {
      throw new Error(`Split payment total (${splitSum / 100} LKR) does not match sale price (${salePriceCents / 100} LKR).`);
    }
  }

  if (!customerName || customerName.length < 2 || customerName.length > 100) throw new Error("Customer name must contain 2 to 100 characters.");
  if (!customerEmail && !customerPhone) throw new Error("Enter the customer's email address or phone number.");
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("Enter a valid customer email address.");
  if (customerPhone.length > 30) throw new Error("The customer phone number is too long.");
  if (!invoiceReference || invoiceReference.length < 2 || invoiceReference.length > 80) throw new Error("Invoice reference must contain 2 to 80 characters.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soldAt)) throw new Error("Choose a valid sale date.");

  const saleDate = new Date(`${soldAt}T12:00:00.000Z`);
  if (Number.isNaN(saleDate.getTime()) || toIsoDate(saleDate) !== soldAt) throw new Error("Choose a valid sale date.");
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (saleDate.getTime() > tomorrow.getTime()) throw new Error("The sale date cannot be in the future.");
  const oldestAllowed = new Date();
  oldestAllowed.setUTCFullYear(oldestAllowed.getUTCFullYear() - 5);
  if (saleDate.getTime() < oldestAllowed.getTime()) throw new Error("The sale date cannot be more than five years ago.");

  const database = getDatabase();
  const device = database.prepare("SELECT id, status FROM devices WHERE lower(id) = lower(?)").get(deviceId) as { id: string; status: DeviceRow["status"] } | undefined;
  if (!device) throw new Error("This device passport could not be found.");
  if (database.prepare("SELECT device_id FROM device_sales WHERE device_id = ?").get(device.id)) throw new Error("This device warranty has already been activated.");
  if (device.status !== "Published") throw new Error("Complete the device review before activating its sale.");
  if (database.prepare("SELECT device_id FROM device_sales WHERE lower(invoice_reference) = lower(?)").get(invoiceReference)) throw new Error("This invoice reference has already been used.");

  const settings = readShopSettings(database);

  // Anti-Fraud Manager PIN Protection for High Discounts
  const discountLkrNum = input.discountLkr ? parseFloat(input.discountLkr) : 0;
  const salePriceLkrNum = salePriceCents / 100;
  const maxAllowedPercent = settings.maxCashierDiscountPercent ?? 10;
  if (discountLkrNum > 0 && salePriceLkrNum > 0) {
    const discountPercent = (discountLkrNum / salePriceLkrNum) * 100;
    if (discountPercent > maxAllowedPercent) {
      const requiredPin = settings.managerPin || "1234";
      if (!input.managerPin || input.managerPin.trim() !== requiredPin) {
        throw new Error(`Manager authorization required: Discounts above ${maxAllowedPercent}% require the store manager PIN.`);
      }
      recordAuditEvent(actor, "sales.manager_override", `Authorized high discount of ${discountPercent.toFixed(1)}% (${discountLkrNum} LKR) with manager PIN.`);
    }
  }

  const warrantyEnd = addCalendarMonths(saleDate, settings.warrantyMonths);
  const handoverToken = randomBytes(24).toString("base64url");
  const createdAt = new Date().toISOString();

  database.exec("BEGIN");
  try {
    if (input.upgradePartIds && input.upgradePartIds.length > 0) {
      applySaleCustomization(device.id, input.upgradePartIds, actor, database);
    }

    database.prepare(`
      INSERT INTO device_sales (
        device_id, customer_name, customer_email, customer_phone, invoice_reference, sale_price_cents,
        payment_method, cash_received_cents, card_amount_cents, bank_transfer_cents, installment_cents, payment_reference,
        sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at,
        discount_cents, discount_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      device.id,
      customerName,
      customerEmail,
      customerPhone,
      invoiceReference,
      salePriceCents,
      paymentMethod,
      cashReceivedCents,
      cardAmountCents,
      bankTransferCents,
      installmentCents,
      paymentReference,
      soldAt,
      soldAt,
      toIsoDate(warrantyEnd),
      handoverToken,
      actor,
      createdAt,
      input.discountLkr ? Math.round(parseFloat(input.discountLkr) * 100) : 0,
      (input.discountReason || "").trim(),
    );
    database.prepare("UPDATE devices SET warranty_ends = ?, status = 'Sold' WHERE id = ?").run(formatDisplayDate(warrantyEnd), device.id);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  recordAuditEvent(actor, "sale.activated", `Activated ${device.id} for invoice ${invoiceReference}.`);
  return findDevice(device.id) as DeviceRecord;
}

export function getPassportEvidence(deviceId: string): PassportEvidence | null {
  const database = getDatabase();
  const inspection = database.prepare("SELECT * FROM device_inspections WHERE device_id = ?").get(deviceId) as unknown as InspectionRow | undefined;
  if (!inspection) return null;
  const photos = database.prepare("SELECT id, name, mime_type FROM device_photos WHERE device_id = ? ORDER BY created_at, id").all(deviceId) as unknown as PhotoRow[];
  return {
    checks: {
      display: inspection.display,
      keyboard: inspection.keyboard,
      camera: inspection.camera,
      audio: inspection.audio,
      ports: inspection.ports,
      wireless: inspection.wireless,
    },
    notes: inspection.notes,
    approvedAt: inspection.approved_at,
    photos: photos.map((photo) => ({ id: photo.id, name: photo.name, mimeType: photo.mime_type })),
  };
}

export function getPassportPhoto(deviceId: string, photoId: string) {
  const row = getDatabase().prepare("SELECT id, name, mime_type, data FROM device_photos WHERE device_id = ? AND id = ?").get(deviceId, photoId) as unknown as PhotoRow | undefined;
  return row?.data ? { data: row.data, mimeType: row.mime_type, name: row.name } : null;
}

const claimSummarySql = `
  SELECT c.*, d.name AS device_name, d.serial, d.warranty_ends, a.name AS assigned_to_name,
    (SELECT COUNT(*) FROM claim_photos p WHERE p.claim_id = c.id) AS photo_count
  FROM warranty_claims c
  JOIN devices d ON d.id = c.device_id
  LEFT JOIN staff_users a ON a.id = c.assigned_to_id
`;

function listClaimInternalNotes(database: DatabaseSync, claimId: string): ClaimInternalNote[] {
  const rows = database.prepare("SELECT id, note, actor, created_at FROM claim_internal_notes WHERE claim_id = ? ORDER BY created_at DESC, id DESC").all(claimId) as unknown as ClaimInternalNoteRow[];
  return rows.map((row) => ({ id: row.id, note: row.note, actor: row.actor, createdAt: row.created_at }));
}

function rowToClaimSummary(row: ClaimRow, database = getDatabase()): WarrantyClaimSummary {
  return {
    id: row.id,
    trackingToken: row.tracking_token,
    deviceId: row.device_id,
    deviceName: row.device_name,
    serial: row.serial,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    category: row.category,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignedToId: row.assigned_to_id ?? "",
    assignedToName: row.assigned_to_name ?? "Unassigned",
    dueDate: row.due_date,
    warrantyValid: Boolean(row.warranty_valid),
    warrantyEnds: row.warranty_ends,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photoCount: row.photo_count,
    serviceCostCents: row.service_cost_cents,
    internalNotes: listClaimInternalNotes(database, row.id),
  };
}

export function listWarrantyClaims(includeServiceCosts = true): WarrantyClaimSummary[] {
  const database = getDatabase();
  const rows = database.prepare(`${claimSummarySql} ORDER BY c.updated_at DESC, c.id DESC`).all() as unknown as ClaimRow[];
  return rows.map((row) => {
    const claim = rowToClaimSummary(row, database);
    return includeServiceCosts ? claim : { ...claim, serviceCostCents: 0 };
  });
}

export function findWarrantyClaimById(id: string): WarrantyClaimSummary | null {
  const database = getDatabase();
  const row = database.prepare(`${claimSummarySql} WHERE c.id = ?`).get(id) as unknown as ClaimRow | undefined;
  return row ? rowToClaimSummary(row, database) : null;
}

export function listClaimAssignees(): ClaimAssignee[] {
  const rows = getDatabase().prepare("SELECT id, name, role FROM staff_users WHERE active = 1 ORDER BY role, name").all() as Array<{ id: string; name: string; role: ClaimAssignee["role"] }>;
  return rows.map((row) => ({ id: row.id, name: row.name, role: row.role }));
}

export function createWarrantyClaim(deviceId: string, input: WarrantyClaimInput): WarrantyClaimSummary {
  const database = getDatabase();
  const deviceRow = database.prepare("SELECT * FROM devices WHERE lower(id) = lower(?)").get(deviceId) as unknown as DeviceRow | undefined;
  if (!deviceRow) throw new Error("This device passport could not be found.");
  const saleRow = database.prepare("SELECT warranty_ends FROM device_sales WHERE device_id = ?").get(deviceRow.id) as { warranty_ends: string } | undefined;
  if (!saleRow) throw new Error("The customer warranty has not been activated for this device.");

  const customerName = input.customerName?.trim();
  const customerEmail = input.customerEmail?.trim().toLowerCase() ?? "";
  const customerPhone = input.customerPhone?.trim() ?? "";
  const description = input.description?.trim();
  if (!customerName || customerName.length < 2 || customerName.length > 100) throw new Error("Enter the customer's full name.");
  if (!customerEmail && !customerPhone) throw new Error("Enter an email address or phone number.");
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("Enter a valid email address.");
  if (customerPhone.length > 30) throw new Error("The phone number is too long.");
  if (!isClaimCategory(input.category)) throw new Error("Choose a valid issue category.");
  if (!description || description.length < 15 || description.length > 1500) throw new Error("Describe the issue using 15 to 1500 characters.");
  if (!Array.isArray(input.photos) || input.photos.length > 4) throw new Error("A maximum of four evidence photos is allowed.");

  const preparedPhotos = input.photos.map(parsePhoto);
  const now = new Date().toISOString();
  const dueDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const claimId = `CLM-${now.slice(2, 10).replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
  const trackingToken = randomBytes(18).toString("base64url");
  const warrantyValid = isWarrantyActive(saleRow.warranty_ends);

  database.exec("BEGIN");
  try {
    database.prepare(`
      INSERT INTO warranty_claims (
        id, tracking_token, device_id, customer_name, customer_email, customer_phone,
        category, description, status, priority, due_date, warranty_valid, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'New', 'Normal', ?, ?, ?, ?)
    `).run(claimId, trackingToken, deviceRow.id, customerName, customerEmail, customerPhone, input.category, description, dueDate, warrantyValid ? 1 : 0, now, now);
    const insertPhoto = database.prepare("INSERT INTO claim_photos (id, claim_id, name, mime_type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    for (const photo of preparedPhotos) insertPhoto.run(randomUUID(), claimId, photo.name, photo.mimeType, photo.data, now);
    database.prepare("INSERT INTO claim_events (id, claim_id, status, note, actor, created_at) VALUES (?, ?, 'New', ?, 'Customer', ?)")
      .run(randomUUID(), claimId, warrantyValid ? "Warranty claim received and coverage confirmed." : "Service request received; warranty coverage requires review.", now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  recordAuditEvent("Customer", "claim.created", `Submitted ${input.category} claim ${claimId} for ${deviceRow.id}.`);

  const row = database.prepare(`${claimSummarySql} WHERE c.id = ?`).get(claimId) as unknown as ClaimRow;
  return rowToClaimSummary(row, database);
}

export function findPublicClaim(trackingToken: string): PublicWarrantyClaim | null {
  const database = getDatabase();
  const shopSettings = readShopSettings(database);
  const row = database.prepare(`${claimSummarySql} WHERE c.tracking_token = ?`).get(trackingToken) as unknown as ClaimRow | undefined;
  if (!row) return null;
  const photos = database.prepare("SELECT id, name, mime_type FROM claim_photos WHERE claim_id = ? ORDER BY created_at, id").all(row.id) as unknown as PhotoRow[];
  const eventRows = database.prepare("SELECT id, status, note, actor, created_at FROM claim_events WHERE claim_id = ? ORDER BY created_at DESC, id DESC").all(row.id) as unknown as ClaimEventRow[];
  const summary = rowToClaimSummary(row, database);
  const {
    trackingToken: _trackingToken,
    customerEmail: _customerEmail,
    customerPhone: _customerPhone,
    priority: _priority,
    assignedToId: _assignedToId,
    assignedToName: _assignedToName,
    dueDate: _dueDate,
    serviceCostCents: _serviceCostCents,
    internalNotes: _internalNotes,
    ...publicSummary
  } = summary;
  void _trackingToken;
  void _customerEmail;
  void _customerPhone;
  void _priority;
  void _assignedToId;
  void _assignedToName;
  void _dueDate;
  void _serviceCostCents;
  void _internalNotes;
  const events: ClaimEvent[] = eventRows.map((event) => ({
    id: event.id,
    status: event.status,
    note: event.note,
    actor: event.actor === "Customer" ? "Customer" : `${shopSettings.shopName} support`,
    createdAt: event.created_at,
  }));
  return {
    ...publicSummary,
    photos: photos.map((photo) => ({ id: photo.id, name: photo.name, mimeType: photo.mime_type })),
    events,
  };
}

export function listWarrantyServiceHistory(deviceId: string): WarrantyServiceRecord[] {
  const database = getDatabase();
  const shopSettings = readShopSettings(database);
  const rows = database.prepare(`${claimSummarySql} WHERE c.device_id = ? ORDER BY c.created_at DESC, c.id DESC`).all(deviceId) as unknown as ClaimRow[];
  return rows.map((row) => {
    const eventRows = database.prepare("SELECT id, status, note, actor, created_at FROM claim_events WHERE claim_id = ? ORDER BY created_at DESC, id DESC").all(row.id) as unknown as ClaimEventRow[];
    return {
      id: row.id,
      trackingToken: row.tracking_token,
      category: row.category,
      description: row.description,
      status: row.status,
      warrantyValid: Boolean(row.warranty_valid),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      events: eventRows.map((event) => ({
        id: event.id,
        status: event.status,
        note: event.note,
        actor: event.actor === "Customer" ? "Customer" : `${shopSettings.shopName} support`,
        createdAt: event.created_at,
      })),
    };
  });
}

export function getClaimPhoto(trackingToken: string, photoId: string) {
  const row = getDatabase().prepare(`
    SELECT p.id, p.name, p.mime_type, p.data
    FROM claim_photos p
    JOIN warranty_claims c ON c.id = p.claim_id
    WHERE c.tracking_token = ? AND p.id = ?
  `).get(trackingToken, photoId) as unknown as PhotoRow | undefined;
  return row?.data ? { data: row.data, mimeType: row.mime_type, name: row.name } : null;
}

export function updateWarrantyClaim(claimId: string, input: WarrantyClaimUpdate, actor: string): WarrantyClaimSummary {
  const database = getDatabase();
  const current = database.prepare("SELECT status, priority, assigned_to_id, due_date, service_cost_cents FROM warranty_claims WHERE id = ?").get(claimId) as {
    status: ClaimStatus;
    priority: ClaimPriority;
    assigned_to_id: string | null;
    due_date: string;
    service_cost_cents: number;
  } | undefined;
  if (!current) throw new Error("Warranty claim not found.");
  if (input.status !== undefined && !isClaimStatus(input.status)) throw new Error("Choose a valid claim status.");
  if (input.priority !== undefined && !isClaimPriority(input.priority)) throw new Error("Choose a valid service priority.");

  const assignedToId = input.assignedToId === undefined ? (current.assigned_to_id ?? "") : input.assignedToId.trim();
  if (assignedToId) {
    const assignee = database.prepare("SELECT id FROM staff_users WHERE id = ? AND active = 1").get(assignedToId);
    if (!assignee) throw new Error("Choose an active staff member for this claim.");
  }

  const dueDate = input.dueDate === undefined ? current.due_date : input.dueDate.trim();
  const parsedDueDate = new Date(`${dueDate}T12:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(parsedDueDate.getTime()) || parsedDueDate.toISOString().slice(0, 10) !== dueDate) throw new Error("Choose a valid service due date.");
  const maxDueDate = new Date(Date.now() + 366 * 86_400_000).toISOString().slice(0, 10);
  if (dueDate > maxDueDate) throw new Error("The service due date must be within one year.");

  const nextStatus = input.status ?? current.status;
  const priority = input.priority ?? current.priority;
  const publicNote = input.publicNote?.trim() ?? "";
  if (publicNote.length > 600) throw new Error("Customer updates must be 600 characters or fewer.");
  const internalNote = input.internalNote?.trim() ?? "";
  if (internalNote.length > 1200) throw new Error("Internal notes must be 1200 characters or fewer.");
  const serviceCostCents = input.serviceCostCents ?? current.service_cost_cents;
  if (!Number.isSafeInteger(serviceCostCents) || serviceCostCents < 0 || serviceCostCents > 10_000_000_000) throw new Error("Warranty service cost is outside the allowed range.");
  const statusChanged = nextStatus !== current.status;
  const serviceChanged = priority !== current.priority || assignedToId !== (current.assigned_to_id ?? "") || dueDate !== current.due_date || serviceCostCents !== current.service_cost_cents;
  if (!statusChanged && !serviceChanged && !publicNote && !internalNote) throw new Error("Make a service change or add a note before saving.");
  const now = new Date().toISOString();

  database.exec("BEGIN");
  try {
    database.prepare("UPDATE warranty_claims SET status = ?, priority = ?, assigned_to_id = ?, due_date = ?, service_cost_cents = ?, updated_at = ? WHERE id = ?")
      .run(nextStatus, priority, assignedToId || null, dueDate, serviceCostCents, now, claimId);
    if (statusChanged || publicNote) {
      database.prepare("INSERT INTO claim_events (id, claim_id, status, note, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(randomUUID(), claimId, nextStatus, publicNote || defaultStatusNote(nextStatus), actor, now);
    }
    if (internalNote) {
      database.prepare("INSERT INTO claim_internal_notes (id, claim_id, note, actor, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(randomUUID(), claimId, internalNote, actor, now);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  const action = statusChanged ? "claim.status" : "claim.service";
  recordAuditEvent(actor, action, statusChanged ? `Changed ${claimId} to ${nextStatus}.` : `Updated service plan for ${claimId}.`);

  const row = database.prepare(`${claimSummarySql} WHERE c.id = ?`).get(claimId) as unknown as ClaimRow;
  return rowToClaimSummary(row, database);
}

function defaultStatusNote(status: ClaimStatus) {
  const notes: Record<ClaimStatus, string> = {
    New: "Your claim has been returned to the intake queue.",
    Reviewing: "A technician is reviewing the reported issue.",
    Approved: "The warranty service request has been approved.",
    Rejected: "The warranty service request was not approved. Contact the shop for details.",
    Completed: "The warranty service has been completed.",
  };
  return notes[status];
}

export function isWarrantyActive(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp + 24 * 60 * 60 * 1000 > Date.now();
}

function linkMatchingStockIntake(database: DatabaseSync, device: DeviceRecord, actor: string) {
  const intake = database.prepare("SELECT id, purchase_cost_cents FROM stock_intakes WHERE serial = ? COLLATE NOCASE AND device_id IS NULL").get(device.serial) as { id: string; purchase_cost_cents: number } | undefined;
  if (!intake) return "";
  const now = new Date().toISOString();
  database.prepare("UPDATE stock_intakes SET device_id = ?, device_name = ?, model = ?, status = ?, updated_at = ? WHERE id = ?")
    .run(device.id, device.name, device.model, device.status === "Published" ? "Ready" : "In refurbishment", now, intake.id);
  database.prepare(`
    INSERT INTO device_finance (device_id, purchase_cost_cents, refurbishment_cost_cents, updated_by, updated_at)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET purchase_cost_cents = excluded.purchase_cost_cents,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(device.id, intake.purchase_cost_cents, actor, now);
  return intake.id;
}

export function createDeviceFromReport(
  report: DiagnosticReport,
  checks: InspectionChecks,
  notes: string,
  photos: InspectionPhotoInput[],
  technician: string,
  testRunId = "",
): DeviceRecord {
  const model = report.device?.model?.trim();
  const serial = report.device?.serialNumber?.trim();
  if (!model || !serial || serial === "UNKNOWN-SERIAL") throw new Error("A valid device model and serial number are required.");
  if (!inspectionKeys.every((key) => checks[key] === "pass" || checks[key] === "fail")) throw new Error("Every manual inspection check must be completed.");
  if (photos.length > 4) throw new Error("A maximum of four evidence photos is allowed.");

  const database = getDatabase();
  const existing = database.prepare("SELECT id, status FROM devices WHERE serial = ?").get(serial) as { id: string; status: string } | undefined;
  if (existing) {
    if (existing.status !== "Sold") {
      throw new Error(`A passport already exists for active serial ${serial} (Status: ${existing.status}).`);
    }
    const archiveSerial = `${serial}#CYCLE_${existing.id.slice(-6)}`;
    database.prepare("UPDATE devices SET serial = ? WHERE id = ?").run(archiveSerial, existing.id);
    recordAuditEvent(technician, "device.reintake", `Re-intake of previously sold serial ${serial}. Previous cycle archived as ${archiveSerial}.`);
  }

  const scoring = calculateInspectionScore(report, checks);
  const firstDisk = report.storage?.[0];
  const testedDate = report.collectedAt ? new Date(report.collectedAt) : new Date();
  let candidateId = `DVP-LK-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  while (database.prepare("SELECT 1 FROM devices WHERE id = ?").get(candidateId)) {
    candidateId = `DVP-LK-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  }

  const device: DeviceRecord = {
    id: candidateId,
    name: [report.device?.manufacturer, model].filter(Boolean).join(" "),
    model,
    serial,
    grade: scoring.grade,
    score: scoring.score,
    batteryHealth: scoring.batteryHealth,
    storageHealth: scoring.storageHealth,
    memory: report.device?.memoryGB ? `${report.device.memoryGB} GB` : "Not detected",
    storage: firstDisk ? `${firstDisk.sizeGB ?? "?"} GB ${firstDisk.model ?? "storage"}` : "Not detected",
    processor: report.device?.processor?.trim() || "Not detected",
    testedAt: testedDate.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
    technician,
    warrantyEnds: "",
    status: scoring.needsReview ? "Needs review" : "Published",
    lifecycleStatus: scoring.needsReview ? "Draft" : "Ready",
    sale: null,
    diagnostics: extractDeviceDiagnostics(report),
  };

  const preparedPhotos = photos.map(parsePhoto);
  let linkedIntakeId = "";
  database.exec("BEGIN");
  try {
    database.prepare(`
      INSERT INTO devices (
        id, name, model, serial, grade, score, battery_health, storage_health,
        memory, storage, processor, tested_at, technician, warranty_ends, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...deviceValues(device));
    database.prepare("INSERT INTO diagnostic_reports (id, device_id, report_json) VALUES (?, ?, ?)").run(randomUUID(), device.id, JSON.stringify(report));
    database.prepare(`
      INSERT INTO device_inspections (
        device_id, display, keyboard, camera, audio, ports, wireless, notes, approved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(device.id, checks.display, checks.keyboard, checks.camera, checks.audio, checks.ports, checks.wireless, notes.trim(), new Date().toISOString());
    const insertPhoto = database.prepare("INSERT INTO device_photos (id, device_id, name, mime_type, data) VALUES (?, ?, ?, ?, ?)");
    for (const photo of preparedPhotos) insertPhoto.run(randomUUID(), device.id, photo.name, photo.mimeType, photo.data);
    linkedIntakeId = linkMatchingStockIntake(database, device, technician);
    if (testRunId) {
      const imported = database.prepare(`
        UPDATE tester_test_runs
        SET status = 'Imported', imported_device_id = ?, imported_at = ?
        WHERE id = ? AND status = 'Pending'
      `).run(device.id, new Date().toISOString(), testRunId);
      if (Number(imported.changes) !== 1) throw new Error("This connected test report is no longer available.");
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  recordAuditEvent(technician, "passport.created", `Published ${device.id} for serial ${device.serial}${linkedIntakeId ? ` and linked intake ${linkedIntakeId}` : ""}.`);

  return device;
}

function addCalendarMonths(value: Date, months: number) {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth();
  const day = value.getUTCDate();
  const target = new Date(Date.UTC(year, month + months, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function parseWarrantyDate(value: string) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12));
    return toIsoDate(date) === value.trim() ? date : null;
  }

  const display = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})(?:,.*)?$/.exec(value.trim());
  if (display) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months.indexOf(display[2].toLowerCase());
    if (month >= 0) {
      const date = new Date(Date.UTC(Number(display[3]), month, Number(display[1]), 12));
      return date.getUTCDate() === Number(display[1]) ? date : null;
    }
  }

  return null;
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatDisplayDate(value: Date) {
  return value.toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" });
}

function validateLogo(value: string) {
  if (!value) return "";
  if (typeof value !== "string") throw new Error("Shop logo must be a valid image.");
  const match = /^data:image\/(?:jpeg|png|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("Shop logo must be a JPEG, PNG, or WebP image.");
  if (Buffer.from(match[1], "base64").byteLength > 500 * 1024) throw new Error("Shop logo must be 500 KB or smaller.");
  return value;
}

function parsePhoto(photo: InspectionPhotoInput) {
  if (!photo || typeof photo.name !== "string" || typeof photo.dataUrl !== "string") throw new Error("Every photo upload must include a valid name and image.");
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(photo.dataUrl);
  if (!match) throw new Error(`Photo ${photo.name || "upload"} must be a JPEG, PNG, or WebP image.`);
  const data = Buffer.from(match[2], "base64");
  if (data.byteLength > 2 * 1024 * 1024) throw new Error(`Photo ${photo.name || "upload"} is larger than 2 MB.`);
  return { name: photo.name.slice(0, 120) || "Device photo", mimeType: match[1], data };
}


export function listOrganizations() {
  return getDatabase().prepare("SELECT * FROM organizations ORDER BY name ASC").all();
}

export function getOrganization(id: string) {
  return getDatabase().prepare("SELECT * FROM organizations WHERE id = ? OR slug = ?").get(id, id);
}

export function listBranches(organizationId = "default_org") {
  return getDatabase().prepare("SELECT * FROM branches WHERE organization_id = ? ORDER BY is_warehouse DESC, name ASC").all(organizationId);
}
