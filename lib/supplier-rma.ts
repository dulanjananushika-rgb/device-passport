import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "./database";
import { formatMinorUnitsToLkr, parseLkrToCents } from "./finance";

export { rmaStatuses, type RmaStatus, type SupplierRmaRecord } from "./procurement-types";
import { rmaStatuses, type RmaStatus, type SupplierRmaRecord } from "./procurement-types";

export interface SupplierRmaInput {
  supplierId: string;
  rmaNumber?: string;
  itemType: "Spare Part" | "Device / Laptop";
  itemName: string;
  serial: string;
  faultDescription: string;
  dispatchedAt?: string;
  notes?: string;
}

export interface UpdateRmaInput {
  status: RmaStatus;
  creditLkr?: string;
  replacementSerial?: string;
  notes?: string;
}

export function ensureRmaSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_rmas (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      rma_number TEXT NOT NULL UNIQUE,
      item_type TEXT NOT NULL,
      item_name TEXT NOT NULL,
      serial TEXT NOT NULL,
      fault_description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Dispatched',
      dispatched_at TEXT NOT NULL,
      resolved_at TEXT,
      credit_amount_cents INTEGER NOT NULL DEFAULT 0,
      replacement_serial TEXT,
      notes TEXT NOT NULL DEFAULT '',
      handled_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rmas_supplier ON supplier_rmas(supplier_id, status);
    CREATE INDEX IF NOT EXISTS idx_rmas_serial ON supplier_rmas(serial);
  `);
}

export function createSupplierRma(
  input: SupplierRmaInput,
  actor: string,
  database?: DatabaseSync
): SupplierRmaRecord {
  const db = database || getDatabase();
  ensureRmaSchema(db);

  const supplier = db.prepare("SELECT id, name FROM suppliers WHERE id = ?").get(input.supplierId) as any;
  if (!supplier) throw new Error("Supplier not found.");

  const itemName = (input.itemName || "").trim();
  const serial = (input.serial || "").trim();
  const faultDescription = (input.faultDescription || "").trim();

  if (!itemName || itemName.length < 2) throw new Error("Item name is required.");
  if (!serial || serial.length < 2) throw new Error("Serial number is required.");
  if (!faultDescription || faultDescription.length < 4) throw new Error("Fault description is required.");

  const now = new Date().toISOString();
  const today = input.dispatchedAt || now.slice(0, 10);
  const rmaNumber = input.rmaNumber?.trim() || `RMA-${now.slice(2, 10).replace(/-/g, "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
  const id = `RMA-${randomUUID().slice(0, 8).toUpperCase()}`;

  db.prepare(`
    INSERT INTO supplier_rmas (
      id, supplier_id, rma_number, item_type, item_name, serial,
      fault_description, status, dispatched_at, resolved_at, credit_amount_cents,
      replacement_serial, notes, handled_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Dispatched', ?, NULL, 0, NULL, ?, ?, ?, ?)
  `).run(
    id,
    supplier.id,
    rmaNumber,
    input.itemType,
    itemName,
    serial,
    faultDescription,
    today,
    input.notes || "",
    actor,
    now,
    now
  );

  return {
    id,
    supplierId: supplier.id,
    supplierName: supplier.name,
    rmaNumber,
    itemType: input.itemType,
    itemName,
    serial,
    faultDescription,
    status: "Dispatched",
    dispatchedAt: today,
    resolvedAt: null,
    creditAmountCents: 0,
    formattedCredit: "LKR 0.00",
    replacementSerial: null,
    notes: input.notes || "",
    handledBy: actor,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateSupplierRmaStatus(
  rmaId: string,
  input: UpdateRmaInput,
  actor: string,
  database?: DatabaseSync
): SupplierRmaRecord {
  const db = database || getDatabase();
  ensureRmaSchema(db);

  const existing = db.prepare("SELECT * FROM supplier_rmas WHERE id = ?").get(rmaId) as any;
  if (!existing) throw new Error("RMA record not found.");

  const now = new Date().toISOString();
  let creditAmountCents = existing.credit_amount_cents;
  if (input.creditLkr) {
    creditAmountCents = parseLkrToCents(input.creditLkr, "Credit note amount", true);
  }

  const isResolved = ["Replaced", "Credit Note Issued", "Rejected"].includes(input.status);
  const resolvedAt = isResolved ? now.slice(0, 10) : existing.resolved_at;
  const replacementSerial = input.replacementSerial?.trim() || existing.replacement_serial;
  const notes = input.notes !== undefined ? input.notes.trim() : existing.notes;

  db.prepare(`
    UPDATE supplier_rmas
    SET status = ?, resolved_at = ?, credit_amount_cents = ?, replacement_serial = ?, notes = ?, handled_by = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.status,
    resolvedAt,
    creditAmountCents,
    replacementSerial,
    notes,
    actor,
    now,
    rmaId
  );

  const updated = db.prepare(`
    SELECT r.*, s.name as supplier_name
    FROM supplier_rmas r
    JOIN suppliers s ON s.id = r.supplier_id
    WHERE r.id = ?
  `).get(rmaId) as any;

  return {
    id: updated.id,
    supplierId: updated.supplier_id,
    supplierName: updated.supplier_name,
    rmaNumber: updated.rma_number,
    itemType: updated.item_type,
    itemName: updated.item_name,
    serial: updated.serial,
    faultDescription: updated.fault_description,
    status: updated.status,
    dispatchedAt: updated.dispatched_at,
    resolvedAt: updated.resolved_at,
    creditAmountCents: updated.credit_amount_cents,
    formattedCredit: formatMinorUnitsToLkr(updated.credit_amount_cents),
    replacementSerial: updated.replacement_serial,
    notes: updated.notes,
    handledBy: updated.handled_by,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  };
}

export function listSupplierRmas(
  filter?: { supplierId?: string; status?: string },
  database?: DatabaseSync
): SupplierRmaRecord[] {
  const db = database || getDatabase();
  ensureRmaSchema(db);

  let query = `
    SELECT r.*, s.name as supplier_name
    FROM supplier_rmas r
    JOIN suppliers s ON s.id = r.supplier_id
  `;
  const conditions: string[] = [];
  const params: string[] = [];

  if (filter?.supplierId) {
    conditions.push("r.supplier_id = ?");
    params.push(filter.supplierId);
  }
  if (filter?.status && filter.status !== "All") {
    conditions.push("r.status = ?");
    params.push(filter.status);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }
  query += " ORDER BY r.created_at DESC";

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((r) => ({
    id: r.id,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    rmaNumber: r.rma_number,
    itemType: r.item_type,
    itemName: r.item_name,
    serial: r.serial,
    faultDescription: r.fault_description,
    status: r.status,
    dispatchedAt: r.dispatched_at,
    resolvedAt: r.resolved_at,
    creditAmountCents: r.credit_amount_cents,
    formattedCredit: formatMinorUnitsToLkr(r.credit_amount_cents),
    replacementSerial: r.replacement_serial,
    notes: r.notes,
    handledBy: r.handled_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getRmaMetrics(database?: DatabaseSync) {
  const db = database || getDatabase();
  ensureRmaSchema(db);

  const total = (db.prepare("SELECT COUNT(*) as c FROM supplier_rmas").get() as any)?.c || 0;
  const pending = (db.prepare("SELECT COUNT(*) as c FROM supplier_rmas WHERE status IN ('Dispatched', 'Under Review')").get() as any)?.c || 0;
  const resolved = (db.prepare("SELECT COUNT(*) as c FROM supplier_rmas WHERE status IN ('Replaced', 'Credit Note Issued')").get() as any)?.c || 0;
  const creditRow = db.prepare("SELECT COALESCE(SUM(credit_amount_cents), 0) as total FROM supplier_rmas").get() as any;
  const creditCents = creditRow?.total || 0;

  return {
    totalCount: total,
    pendingCount: pending,
    resolvedCount: resolved,
    totalCreditCents: creditCents,
    formattedCredit: formatMinorUnitsToLkr(creditCents),
  };
}
