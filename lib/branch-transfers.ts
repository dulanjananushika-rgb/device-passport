import { randomUUID } from "node:crypto";
import { getDatabase, recordAuditEvent } from "./database";
import { getSparePart, createSparePart } from "./spare-parts";

export type TransferEntityType = "device" | "spare_part";
export type TransferStatus = "Dispatched" | "Received" | "Cancelled";

export interface StockTransfer {
  id: string;
  organizationId: string;
  trackingNumber: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  entityType: TransferEntityType;
  entityId: string;
  quantity: number;
  status: TransferStatus;
  dispatchedBy: string;
  dispatchedAt: string;
  receivedBy: string | null;
  receivedAt: string | null;
  notes: string;
}

export interface CreateTransferInput {
  fromBranchId: string;
  toBranchId: string;
  entityType: TransferEntityType;
  entityId: string; // Serial for device, or Part ID/SKU for spare part
  quantity?: number;
  notes?: string;
  organizationId?: string;
}

type TransferRow = {
  id: string;
  organization_id: string;
  tracking_number: string;
  from_branch_id: string;
  from_branch_name: string;
  to_branch_id: string;
  to_branch_name: string;
  entity_type: TransferEntityType;
  entity_id: string;
  quantity: number;
  status: TransferStatus;
  dispatched_by: string;
  dispatched_at: string;
  received_by: string | null;
  received_at: string | null;
  notes: string;
};

function rowToTransfer(r: TransferRow): StockTransfer {
  return {
    id: r.id,
    organizationId: r.organization_id,
    trackingNumber: r.tracking_number,
    fromBranchId: r.from_branch_id,
    fromBranchName: r.from_branch_name || r.from_branch_id,
    toBranchId: r.to_branch_id,
    toBranchName: r.to_branch_name || r.to_branch_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    quantity: r.quantity,
    status: r.status,
    dispatchedBy: r.dispatched_by,
    dispatchedAt: r.dispatched_at,
    receivedBy: r.received_by,
    receivedAt: r.received_at,
    notes: r.notes || "",
  };
}

