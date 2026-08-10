import { getDatabase, recordAuditEvent } from "./database";
import type { DeviceFinanceItem, FinanceAnalytics, ReliabilityMetric, TechnicianMetric } from "./finance";

type FinanceRow = {
  device_id: string;
  device_name: string;
  model: string;
  serial: string;
  score: number;
  status: "Published" | "Needs review" | "Draft";
  sold_at: string | null;
  sale_price_cents: number;
  purchase_cost_cents: number;
  refurbishment_cost_cents: number;
  warranty_cost_cents: number;
  claim_count: number;
  updated_at: string | null;
};

type ClaimPerformanceRow = {
  id: string;
  assigned_to_id: string | null;
  status: string;
  due_date: string;
  created_at: string;
  completed_at: string | null;
};

function lifecycle(row: FinanceRow): DeviceFinanceItem["lifecycleStatus"] {
  return row.sold_at ? "Sold" : row.status === "Published" ? "Ready" : "Draft";
}

function monthKeys(count: number) {
  const result: string[] = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - offset, 1));
    result.push(date.toISOString().slice(0, 7));
  }
  return result;
}

function daysBetween(start: string, end: string) {
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 86_400_000);
}

export function getFinanceAnalytics(): FinanceAnalytics {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT d.id AS device_id, d.name AS device_name, d.model, d.serial, d.score, d.status,
      s.sold_at, COALESCE(s.sale_price_cents, 0) AS sale_price_cents,
      COALESCE(f.purchase_cost_cents, 0) AS purchase_cost_cents,
      COALESCE(f.refurbishment_cost_cents, 0) AS refurbishment_cost_cents,
      COALESCE((SELECT SUM(c.service_cost_cents) FROM warranty_claims c WHERE c.device_id = d.id), 0) AS warranty_cost_cents,
      (SELECT COUNT(*) FROM warranty_claims c WHERE c.device_id = d.id) AS claim_count,
      f.updated_at
    FROM devices d
    LEFT JOIN device_sales s ON s.device_id = d.id
    LEFT JOIN device_finance f ON f.device_id = d.id
    ORDER BY COALESCE(s.sold_at, d.created_at) DESC, d.id DESC
  `).all() as unknown as FinanceRow[];

  const devices: DeviceFinanceItem[] = rows.map((row) => {
    const sold = Boolean(row.sold_at);
    return {
      deviceId: row.device_id,
      deviceName: row.device_name,
      model: row.model,
      serial: row.serial,
      lifecycleStatus: lifecycle(row),
      soldAt: row.sold_at ?? "",
      purchaseCostCents: row.purchase_cost_cents,
      refurbishmentCostCents: row.refurbishment_cost_cents,
      salePriceCents: row.sale_price_cents,
      warrantyCostCents: row.warranty_cost_cents,
      grossProfitCents: sold ? row.sale_price_cents - row.purchase_cost_cents - row.refurbishment_cost_cents - row.warranty_cost_cents : null,
      updatedAt: row.updated_at ?? "",
    };
  });

  const soldDevices = devices.filter((device) => device.lifecycleStatus === "Sold");
  const revenueCents = soldDevices.reduce((sum, device) => sum + device.salePriceCents, 0);
  const realizedCostCents = soldDevices.reduce((sum, device) => sum + device.purchaseCostCents + device.refurbishmentCostCents + device.warrantyCostCents, 0);
  const warrantyCostCents = devices.reduce((sum, device) => sum + device.warrantyCostCents, 0);
  const grossProfitCents = revenueCents - realizedCostCents;
  const inventoryInvestmentCents = devices.filter((device) => device.lifecycleStatus !== "Sold")
    .reduce((sum, device) => sum + device.purchaseCostCents + device.refurbishmentCostCents, 0);

  const claimRows = database.prepare(`
    SELECT c.id, c.assigned_to_id, c.status, c.due_date, c.created_at,
      (SELECT MIN(e.created_at) FROM claim_events e WHERE e.claim_id = c.id AND e.status = 'Completed') AS completed_at
    FROM warranty_claims c
  `).all() as unknown as ClaimPerformanceRow[];
  const affectedSoldDevices = new Set(rows.filter((row) => row.sold_at && row.claim_count > 0).map((row) => row.device_id)).size;
  const completed = claimRows.filter((claim) => claim.completed_at);
  const slaMet = completed.filter((claim) => (claim.completed_at as string).slice(0, 10) <= claim.due_date).length;
  const averageTurnaroundDays = completed.length
    ? completed.reduce((sum, claim) => sum + daysBetween(claim.created_at, claim.completed_at as string), 0) / completed.length
    : null;

  const reliabilityGroups = new Map<string, FinanceRow[]>();
  for (const row of rows) reliabilityGroups.set(row.model, [...(reliabilityGroups.get(row.model) ?? []), row]);
  const reliability: ReliabilityMetric[] = [...reliabilityGroups.entries()].map(([model, group]) => {
    const sold = group.filter((row) => row.sold_at);
    const affectedDevices = sold.filter((row) => row.claim_count > 0).length;
    return {
      model,
      devices: group.length,
      sold: sold.length,
      claims: sold.reduce((sum, row) => sum + row.claim_count, 0),
      affectedDevices,
      claimRate: sold.length ? (affectedDevices / sold.length) * 100 : 0,
      averageHealth: group.reduce((sum, row) => sum + row.score, 0) / group.length,
      warrantyCostCents: sold.reduce((sum, row) => sum + row.warranty_cost_cents, 0),
    };
  }).sort((a, b) => b.sold - a.sold || a.claimRate - b.claimRate || a.model.localeCompare(b.model));

  const monthMap = new Map(monthKeys(6).map((month) => [month, { sales: 0, revenueCents: 0, grossProfitCents: 0 }]));
  for (const device of soldDevices) {
    const key = device.soldAt.slice(0, 7);
    const entry = monthMap.get(key);
    if (!entry) continue;
    entry.sales += 1;
    entry.revenueCents += device.salePriceCents;
    entry.grossProfitCents += device.grossProfitCents ?? 0;
  }
  const monthly = [...monthMap.entries()].map(([month, values]) => ({
    month,
    label: new Date(`${month}-01T12:00:00.000Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
    ...values,
  }));

  const staffRows = database.prepare("SELECT id, name, role FROM staff_users WHERE active = 1 AND role IN ('Owner', 'Technician') ORDER BY role, name").all() as Array<{ id: string; name: string; role: string }>;
  const today = new Date().toISOString().slice(0, 10);
  const technicians: TechnicianMetric[] = staffRows.map((staff) => {
    const assigned = claimRows.filter((claim) => claim.assigned_to_id === staff.id);
    const staffCompleted = assigned.filter((claim) => claim.completed_at);
    return {
      id: staff.id,
      name: staff.name,
      role: staff.role,
      assigned: assigned.length,
      completed: staffCompleted.length,
      open: assigned.filter((claim) => claim.status !== "Completed" && claim.status !== "Rejected").length,
      overdue: assigned.filter((claim) => claim.status !== "Completed" && claim.status !== "Rejected" && claim.due_date < today).length,
      averageTurnaroundDays: staffCompleted.length
        ? staffCompleted.reduce((sum, claim) => sum + daysBetween(claim.created_at, claim.completed_at as string), 0) / staffCompleted.length
        : null,
    };
  }).sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name));

  return {
    generatedAt: new Date().toISOString(),
    metrics: {
      revenueCents,
      realizedCostCents,
      grossProfitCents,
      grossMargin: revenueCents ? (grossProfitCents / revenueCents) * 100 : 0,
      inventoryInvestmentCents,
      warrantyCostCents,
      soldDevices: soldDevices.length,
      claimRate: soldDevices.length ? (affectedSoldDevices / soldDevices.length) * 100 : 0,
      completedClaims: completed.length,
      slaMetRate: completed.length ? (slaMet / completed.length) * 100 : 0,
      averageTurnaroundDays,
    },
    completeness: {
      missingPurchaseCosts: devices.filter((device) => device.purchaseCostCents === 0).length,
      missingSalePrices: soldDevices.filter((device) => device.salePriceCents === 0).length,
      completeSoldRecords: soldDevices.filter((device) => device.salePriceCents > 0 && device.purchaseCostCents > 0).length,
      soldRecords: soldDevices.length,
    },
    monthly,
    reliability,
    technicians,
    devices,
  };
}

