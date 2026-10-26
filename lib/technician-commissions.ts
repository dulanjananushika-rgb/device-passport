import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "./database";
import { formatMinorUnitsToLkr } from "./finance";

export type { TechnicianCommissionItem, TechnicianPayoutSummary } from "./operations";
import type { TechnicianCommissionItem, TechnicianPayoutSummary } from "./operations";

export const defaultCommissionRates = {
  inspectionCents: 35000, // LKR 350 per diagnostic inspection
  cleanRepasteCents: 50000, // LKR 500 per clean & repaste
  partReplacementCents: 50000, // LKR 500 per component swap (RAM/SSD/Battery)
  boardRepairCents: 150000, // LKR 1,500 per board-level repair
};

/**
 * Calculates monthly or date-range piece-rate commissions and workload summaries for shop technicians.
 */
export function calculateTechnicianCommissions(
  technicianName?: string,
  startDate?: string,
  endDate?: string,
  database?: DatabaseSync
): TechnicianPayoutSummary[] {
  const db = database || getDatabase();
  const start = startDate || "2000-01-01";
  const end = endDate || "2099-12-31";

  // 1. Fetch all technicians (from staff or devices tested)
  let techQuery = `SELECT DISTINCT technician FROM devices WHERE technician != ''`;
  const techParams: string[] = [];
  if (technicianName) {
    techQuery += ` AND LOWER(technician) = LOWER(?)`;
    techParams.push(technicianName);
  }
  const techRows = db.prepare(techQuery).all(...techParams) as Array<{ technician: string }>;
  const technicians = Array.from(new Set(techRows.map((r) => r.technician).filter(Boolean)));

  if (technicians.length === 0 && technicianName) {
    technicians.push(technicianName);
  }

  const summaries: TechnicianPayoutSummary[] = [];

  for (const tech of technicians) {
    const items: TechnicianCommissionItem[] = [];

    // A. Tested / Inspected Devices
    const devices = db.prepare(`
      SELECT id, name, model, serial, tested_at, status
      FROM devices
      WHERE LOWER(technician) = LOWER(?) AND tested_at >= ? AND tested_at <= ?
      ORDER BY tested_at DESC
    `).all(tech, start, end) as any[];

    let inspectionsCompleted = 0;
    let inspectionsCommissionCents = 0;

    for (const d of devices) {
      inspectionsCompleted++;
      inspectionsCommissionCents += defaultCommissionRates.inspectionCents;
      items.push({
        id: `INS-${d.id}`,
        type: "Diagnostic Inspection",
        deviceId: d.id,
        deviceName: d.name,
        serial: d.serial,
        description: `Full hardware audit & benchmarking (${d.model})`,
        completedAt: d.tested_at,
        commissionCents: defaultCommissionRates.inspectionCents,
        formattedCommission: formatMinorUnitsToLkr(defaultCommissionRates.inspectionCents),
      });
    }

    // B. Completed Refurbishment Tasks
    const tasks = db.prepare(`
      SELECT t.*, i.device_name, i.serial, i.device_id
      FROM refurbishment_tasks t
      JOIN stock_intakes i ON i.id = t.intake_id
      WHERE t.completed = 1 AND LOWER(t.completed_by) = LOWER(?)
        AND t.completed_at >= ? AND t.completed_at <= ?
      ORDER BY t.completed_at DESC
    `).all(tech, start, end) as any[];

    let tasksCompleted = 0;
    let tasksCommissionCents = 0;

    for (const t of tasks) {
      tasksCompleted++;
      let rate = defaultCommissionRates.cleanRepasteCents;
      if (t.category === "Board Repair" || t.category === "Motherboard") {
        rate = defaultCommissionRates.boardRepairCents;
      } else if (t.category === "Component" || t.category === "Upgrade") {
        rate = defaultCommissionRates.partReplacementCents;
      }

      tasksCommissionCents += rate;
      items.push({
        id: `TSK-${t.id}`,
        type: "Refurbishment Task",
        deviceId: t.device_id || t.intake_id,
        deviceName: t.device_name,
        serial: t.serial,
        description: `${t.category}: ${t.description}`,
        completedAt: t.completed_at,
        commissionCents: rate,
        formattedCommission: formatMinorUnitsToLkr(rate),
      });
    }

    const totalCommissionCents = inspectionsCommissionCents + tasksCommissionCents;

    summaries.push({
      technicianName: tech,
      period: `${start} to ${end}`,
      inspectionsCompleted,
      inspectionsCommissionCents,
      tasksCompleted,
      tasksCommissionCents,
      totalCommissionCents,
      formattedTotalCommission: formatMinorUnitsToLkr(totalCommissionCents),
      items,
    });
  }

  return summaries;
}