export function createStockTransfer(input: CreateTransferInput, actor: string): StockTransfer {
  const db = getDatabase();
  if (input.fromBranchId === input.toBranchId) {
    throw new Error("Origin and destination branches must be different.");
  }

  const quantity = input.quantity ?? 1;
  if (quantity <= 0) throw new Error("Transfer quantity must be at least 1.");

  const id = `trf_${randomUUID().slice(0, 12)}`;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const trackingNumber = `TRF-${dateStr}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const now = new Date().toISOString();

  db.exec("BEGIN");
  try {
    if (input.entityType === "device") {
      // Validate device exists
      const intake = db.prepare("SELECT id, serial, branch_id FROM stock_intakes WHERE serial = ?").get(input.entityId) as any;
      if (!intake) {
        throw new Error(`Device with serial ${input.entityId} not found in inventory.`);
      }
    } else if (input.entityType === "spare_part") {
      // Validate spare part exists and has sufficient stock at origin
      const part = db.prepare("SELECT * FROM spare_parts WHERE id = ? OR sku = ?").get(input.entityId, input.entityId) as any;
      if (!part) {
        throw new Error(`Spare part ${input.entityId} not found.`);
      }
      if (part.quantity < quantity) {
        throw new Error(`Insufficient stock for ${part.sku} at origin. Available: ${part.quantity}, Requested: ${quantity}.`);
      }

      // Deduct from origin branch immediately
      db.prepare("UPDATE spare_parts SET quantity = quantity - ?, updated_at = ? WHERE id = ?").run(quantity, now, part.id);
    }

    db.prepare(`
      INSERT INTO stock_transfers (
        id, organization_id, tracking_number, from_branch_id, to_branch_id,
        entity_type, entity_id, quantity, status, dispatched_by, dispatched_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Dispatched', ?, ?, ?)
    `).run(
      id,
      input.organizationId || "default_org",
      trackingNumber,
      input.fromBranchId,
      input.toBranchId,
      input.entityType,
      input.entityId,
      quantity,
      actor,
      now,
      input.notes || ""
    );

    db.exec("COMMIT");
    recordAuditEvent(actor, "transfer.dispatched", `Dispatched ${quantity}x ${input.entityType} (${input.entityId}) under tracking ${trackingNumber}.`);

    return getStockTransfer(id)!;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function receiveStockTransfer(transferId: string, actor: string): StockTransfer {
  const db = getDatabase();
  const transfer = getStockTransfer(transferId);
  if (!transfer) throw new Error("Stock transfer not found.");
  if (transfer.status !== "Dispatched") {
    throw new Error(`Transfer is already ${transfer.status.toLowerCase()}.`);
  }

  const now = new Date().toISOString();

  db.exec("BEGIN");
  try {
    if (transfer.entityType === "device") {
      // Move device and intake to destination branch
      db.prepare("UPDATE stock_intakes SET branch_id = ?, updated_at = ? WHERE serial = ?").run(transfer.toBranchId, now, transfer.entityId);
      db.prepare("UPDATE devices SET branch_id = ? WHERE serial = ?").run(transfer.toBranchId, transfer.entityId);
    } else if (transfer.entityType === "spare_part") {
      // Find or create part record at destination branch
      const originPart = db.prepare("SELECT * FROM spare_parts WHERE id = ? OR sku = ?").get(transfer.entityId, transfer.entityId) as any;
      if (originPart) {
        const destPart = db.prepare("SELECT id FROM spare_parts WHERE sku = ? AND branch_id = ?").get(originPart.sku, transfer.toBranchId) as any;
        if (destPart) {
          db.prepare("UPDATE spare_parts SET quantity = quantity + ?, updated_at = ? WHERE id = ?").run(transfer.quantity, now, destPart.id);
        } else {
          // Create new record for this SKU at destination branch
          const newPartId = `part_${randomUUID().slice(0, 12)}`;
          db.prepare(`
            INSERT INTO spare_parts (
              id, organization_id, branch_id, sku, name, category,
              specifications, unit_cost_cents, quantity, min_alert_quantity,
              supplier_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newPartId,
            originPart.organization_id,
            transfer.toBranchId,
            originPart.sku,
            originPart.name,
            originPart.category,
            originPart.specifications,
            originPart.unit_cost_cents,
            transfer.quantity,
            originPart.min_alert_quantity,
            originPart.supplier_id,
            now,
            now
          );
        }
      }
    }

    db.prepare(`
      UPDATE stock_transfers
      SET status = 'Received', received_by = ?, received_at = ?
      WHERE id = ?
    `).run(actor, now, transferId);

    db.exec("COMMIT");
    recordAuditEvent(actor, "transfer.received", `Received transfer ${transfer.trackingNumber} at branch ${transfer.toBranchId}.`);

    return getStockTransfer(transferId)!;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getStockTransfer(idOrTracking: string): StockTransfer | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      t.*,
      b1.name as from_branch_name,
      b2.name as to_branch_name
    FROM stock_transfers t
    LEFT JOIN branches b1 ON b1.id = t.from_branch_id
    LEFT JOIN branches b2 ON b2.id = t.to_branch_id
    WHERE t.id = ? OR t.tracking_number = ?
  `).get(idOrTracking, idOrTracking.toUpperCase()) as TransferRow | undefined;

  return row ? rowToTransfer(row) : null;
}

export function listStockTransfers(filter?: { branchId?: string; status?: TransferStatus }): StockTransfer[] {
  const db = getDatabase();
  let sql = `
    SELECT
      t.*,
      b1.name as from_branch_name,
      b2.name as to_branch_name
    FROM stock_transfers t
    LEFT JOIN branches b1 ON b1.id = t.from_branch_id
    LEFT JOIN branches b2 ON b2.id = t.to_branch_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filter?.branchId) {
    sql += " AND (t.from_branch_id = ? OR t.to_branch_id = ?)";
    params.push(filter.branchId, filter.branchId);
  }
  if (filter?.status) {
    sql += " AND t.status = ?";
    params.push(filter.status);
  }

  sql += " ORDER BY t.dispatched_at DESC";
  const rows = db.prepare(sql).all(...params) as unknown as TransferRow[];
  return rows.map(rowToTransfer);
}
