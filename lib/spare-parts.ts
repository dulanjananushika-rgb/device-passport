import { randomUUID } from "node:crypto";
import { getDatabase, recordAuditEvent } from "./database";

export type SparePartCategory =
  | "RAM"
  | "Storage"
  | "Battery"
  | "Display"
  | "Keyboard"
  | "Charger"
  | "Other";

export interface SparePart {
  id: string;
  organizationId: string;
  branchId: string;
  sku: string;
  name: string;
  category: SparePartCategory;
  specifications: string;
  unitCostCents: number;
  quantity: number;
  minAlertQuantity: number;
  supplierId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskPartAllocation {
  id: string;
  taskId: string;
  intakeId: string;
  sparePartId: string;
  partSku: string;
  partName: string;
  quantity: number;
  unitCostCents: number;
  totalCostCents: number;
  allocatedBy: string;
  allocatedAt: string;
}

export interface CreateSparePartInput {
  sku: string;
  name: string;
  category: SparePartCategory;
  specifications?: string;
  unitCostCents: number;
  quantity?: number;
  minAlertQuantity?: number;
  supplierId?: string;
  branchId?: string;
  organizationId?: string;
}

type SparePartRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  sku: string;
  name: string;
  category: SparePartCategory;
  specifications: string;
  unit_cost_cents: number;
  quantity: number;
  min_alert_quantity: number;
  supplier_id: string | null;
  created_at: string;
  updated_at: string;
};

function rowToSparePart(row: SparePartRow): SparePart {
  return {
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    specifications: row.specifications || "",
    unitCostCents: row.unit_cost_cents,
    quantity: row.quantity,
    minAlertQuantity: row.min_alert_quantity,
    supplierId: row.supplier_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSparePart(input: CreateSparePartInput, actor: string): SparePart {
  const db = getDatabase();
  const id = `part_${randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();
  const sku = input.sku.trim().toUpperCase();
  const name = input.name.trim();

  if (!sku) throw new Error("Spare part SKU is required.");
  if (!name) throw new Error("Spare part name is required.");
  if (input.unitCostCents < 0) throw new Error("Unit cost cannot be negative.");

  db.prepare(`
    INSERT INTO spare_parts (
      id, organization_id, branch_id, sku, name, category,
      specifications, unit_cost_cents, quantity, min_alert_quantity,
      supplier_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.organizationId || "default_org",
    input.branchId || "default_branch",
    sku,
    name,
    input.category,
    input.specifications || "",
    input.unitCostCents,
    input.quantity || 0,
    input.minAlertQuantity ?? 2,
    input.supplierId || null,
    now,
    now
  );

  recordAuditEvent(actor, "spare_part.created", `Created spare part ${sku} (${name}) with initial stock ${input.quantity || 0}.`);
  return getSparePart(id)!;
}

export function getSparePart(idOrSku: string): SparePart | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT * FROM spare_parts
    WHERE id = ? OR sku = ?
  `).get(idOrSku, idOrSku.toUpperCase()) as SparePartRow | undefined;

  return row ? rowToSparePart(row) : null;
}

export function listSpareParts(filter?: { category?: string; branchId?: string; lowStockOnly?: boolean }): SparePart[] {
  const db = getDatabase();
  let sql = "SELECT * FROM spare_parts WHERE 1=1";
  const params: any[] = [];

  if (filter?.category) {
    sql += " AND category = ?";
    params.push(filter.category);
  }
  if (filter?.branchId) {
    sql += " AND branch_id = ?";
    params.push(filter.branchId);
  }
  if (filter?.lowStockOnly) {
    sql += " AND quantity <= min_alert_quantity";
  }

  sql += " ORDER BY category ASC, name ASC";
  const rows = db.prepare(sql).all(...params) as unknown as SparePartRow[];
  return rows.map(rowToSparePart);
}

export function adjustSparePartStock(id: string, deltaQuantity: number, reason: string, actor: string): SparePart {
  const db = getDatabase();
  const part = getSparePart(id);
  if (!part) throw new Error("Spare part not found.");

  const newQuantity = part.quantity + deltaQuantity;
  if (newQuantity < 0) {
    throw new Error(`Insufficient stock. Current quantity is ${part.quantity}, cannot reduce by ${Math.abs(deltaQuantity)}.`);
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE spare_parts
    SET quantity = ?, updated_at = ?
    WHERE id = ?
  `).run(newQuantity, now, part.id);

  recordAuditEvent(
    actor,
    "spare_part.stock_adjusted",
    `Adjusted stock for ${part.sku} (${part.name}): ${part.quantity} -> ${newQuantity} (Delta: ${deltaQuantity > 0 ? `+${deltaQuantity}` : deltaQuantity}). Reason: ${reason}`
  );

  return getSparePart(id)!;
}

