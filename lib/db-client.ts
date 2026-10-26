import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import pg from "pg";

export interface IDatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, params?: any[]): Promise<T | null>;
  run(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid?: number | bigint }>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (client: IDatabaseClient) => Promise<T>): Promise<T>;
  isPostgres(): boolean;
  close(): Promise<void>;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  currency: string;
  warranty_policy: string | null;
  created_at: string;
}

export interface BranchRecord {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  is_warehouse: number;
  address: string | null;
  phone: string | null;
  created_at: string;
}

export function convertPlaceholdersToPostgres(sql: string): string {
  let paramIndex = 1;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let result = "";

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'" && (i === 0 || sql[i - 1] !== "\\")) {
      inSingleQuote = !inSingleQuote;
      result += char;
    } else if (char === '"' && (i === 0 || sql[i - 1] !== "\\")) {
      inDoubleQuote = !inDoubleQuote;
      result += char;
    } else if (char === "?" && !inSingleQuote && !inDoubleQuote) {
      result += `$${paramIndex++}`;
    } else {
      result += char;
    }
  }
  return result;
}

// -------------------------------------------------------------
// 1. SQLite Database Adapter (Offline / Workshop Bench)
// -------------------------------------------------------------
export class SqliteDatabaseClient implements IDatabaseClient {
  private db: DatabaseSync;

  constructor(filePath?: string) {
    const finalPath = filePath || path.join(process.cwd(), ".data", "device-passport.db");
    const dir = path.dirname(finalPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(finalPath);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  }

  getNativeDb(): DatabaseSync {
    return this.db;
  }

  isPostgres(): boolean {
    return false;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params);
    return (row as T) || null;
  }

