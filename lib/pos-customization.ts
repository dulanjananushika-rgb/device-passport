import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "./database";
import { formatMinorUnitsToLkr } from "./finance";

export interface UpgradePartOption {
  id: string;
  sku: string;
  name: string;
  category: string;
  specifications: string;
  unitCostCents: number;
  formattedCost: string;
  quantity: number;
}

export interface AppliedUpgradeResult {
  appliedParts: Array<{
    id: string;
    name: string;
    category: string;
    costCents: number;
    formattedCost: string;
  }>;
  totalPartsCostCents: number;
  formattedTotalCost: string;
}

/**
 * Lists available in-stock parts suitable for POS customization (RAM, SSD, Battery, etc.)
 */
export function listAvailableUpgrades(branchId?: string): UpgradePartOption[] {
  const db = getDatabase();
  let query = `
    SELECT id, sku, name, category, specifications, unit_cost_cents, quantity
    FROM spare_parts
    WHERE quantity > 0
  `;
  const params: string[] = [];

  if (branchId) {
    query += " AND (branch_id = ? OR branch_id = 'default_branch')";
    params.push(branchId);
  }

  query += " ORDER BY category, name";

  const rows = db.prepare(query).all(...params) as Array<{
    id: string;
    sku: string;
    name: string;
    category: string;
    specifications: string;
    unit_cost_cents: number;
    quantity: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    category: r.category,
    specifications: r.specifications,
    unitCostCents: r.unit_cost_cents,
    formattedCost: formatMinorUnitsToLkr(r.unit_cost_cents),
    quantity: r.quantity,
  }));
}

/**
 * Applies POS hardware upgrades during sale activation:
 * 1. Atomically decrements spare parts stock.
 * 2. Records task part allocations.
 * 3. Updates device finance costs so real realized net profit is preserved.
 */
export function applySaleCustomization(
  deviceId: string,
  upgradePartIds: string[],
  actor: string,
  database?: DatabaseSync
): AppliedUpgradeResult {
  if (!upgradePartIds || upgradePartIds.length === 0) {
    return { appliedParts: [], totalPartsCostCents: 0, formattedTotalCost: "LKR 0.00" };
  }

  const db = database || getDatabase();
  const now = new Date().toISOString();

  // Find linked stock intake if available
  const intakeRow = db.prepare("SELECT id FROM stock_intakes WHERE device_id = ? LIMIT 1").get(deviceId) as { id: string } | undefined;
  const intakeId = intakeRow?.id ?? `SALE-INTAKE-${deviceId}`;

  const appliedParts: AppliedUpgradeResult["appliedParts"] = [];
  let totalPartsCostCents = 0;

  for (const partId of upgradePartIds) {
    if (!partId) continue;
    const part = db.prepare("SELECT * FROM spare_parts WHERE id = ?").get(partId) as any;
    if (!part) {
      throw new Error(`Upgrade spare part '${partId}' not found in inventory.`);
    }
    if (part.quantity < 1) {
      throw new Error(`Upgrade spare part '${part.name}' is out of stock.`);
    }

    // Decrement inventory
    db.prepare("UPDATE spare_parts SET quantity = quantity - 1, updated_at = ? WHERE id = ?").run(now, part.id);

    // Record allocation
    const allocationId = `POS-${randomUUID().slice(0, 8)}`;
    const taskId = `POS-UPGRADE-${deviceId}`;
    db.prepare(`
      INSERT INTO task_part_allocations (
        id, task_id, intake_id, spare_part_id, quantity, unit_cost_cents, total_cost_cents, allocated_by, allocated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(allocationId, taskId, intakeId, part.id, part.unit_cost_cents, part.unit_cost_cents, actor, now);

    totalPartsCostCents += part.unit_cost_cents;
    appliedParts.push({
      id: part.id,
      name: part.name,
      category: part.category,
      costCents: part.unit_cost_cents,
      formattedCost: formatMinorUnitsToLkr(part.unit_cost_cents),
    });
  }

  // Update device finance
  if (totalPartsCostCents > 0) {
    const finance = db.prepare("SELECT * FROM device_finance WHERE device_id = ?").get(deviceId) as any;
    if (finance) {
      const newPartsCost = (finance.parts_cost_cents || 0) + totalPartsCostCents;
      const newRefurbCost = (finance.refurbishment_cost_cents || 0) + totalPartsCostCents;
      db.prepare(`
        UPDATE device_finance
        SET parts_cost_cents = ?, refurbishment_cost_cents = ?, updated_by = ?, updated_at = ?
        WHERE device_id = ?
      `).run(newPartsCost, newRefurbCost, actor, now, deviceId);
    } else {
      db.prepare(`
        INSERT INTO device_finance (device_id, purchase_cost_cents, refurbishment_cost_cents, parts_cost_cents, repair_cost_cents, updated_by, updated_at)
        VALUES (?, 0, ?, ?, 0, ?, ?)
      `).run(deviceId, totalPartsCostCents, totalPartsCostCents, actor, now);
    }
  }

  return {
    appliedParts,
    totalPartsCostCents,
    formattedTotalCost: formatMinorUnitsToLkr(totalPartsCostCents),
  };
}