export function updateDeviceFinance(deviceId: string, purchaseCostCents: number, refurbishmentCostCents: number, actor: string) {
  const database = getDatabase();
  const device = database.prepare("SELECT id, name FROM devices WHERE lower(id) = lower(?)").get(deviceId) as { id: string; name: string } | undefined;
  if (!device) throw new Error("This device passport could not be found.");
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO device_finance (device_id, purchase_cost_cents, refurbishment_cost_cents, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET purchase_cost_cents = excluded.purchase_cost_cents,
      refurbishment_cost_cents = excluded.refurbishment_cost_cents, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(device.id, purchaseCostCents, refurbishmentCostCents, actor, now);
  recordAuditEvent(actor, "finance.device", `Updated purchase and refurbishment costs for ${device.id}.`);
  return getFinanceAnalytics().devices.find((item) => item.deviceId === device.id) as DeviceFinanceItem;
}

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function financeAnalyticsCsv(analytics = getFinanceAnalytics()) {
  const headers = ["Passport ID", "Device", "Model", "Serial", "Lifecycle", "Sold date", "Purchase cost (LKR)", "Refurbishment cost (LKR)", "Sale price (LKR)", "Warranty cost (LKR)", "Gross profit (LKR)"];
  const rows = analytics.devices.map((device) => [
    device.deviceId,
    device.deviceName,
    device.model,
    device.serial,
    device.lifecycleStatus,
    device.soldAt,
    (device.purchaseCostCents / 100).toFixed(2),
    (device.refurbishmentCostCents / 100).toFixed(2),
    (device.salePriceCents / 100).toFixed(2),
    (device.warrantyCostCents / 100).toFixed(2),
    device.grossProfitCents === null ? "" : (device.grossProfitCents / 100).toFixed(2),
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
