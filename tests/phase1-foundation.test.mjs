import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { rmSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  SqliteDatabaseClient,
  convertPlaceholdersToPostgres,
  initializeSchema,
} from "../lib/db-client.ts";
import { StorageService } from "../lib/storage.ts";
import {
  getDatabase,
  listOrganizations,
  getOrganization,
  listBranches,
} from "../lib/database.ts";

const testDbPath = path.join(process.cwd(), ".data", "test-phase1.db");

test.beforeEach(() => {
  if (existsSync(testDbPath)) {
    rmSync(testDbPath, { force: true });
  }
});

test.afterEach(() => {
  if (existsSync(testDbPath)) {
    rmSync(testDbPath, { force: true });
  }
});

// -------------------------------------------------------------
// Test 1: Parameter Conversion for PostgreSQL Driver
// -------------------------------------------------------------
test("convertPlaceholdersToPostgres converts ? to $1, $2, $3 accurately", () => {
  const sql = "SELECT * FROM devices WHERE id = ? AND score >= ? AND model = ?";
  const converted = convertPlaceholdersToPostgres(sql);
  assert.equal(converted, "SELECT * FROM devices WHERE id = $1 AND score >= $2 AND model = $3");
});

test("convertPlaceholdersToPostgres preserves ? inside string literals", () => {
  const sql = "SELECT * FROM claims WHERE note LIKE '%broken screen?%' AND status = ?";
  const converted = convertPlaceholdersToPostgres(sql);
  assert.equal(converted, "SELECT * FROM claims WHERE note LIKE '%broken screen?%' AND status = $1");
});

// -------------------------------------------------------------
// Test 2: Dual-Driver SQLite Client Operations & Transactions
// -------------------------------------------------------------
test("SqliteDatabaseClient creates tables and executes CRUD queries", async () => {
  const client = new SqliteDatabaseClient(testDbPath);
  await initializeSchema(client);

  const orgId = `org_${randomUUID().slice(0, 8)}`;
  await client.run(
    "INSERT INTO organizations (id, name, slug, currency, created_at) VALUES (?, ?, ?, ?, ?)",
    [orgId, "Apex Refurbished Labs", "apex-labs", "USD", new Date().toISOString()]
  );

  const org = await client.get("SELECT * FROM organizations WHERE id = ?", [orgId]);
  assert.ok(org, "Organization should be retrieved");
  assert.equal(org.name, "Apex Refurbished Labs");
  assert.equal(org.currency, "USD");

  // Test Transaction Rollback
  let errorCaught = false;
  try {
    await client.transaction(async (tx) => {
      await tx.run("INSERT INTO organizations (id, name, slug, currency, created_at) VALUES (?, ?, ?, ?, ?)", [
        "tx_org_1", "Tx Org", "tx-org", "EUR", new Date().toISOString()
      ]);
      throw new Error("Forced rollback test");
    });
  } catch {
    errorCaught = true;
  }
  assert.ok(errorCaught, "Transaction must fail and catch error");

  const rolledBackOrg = await client.get("SELECT * FROM organizations WHERE id = ?", ["tx_org_1"]);
  assert.equal(rolledBackOrg, null, "Rolled back transaction must not persist data");

  await client.close();
});

// -------------------------------------------------------------
// Test 3: Multi-Tenant Organization & Branch Auto-Seed
// -------------------------------------------------------------
test("initializeSchema auto-seeds default Lapmart organization and HQ branch", async () => {
  const client = new SqliteDatabaseClient(testDbPath);
  await initializeSchema(client);

  const defaultOrg = await client.get("SELECT * FROM organizations WHERE id = ?", ["default_org"]);
  assert.ok(defaultOrg, "Default organization must exist");
  assert.equal(defaultOrg.slug, "lapmart");
  assert.equal(defaultOrg.currency, "LKR");

  const defaultBranch = await client.get("SELECT * FROM branches WHERE id = ?", ["default_branch"]);
  assert.ok(defaultBranch, "Default branch must exist");
  assert.equal(defaultBranch.is_warehouse, 1);
  assert.equal(defaultBranch.code, "HQ-01");

  await client.close();
});

// -------------------------------------------------------------
// Test 4: Storage Service Local Fallback Operations
// -------------------------------------------------------------
test("StorageService local fallback saves files and generates accessible URLs", async () => {
  const storage = new StorageService();
  assert.equal(storage.getProvider(), "local", "Should default to local provider when cloud env is unset");

  const testContent = Buffer.from("DevicePassport Mock Diagnostic Image Evidence");
  const result = await storage.uploadFile({
    buffer: testContent,
    filename: "test-evidence.png",
    mimeType: "image/png",
    folder: "inspections",
  });

  assert.ok(result.url.startsWith("/api/uploads/"), "Local URL must start with /api/uploads/");
  assert.ok(result.key.startsWith("inspections/"), "Storage key must include folder prefix");

  const presigned = await storage.getPresignedUploadUrl("customer-receipt.pdf", "application/pdf");
  assert.ok(presigned.uploadUrl, "Presigned upload URL must be returned");
  assert.ok(presigned.key.startsWith("evidence/"), "Default folder must be evidence");

  const deleted = await storage.deleteFile(result.key);
  assert.ok(deleted, "Uploaded file must be deleted successfully");
});

// -------------------------------------------------------------
// Test 5: Legacy Compatibility with Core Database Module
// -------------------------------------------------------------
test("Legacy lib/database.ts exports listOrganizations and listBranches seamlessly", () => {
  getDatabase(); // initialize core
  const orgs = listOrganizations();
  assert.ok(orgs.length >= 1, "Must list at least default organization");

  const branches = listBranches();
  assert.ok(branches.length >= 1, "Must list at least default branch");
  assert.equal(branches[0].is_warehouse, 1);

  const found = getOrganization("default_org");
  assert.ok(found, "Must find organization by ID");
});