/**
 * Allocates a spare part from stock directly to a refurbishment task.
 * Atomically decrements stock and links part cost into the device's refurbishment accounting.
 */
export function allocatePartToTask(
  taskId: string,
  intakeId: string,
  partId: string,
  quantity: number,
  actor: string
): TaskPartAllocation {
  const db = getDatabase();
  if (quantity <= 0) throw new Error("Allocated quantity must be at least 1.");

  db.exec("BEGIN");
  try {
    const part = db.prepare("SELECT * FROM spare_parts WHERE id = ?").get(partId) as SparePartRow | undefined;
    if (!part) throw new Error("Spare part not found.");

    if (part.quantity < quantity) {
      throw new Error(`Insufficient stock for ${part.sku}. Available: ${part.quantity}, requested: ${quantity}.`);
    }

    const allocationId = `alloc_${randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    const totalCostCents = part.unit_cost_cents * quantity;

    // 1. Decrement part inventory
    db.prepare(`
      UPDATE spare_parts
      SET quantity = quantity - ?, updated_at = ?
      WHERE id = ?
    `).run(quantity, now, partId);

    // 2. Record allocation record
    db.prepare(`
      INSERT INTO task_part_allocations (
        id, task_id, intake_id, spare_part_id, quantity,
        unit_cost_cents, total_cost_cents, allocated_by, allocated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(allocationId, taskId, intakeId, partId, quantity, part.unit_cost_cents, totalCostCents, actor, now);

    // 3. Update refurbishment task cost
    db.prepare(`
      UPDATE refurbishment_tasks
      SET cost_cents = cost_cents + ?, updated_at = ?
      WHERE id = ?
    `).run(totalCostCents, now, taskId);

    // 4. Update device_finance parts_cost_cents if device already linked
    const intake = db.prepare("SELECT serial FROM stock_intakes WHERE id = ?").get(intakeId) as { serial: string } | undefined;
    if (intake?.serial) {
      const device = db.prepare("SELECT id FROM devices WHERE serial = ?").get(intake.serial) as { id: string } | undefined;
      if (device?.id) {
        db.prepare(`
          INSERT INTO device_finance (device_id, purchase_cost_cents, refurbishment_cost_cents, parts_cost_cents, repair_cost_cents, updated_by, updated_at)
          VALUES (?, 0, 0, ?, 0, ?, ?)
          ON CONFLICT(device_id) DO UPDATE SET
            parts_cost_cents = parts_cost_cents + excluded.parts_cost_cents,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
        `).run(device.id, totalCostCents, actor, now);
      }
    }

    db.exec("COMMIT");

    recordAuditEvent(
      actor,
      "refurbishment.part_allocated",
      `Allocated ${quantity}x ${part.sku} (${part.name}) to task ${taskId} on intake ${intakeId}. Total cost: ${totalCostCents} cents.`
    );

    return {
      id: allocationId,
      taskId,
      intakeId,
      sparePartId: partId,
      partSku: part.sku,
      partName: part.name,
      quantity,
      unitCostCents: part.unit_cost_cents,
      totalCostCents,
      allocatedBy: actor,
      allocatedAt: now,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listTaskPartAllocations(intakeId: string): TaskPartAllocation[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT a.*, p.sku as part_sku, p.name as part_name
    FROM task_part_allocations a
    JOIN spare_parts p ON p.id = a.spare_part_id
    WHERE a.intake_id = ?
    ORDER BY a.allocated_at DESC
  `).all(intakeId) as Array<{
    id: string;
    task_id: string;
    intake_id: string;
    spare_part_id: string;
    part_sku: string;
    part_name: string;
    quantity: number;
    unit_cost_cents: number;
    total_cost_cents: number;
    allocated_by: string;
    allocated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    taskId: r.task_id,
    intakeId: r.intake_id,
    sparePartId: r.spare_part_id,
    partSku: r.part_sku,
    partName: r.part_name,
    quantity: r.quantity,
    unitCostCents: r.unit_cost_cents,
    totalCostCents: r.total_cost_cents,
    allocatedBy: r.allocated_by,
    allocatedAt: r.allocated_at,
  }));
}
