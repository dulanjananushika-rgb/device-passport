import { randomUUID } from "node:crypto";
import { getDatabase, recordAuditEvent } from "./database";
import { procurementStatuses, refurbishmentCategories, type ProcurementDashboard, type ProcurementStatus, type RefurbishmentCategory, type RefurbishmentTask, type StockIntake, type Supplier, type SupplierPerformance } from "./procurement-types";

export { procurementStatuses, refurbishmentCategories } from "./procurement-types";
export type { ProcurementDashboard, ProcurementStatus, RefurbishmentCategory, RefurbishmentTask, StockIntake, Supplier, SupplierPerformance } from "./procurement-types";

type IntakeRow = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  device_id: string | null;
  device_name: string;
  model: string;
  serial: string;
  supplier_invoice: string;
  purchased_at: string;
  purchase_cost_cents: number;
  stored_status: ProcurementStatus;
  notes: string;
  device_status: "Published" | "Needs review" | "Draft" | null;
  sold_at: string | null;
  sale_price_cents: number;
  base_refurbishment_cost_cents: number;
  task_cost_cents: number;
  open_task_count: number;
  warranty_cost_cents: number;
  claim_count: number;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: string;
  category: RefurbishmentCategory;
  description: string;
  cost_cents: number;
  completed: number;
  created_by: string;
  completed_by: string;
  created_at: string;
  completed_at: string;
};

const intakeSelectSql = `
  SELECT i.id, i.supplier_id, p.name AS supplier_name, i.device_id, i.device_name, i.model, i.serial,
    i.supplier_invoice, i.purchased_at, i.purchase_cost_cents, i.status AS stored_status, i.notes,
    d.status AS device_status, s.sold_at, COALESCE(s.sale_price_cents, 0) AS sale_price_cents,
    COALESCE(f.refurbishment_cost_cents, 0) AS base_refurbishment_cost_cents,
    COALESCE((SELECT SUM(t.cost_cents) FROM refurbishment_tasks t WHERE t.intake_id = i.id), 0) AS task_cost_cents,
    (SELECT COUNT(*) FROM refurbishment_tasks t WHERE t.intake_id = i.id AND t.completed = 0) AS open_task_count,
    COALESCE((SELECT SUM(c.service_cost_cents) FROM warranty_claims c WHERE c.device_id = i.device_id), 0) AS warranty_cost_cents,
    (SELECT COUNT(*) FROM warranty_claims c WHERE c.device_id = i.device_id) AS claim_count,
    i.created_at, i.updated_at
  FROM stock_intakes i
  JOIN suppliers p ON p.id = i.supplier_id
  LEFT JOIN devices d ON d.id = i.device_id
  LEFT JOIN device_sales s ON s.device_id = i.device_id
  LEFT JOIN device_finance f ON f.device_id = i.device_id
`;

function effectiveStatus(row: IntakeRow): ProcurementStatus {
  if (row.stored_status === "Archived") return "Archived";
  if (row.sold_at) return "Sold";
  if (row.open_task_count > 0) return "In refurbishment";
  if (row.device_id && row.device_status === "Published") return "Ready";
  if (row.device_id) return "In refurbishment";
  return row.stored_status;
}

function ageInDays(date: string) {
  const value = Date.parse(`${date}T12:00:00.000Z`);
  return Number.isFinite(value) ? Math.max(0, Math.floor((Date.now() - value) / 86_400_000)) : 0;
}

function listTasks(intakeId: string): RefurbishmentTask[] {
  const rows = getDatabase().prepare("SELECT id, category, description, cost_cents, completed, created_by, completed_by, created_at, completed_at FROM refurbishment_tasks WHERE intake_id = ? ORDER BY completed, created_at, id").all(intakeId) as unknown as TaskRow[];
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    description: row.description,
    costCents: row.cost_cents,
    completed: Boolean(row.completed),
    createdBy: row.created_by,
    completedBy: row.completed_by,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }));
}