  async run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async transaction<T>(fn: (client: IDatabaseClient) => Promise<T>): Promise<T> {
    this.db.exec("BEGIN");
    try {
      const result = await fn(this);
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

// -------------------------------------------------------------
// 2. PostgreSQL Database Adapter (Serverless / Cloud Production)
// -------------------------------------------------------------
export class PostgresDatabaseClient implements IDatabaseClient {
  private pool: pg.Pool;

  constructor(connectionString?: string) {
    const connStr = connectionString || process.env.DATABASE_URL;
    if (!connStr) {
      throw new Error("PostgresDatabaseClient requires DATABASE_URL to connect.");
    }
    this.pool = new pg.Pool({
      connectionString: connStr,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }

  isPostgres(): boolean {
    return true;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const pgSql = convertPlaceholdersToPostgres(sql);
    const res = await this.pool.query(pgSql, params);
    return res.rows as T[];
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
    const pgSql = convertPlaceholdersToPostgres(sql);
    const res = await this.pool.query(pgSql, params);
    return {
      changes: res.rowCount ?? 0,
    };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(fn: (client: IDatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const txClient: IDatabaseClient = {
        query: async <R = any>(sql: string, params: any[] = []): Promise<R[]> => {
          const res = await client.query(convertPlaceholdersToPostgres(sql), params);
          return res.rows as R[];
        },
        get: async <R = any>(sql: string, params: any[] = []): Promise<R | null> => {
          const res = await client.query(convertPlaceholdersToPostgres(sql), params);
          return res.rows.length > 0 ? (res.rows[0] as R) : null;
        },
        run: async (sql: string, params: any[] = []) => {
          const res = await client.query(convertPlaceholdersToPostgres(sql), params);
          return { changes: res.rowCount ?? 0 };
        },
        exec: async (sql: string) => {
          await client.query(sql);
        },
        transaction: async () => {
          throw new Error("Nested transactions are not supported directly.");
        },
        isPostgres: () => true,
        close: async () => {},
      };
      const result = await fn(txClient);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// -------------------------------------------------------------
// 3. Schema Initialization & Multi-Tenant Setup
// -------------------------------------------------------------
export async function initializeSchema(client: IDatabaseClient): Promise<void> {
  // Multi-Tenant Core Tables
  await client.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
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
      created_at TEXT NOT NULL
    );
  `);

  // Application Tables
  await client.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      organization_id TEXT DEFAULT 'default_org',
      branch_id TEXT DEFAULT 'default_branch',
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      serial TEXT UNIQUE NOT NULL,
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
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS diagnostic_reports (
      device_id TEXT PRIMARY KEY,
      report_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_inspections (
      device_id TEXT PRIMARY KEY,
      checks_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_photos (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS warranty_claims (
      id TEXT PRIMARY KEY,
      organization_id TEXT DEFAULT 'default_org',
      branch_id TEXT DEFAULT 'default_branch',
      device_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_contact TEXT NOT NULL,
      issue_description TEXT NOT NULL,
      tracking_token TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      priority TEXT NOT NULL DEFAULT 'Normal',
      assignee_id TEXT,
      assigned_at TEXT,
      due_at TEXT,
      service_cost_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      resolution_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS claim_photos (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS claim_events (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS claim_internal_notes (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shop_settings (
      id TEXT PRIMARY KEY,
      shop_name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      contact_number TEXT NOT NULL,
      email TEXT NOT NULL,
      address TEXT NOT NULL,
      website TEXT NOT NULL,
      warranty_terms TEXT NOT NULL,
      warranty_duration_months INTEGER NOT NULL,
      logo_path TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS staff_users (
      id TEXT PRIMARY KEY,
      organization_id TEXT DEFAULT 'default_org',
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_login_at TEXT
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
      customer_contact TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      sale_date TEXT NOT NULL,
      selling_price_cents INTEGER,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      handover_token TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_finance (
      device_id TEXT PRIMARY KEY,
      purchase_cost_cents INTEGER,
      parts_cost_cents INTEGER NOT NULL DEFAULT 0,
      repair_cost_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      organization_id TEXT DEFAULT 'default_org',
      name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_intakes (
      id TEXT PRIMARY KEY,
      organization_id TEXT DEFAULT 'default_org',
      branch_id TEXT DEFAULT 'default_branch',
      supplier_id TEXT NOT NULL,
      serial TEXT UNIQUE NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      spec_summary TEXT NOT NULL,
      supplier_invoice TEXT NOT NULL,
      purchased_at TEXT NOT NULL,
      purchase_cost_cents INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refurbishment_tasks (
      id TEXT PRIMARY KEY,
      intake_id TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      cost_cents INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      completed_by TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
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

    CREATE TABLE IF NOT EXISTS customer_otps (
      id TEXT PRIMARY KEY,
      phone_normalized TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_sessions (
      id TEXT PRIMARY KEY,
      phone_normalized TEXT NOT NULL,
      customer_name TEXT,
      session_token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS tester_agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_seen_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tester_test_runs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      serial TEXT NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      signature TEXT NOT NULL,
      received_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed Default Organization and Branch if empty
  const orgCount = await client.get<{ count: number }>(
    client.isPostgres()
      ? "SELECT COUNT(*) as count FROM organizations"
      : "SELECT COUNT(*) as count FROM organizations"
  );

  if (!orgCount || Number(orgCount.count) === 0) {
    const now = new Date().toISOString();
    await client.run(
      "INSERT INTO organizations (id, name, slug, logo_url, currency, warranty_policy, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        "default_org",
        "Lapmart Computer Systems",
        "lapmart",
        "/branding/lapmart-logo.png",
        "LKR",
        "Standard 1-Year Limited Hardware Warranty",
        now,
      ]
    );

    await client.run(
      "INSERT INTO branches (id, organization_id, name, code, is_warehouse, address, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        "default_branch",
        "default_org",
        "Main Workshop & Refurbishment Center",
        "HQ-01",
        1,
        "No. 124, High Level Road, Colombo",
        "+94 11 234 5678",
        now,
      ]
    );
  }
}

// -------------------------------------------------------------
// 4. Global Client Singleton
// -------------------------------------------------------------
let globalClient: IDatabaseClient | null = null;

export function getDbClient(): IDatabaseClient {
  if (globalClient) return globalClient;

  const isPostgres = Boolean(
    process.env.DATABASE_URL?.startsWith("postgres://") ||
    process.env.DATABASE_URL?.startsWith("postgresql://") ||
    process.env.DATABASE_DRIVER === "postgres"
  );

  if (isPostgres) {
    globalClient = new PostgresDatabaseClient();
  } else {
    globalClient = new SqliteDatabaseClient();
  }

  return globalClient;
}