function rowToIntake(row: IntakeRow, includeFinancials: boolean): StockIntake {
  const status = effectiveStatus(row);
  const refurbishmentCostCents = row.base_refurbishment_cost_cents + row.task_cost_cents;
  const grossProfitCents = row.sold_at ? row.sale_price_cents - row.purchase_cost_cents - refurbishmentCostCents - row.warranty_cost_cents : null;
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    deviceId: row.device_id ?? "",
    deviceName: row.device_name,
    model: row.model,
    serial: row.serial,
    supplierInvoice: row.supplier_invoice,
    purchasedAt: row.purchased_at,
    purchaseCostCents: includeFinancials ? row.purchase_cost_cents : 0,
    refurbishmentCostCents,
    salePriceCents: includeFinancials ? row.sale_price_cents : 0,
    warrantyCostCents: includeFinancials ? row.warranty_cost_cents : 0,
    grossProfitCents: includeFinancials ? grossProfitCents : null,
    status,
    notes: row.notes,
    ageDays: ageInDays(row.purchased_at),
    openTaskCount: row.open_task_count,
    tasks: listTasks(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSuppliers(): Supplier[] {
  const rows = getDatabase().prepare("SELECT id, name, contact_name, email, phone, active, created_at FROM suppliers ORDER BY active DESC, name").all() as Array<{ id: string; name: string; contact_name: string; email: string; phone: string; active: number; created_at: string }>;
  return rows.map((row) => ({ id: row.id, name: row.name, contactName: row.contact_name, email: row.email, phone: row.phone, active: Boolean(row.active), createdAt: row.created_at }));
}

export function getProcurementDashboard(includeFinancials: boolean): ProcurementDashboard {
  const rows = getDatabase().prepare(`${intakeSelectSql} ORDER BY i.purchased_at DESC, i.created_at DESC`).all() as unknown as IntakeRow[];
  const fullIntakes = rows.map((row) => rowToIntake(row, true));
  const intakes = includeFinancials ? fullIntakes : rows.map((row) => rowToIntake(row, false));
  const activeStock = fullIntakes.filter((item) => item.status !== "Sold" && item.status !== "Archived");
  const performanceMap = new Map<string, SupplierPerformance>();
  for (const row of rows) {
    const item = rowToIntake(row, true);
    const current = performanceMap.get(row.supplier_id) ?? {
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      intakes: 0,
      linked: 0,
      sold: 0,
      claims: 0,
      affectedDevices: 0,
      failureRate: 0,
      averagePurchaseCostCents: 0,
      stockValueCents: 0,
      grossProfitCents: 0,
    };
    current.intakes += 1;
    current.linked += item.deviceId ? 1 : 0;
    current.sold += item.status === "Sold" ? 1 : 0;
    current.claims += row.claim_count;
    current.affectedDevices += row.claim_count > 0 ? 1 : 0;
    current.averagePurchaseCostCents += row.purchase_cost_cents;
    if (item.status !== "Sold" && item.status !== "Archived") current.stockValueCents += row.purchase_cost_cents + item.refurbishmentCostCents;
    current.grossProfitCents += item.grossProfitCents ?? 0;
    performanceMap.set(row.supplier_id, current);
  }
  const supplierPerformance = [...performanceMap.values()].map((item) => ({
    ...item,
    failureRate: item.sold ? (item.affectedDevices / item.sold) * 100 : 0,
    averagePurchaseCostCents: includeFinancials && item.intakes ? Math.round(item.averagePurchaseCostCents / item.intakes) : 0,
    stockValueCents: includeFinancials ? item.stockValueCents : 0,
    grossProfitCents: includeFinancials ? item.grossProfitCents : 0,
  })).sort((a, b) => b.intakes - a.intakes || a.supplierName.localeCompare(b.supplierName));

  return {
    generatedAt: new Date().toISOString(),
    financialsVisible: includeFinancials,
    metrics: {
      totalIntakes: fullIntakes.length,
      awaitingTest: fullIntakes.filter((item) => item.status === "Awaiting test").length,
      inRefurbishment: fullIntakes.filter((item) => item.status === "In refurbishment").length,
      ready: fullIntakes.filter((item) => item.status === "Ready").length,
      agedStock: activeStock.filter((item) => item.ageDays >= 90).length,
      openTasks: fullIntakes.reduce((sum, item) => sum + item.openTaskCount, 0),
      inventoryValueCents: includeFinancials ? activeStock.reduce((sum, item) => sum + item.purchaseCostCents + item.refurbishmentCostCents, 0) : 0,
    },
    suppliers: listSuppliers(),
    supplierPerformance,
    intakes,
  };
}

export function findStockIntakeById(id: string) {
  const row = getDatabase().prepare(`${intakeSelectSql} WHERE i.id = ?`).get(id) as unknown as IntakeRow | undefined;
  return row ? rowToIntake(row, true) : null;
}

export function createSupplier(input: { name: string; contactName: string; email: string; phone: string }, actor: string) {
  const name = input.name.trim();
  const contactName = input.contactName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  if (name.length < 2 || name.length > 100) throw new Error("Supplier name must contain 2 to 100 characters.");
  if (contactName.length > 100 || phone.length > 30) throw new Error("Supplier contact details are too long.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid supplier email address.");
  const database = getDatabase();
  if (database.prepare("SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE").get(name)) throw new Error("A supplier with this name already exists.");
  const id = `SUP-${randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  database.prepare("INSERT INTO suppliers (id, name, contact_name, email, phone, active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)")
    .run(id, name, contactName, email, phone, actor, now, now);
  recordAuditEvent(actor, "supplier.created", `Created supplier ${name} (${id}).`);
  return listSuppliers().find((supplier) => supplier.id === id) as Supplier;
}

export function createStockIntake(input: { supplierId: string; deviceName: string; model: string; serial: string; supplierInvoice: string; purchasedAt: string; purchaseCostCents: number; notes: string }, actor: string) {
  const database = getDatabase();
  const supplier = database.prepare("SELECT id FROM suppliers WHERE id = ? AND active = 1").get(input.supplierId);
  if (!supplier) throw new Error("Choose an active supplier.");
  const deviceName = input.deviceName.trim();
  const model = input.model.trim();
  const serial = input.serial.trim();
  const supplierInvoice = input.supplierInvoice.trim();
  const notes = input.notes.trim();
  if (deviceName.length < 2 || deviceName.length > 120) throw new Error("Device name must contain 2 to 120 characters.");
  if (!model || model.length > 100) throw new Error("Model is required and must be 100 characters or fewer.");
  if (serial.length < 3 || serial.length > 100) throw new Error("Serial number must contain 3 to 100 characters.");
  if (supplierInvoice.length < 2 || supplierInvoice.length > 80) throw new Error("Supplier invoice must contain 2 to 80 characters.");
  if (notes.length > 800) throw new Error("Intake notes must be 800 characters or fewer.");
  validateDate(input.purchasedAt, "Purchase date", 10);
  validateMoneyCents(input.purchaseCostCents, "Purchase cost");
  if (database.prepare("SELECT id FROM stock_intakes WHERE serial = ? COLLATE NOCASE").get(serial)) throw new Error("This serial number already exists in stock intake.");
  if (database.prepare("SELECT id FROM devices WHERE serial = ? COLLATE NOCASE").get(serial)) throw new Error("A device passport already exists for this serial number.");
  const now = new Date().toISOString();
  const id = `INT-LK-${now.slice(2, 10).replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
  database.prepare(`
    INSERT INTO stock_intakes (id, supplier_id, device_name, model, serial, supplier_invoice, purchased_at, purchase_cost_cents, status, notes, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Awaiting test', ?, ?, ?, ?)
  `).run(id, input.supplierId, deviceName, model, serial, supplierInvoice, input.purchasedAt, input.purchaseCostCents, notes, actor, now, now);
  recordAuditEvent(actor, "intake.created", `Recorded intake ${id} for serial ${serial}.`);
  return findStockIntakeById(id) as StockIntake;
}

export function updateStockIntake(id: string, input: { status?: ProcurementStatus; notes?: string; purchaseCostCents?: number }, actor: string) {
  const database = getDatabase();
  const current = database.prepare("SELECT id, device_id, status, notes, purchase_cost_cents FROM stock_intakes WHERE id = ?").get(id) as { id: string; device_id: string | null; status: ProcurementStatus; notes: string; purchase_cost_cents: number } | undefined;
  if (!current) throw new Error("Stock intake not found.");
  const status = input.status ?? current.status;
  if (!procurementStatuses.includes(status)) throw new Error("Choose a valid intake status.");
  const notes = input.notes === undefined ? current.notes : input.notes.trim();
  if (notes.length > 800) throw new Error("Intake notes must be 800 characters or fewer.");
  const purchaseCostCents = input.purchaseCostCents ?? current.purchase_cost_cents;
  validateMoneyCents(purchaseCostCents, "Purchase cost");
  const now = new Date().toISOString();
  database.exec("BEGIN");
  try {
    database.prepare("UPDATE stock_intakes SET status = ?, notes = ?, purchase_cost_cents = ?, updated_at = ? WHERE id = ?")
      .run(status, notes, purchaseCostCents, now, id);
    if (current.device_id && purchaseCostCents !== current.purchase_cost_cents) {
      database.prepare("UPDATE device_finance SET purchase_cost_cents = ?, updated_by = ?, updated_at = ? WHERE device_id = ?")
        .run(purchaseCostCents, actor, now, current.device_id);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  recordAuditEvent(actor, "intake.updated", `Updated intake ${id} to ${status}.`);
  return findStockIntakeById(id) as StockIntake;
}

export function createRefurbishmentTask(intakeId: string, input: { category: RefurbishmentCategory; description: string; costCents: number }, actor: string) {
  const database = getDatabase();
  const intake = database.prepare("SELECT id, status FROM stock_intakes WHERE id = ?").get(intakeId) as { id: string; status: ProcurementStatus } | undefined;
  if (!intake) throw new Error("Stock intake not found.");
  const currentIntake = findStockIntakeById(intakeId);
  if (currentIntake?.status === "Archived" || currentIntake?.status === "Sold") throw new Error("Closed intake records cannot receive refurbishment tasks.");
  if (!refurbishmentCategories.includes(input.category)) throw new Error("Choose a valid refurbishment category.");
  const description = input.description.trim();
  if (description.length < 3 || description.length > 240) throw new Error("Task description must contain 3 to 240 characters.");
  validateMoneyCents(input.costCents, "Task cost");
  const id = randomUUID();
  const now = new Date().toISOString();
  database.prepare("INSERT INTO refurbishment_tasks (id, intake_id, category, description, cost_cents, completed, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)")
    .run(id, intakeId, input.category, description, input.costCents, actor, now, now);
  database.prepare("UPDATE stock_intakes SET status = 'In refurbishment', updated_at = ? WHERE id = ?").run(now, intakeId);
  recordAuditEvent(actor, "refurbishment.created", `Added ${input.category.toLowerCase()} task to ${intakeId}.`);
  return (findStockIntakeById(intakeId) as StockIntake).tasks.find((task) => task.id === id) as RefurbishmentTask;
}

export function setRefurbishmentTaskCompleted(taskId: string, completed: boolean, actor: string) {
  const database = getDatabase();
  const task = database.prepare("SELECT id, intake_id FROM refurbishment_tasks WHERE id = ?").get(taskId) as { id: string; intake_id: string } | undefined;
  if (!task) throw new Error("Refurbishment task not found.");
  const now = new Date().toISOString();
  database.prepare("UPDATE refurbishment_tasks SET completed = ?, completed_by = ?, completed_at = ?, updated_at = ? WHERE id = ?")
    .run(completed ? 1 : 0, completed ? actor : "", completed ? now : "", now, taskId);
  recordAuditEvent(actor, "refurbishment.updated", `${completed ? "Completed" : "Reopened"} a task on ${task.intake_id}.`);
  return findStockIntakeById(task.intake_id) as StockIntake;
}

function validateMoneyCents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000_000_000) throw new Error(`${label} is outside the allowed range.`);
}

function validateDate(value: string, label: string, oldestYears: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`Choose a valid ${label.toLowerCase()}.`);
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (date > tomorrow) throw new Error(`${label} cannot be in the future.`);
  const oldest = new Date();
  oldest.setUTCFullYear(oldest.getUTCFullYear() - oldestYears);
  if (date < oldest) throw new Error(`${label} cannot be more than ${oldestYears} years ago.`);
}
