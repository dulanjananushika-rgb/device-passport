import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import QRCode from "qrcode";
import { getDatabase, getShopSettings, recordAuditEvent } from "./database";
import { formatCurrency, formatMinorUnitsToLkr, parseCurrencyAmountToCents } from "./finance";
import { LEGAL_DISCLAIMERS } from "./international-standards";

export * from "./repair-types";
import {
  repairStatuses,
  type RepairStatus,
  type CustomerRepairJob,
  type CreateRepairInput,
  type UpdateRepairInput,
} from "./repair-types";

export function ensureRepairsSchema(database?: DatabaseSync) {
  const db = database || getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_repairs (
      id TEXT PRIMARY KEY,
      job_number TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      device_brand TEXT NOT NULL,
      device_model TEXT NOT NULL,
      serial TEXT NOT NULL DEFAULT '',
      device_password_pin TEXT NOT NULL DEFAULT '',
      accessories_received TEXT NOT NULL DEFAULT '',
      reported_fault TEXT NOT NULL,
      physical_condition TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Received',
      assigned_technician TEXT NOT NULL DEFAULT '',
      technician_notes TEXT NOT NULL DEFAULT '',
      estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
      advance_paid_cents INTEGER NOT NULL DEFAULT 0,
      parts_cost_cents INTEGER NOT NULL DEFAULT 0,
      labor_fee_cents INTEGER NOT NULL DEFAULT 0,
      total_amount_cents INTEGER NOT NULL DEFAULT 0,
      received_at TEXT NOT NULL,
      completed_at TEXT,
      delivered_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_repairs_phone ON customer_repairs(customer_phone);
    CREATE INDEX IF NOT EXISTS idx_repairs_status ON customer_repairs(status);
  `);
}

function rowToRepair(r: any): CustomerRepairJob {
  const parts = r.parts_cost_cents || 0;
  const labor = r.labor_fee_cents || 0;
  let total = r.total_amount_cents || 0;
  if (total === 0 && (parts > 0 || labor > 0)) {
    total = parts + labor;
  }
  const advance = r.advance_paid_cents || 0;
  const balance = Math.max(0, total - advance);

  let sym = "$";
  let pos: "prefix" | "suffix" = "prefix";
  try {
    const s = getShopSettings();
    if (s.currencySymbol) sym = s.currencySymbol;
    if (s.currencyPosition === "suffix") pos = "suffix";
  } catch {}

  const fmt = (c: number) => formatCurrency(c, { symbol: sym, position: pos });

  return {
    id: r.id,
    jobNumber: r.job_number,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    customerEmail: r.customer_email || "",
    deviceBrand: r.device_brand,
    deviceModel: r.device_model,
    serial: r.serial || "N/A",
    devicePasswordPin: r.device_password_pin || "",
    accessoriesReceived: r.accessories_received || "",
    reportedFault: r.reported_fault,
    physicalCondition: r.physical_condition || "",
    status: r.status as RepairStatus,
    assignedTechnician: r.assigned_technician || "",
    technicianNotes: r.technician_notes || "",
    estimatedCostCents: r.estimated_cost_cents || 0,
    advancePaidCents: advance,
    partsCostCents: parts,
    laborFeeCents: labor,
    totalAmountCents: total,
    balanceDueCents: balance,
    formattedTotalAmount: fmt(total),
    formattedBalanceDue: fmt(balance),
    formattedAdvancePaid: fmt(advance),
    receivedAt: r.received_at,
    completedAt: r.completed_at,
    deliveredAt: r.delivered_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createCustomerRepairJob(
  input: CreateRepairInput,
  actor: string,
  database?: DatabaseSync
): CustomerRepairJob {
  const db = database || getDatabase();
  ensureRepairsSchema(db);

  const customerName = (input.customerName || "").trim();
  const customerPhone = (input.customerPhone || "").trim();
  const deviceBrand = (input.deviceBrand || "").trim();
  const deviceModel = (input.deviceModel || "").trim();
  const reportedFault = (input.reportedFault || "").trim();

  if (!customerName || customerName.length < 2) throw new Error("Customer name is required.");
  if (!customerPhone || customerPhone.length < 9) throw new Error("Valid customer phone number is required.");
  if (!deviceBrand || !deviceModel) throw new Error("Laptop brand and model are required.");
  if (!reportedFault || reportedFault.length < 3) throw new Error("Reported fault description is required.");

  const now = new Date().toISOString();
  const dateNum = now.slice(2, 10).replace(/-/g, "");
  const randomSuffix = randomUUID().slice(0, 4).toUpperCase();
  const id = `REP-${randomUUID().slice(0, 8).toUpperCase()}`;
  const jobNumber = `JOB-${dateNum}-${randomSuffix}`;

  const estimatedCostCents = input.estimatedCostLkr ? parseCurrencyAmountToCents(input.estimatedCostLkr, "Estimated cost") : 0;
  const advancePaidCents = input.advancePaidLkr ? parseCurrencyAmountToCents(input.advancePaidLkr, "Advance paid") : 0;

  db.prepare(`
    INSERT INTO customer_repairs (
      id, job_number, customer_name, customer_phone, customer_email,
      device_brand, device_model, serial, device_password_pin, accessories_received,
      reported_fault, physical_condition, status, assigned_technician, technician_notes,
      estimated_cost_cents, advance_paid_cents, parts_cost_cents, labor_fee_cents, total_amount_cents,
      received_at, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, 'Received', ?, '',
      ?, ?, 0, 0, ?,
      ?, ?, ?, ?
    )
  `).run(
    id,
    jobNumber,
    customerName,
    customerPhone,
    input.customerEmail?.trim() || "",
    deviceBrand,
    deviceModel,
    input.serial?.trim() || "",
    input.devicePasswordPin?.trim() || "",
    input.accessoriesReceived?.trim() || "Unit Only",
    reportedFault,
    input.physicalCondition?.trim() || "Normal wear & tear",
    input.assignedTechnician?.trim() || "",
    estimatedCostCents,
    advancePaidCents,
    estimatedCostCents,
    now,
    actor,
    now,
    now
  );

  recordAuditEvent(
    actor,
    "repair.created",
    `Created repair job ${jobNumber} for ${customerName} (${deviceBrand} ${deviceModel}). Fault: ${reportedFault}.`
  );

  return getCustomerRepairJob(id, db)!;
}

export function updateCustomerRepairJob(
  id: string,
  input: UpdateRepairInput,
  actor: string,
  database?: DatabaseSync
): CustomerRepairJob {
  const db = database || getDatabase();
  ensureRepairsSchema(db);

  const existing = db.prepare("SELECT * FROM customer_repairs WHERE id = ?").get(id) as any;
  if (!existing) throw new Error("Repair job not found.");

  const now = new Date().toISOString();
  let status = (input.status || existing.status) as RepairStatus;
  let assignedTechnician = input.assignedTechnician !== undefined ? input.assignedTechnician.trim() : existing.assigned_technician;
  let technicianNotes = input.technicianNotes !== undefined ? input.technicianNotes.trim() : existing.technician_notes;
  let accessoriesReceived = input.accessoriesReceived !== undefined ? input.accessoriesReceived.trim() : existing.accessories_received;

  let partsCostCents = existing.parts_cost_cents;
  if (input.partsCostLkr !== undefined) {
    partsCostCents = parseCurrencyAmountToCents(input.partsCostLkr, "Parts cost");
  }

  let laborFeeCents = existing.labor_fee_cents;
  if (input.laborFeeLkr !== undefined) {
    laborFeeCents = parseCurrencyAmountToCents(input.laborFeeLkr, "Labor fee");
  }

  let advancePaidCents = existing.advance_paid_cents;
  if (input.advancePaidLkr !== undefined) {
    advancePaidCents = parseCurrencyAmountToCents(input.advancePaidLkr, "Advance paid");
  }

  const totalAmountCents = partsCostCents + laborFeeCents;

  let completedAt = existing.completed_at;
  let deliveredAt = existing.delivered_at;

  if (status === "Completed / Ready" && !completedAt) {
    completedAt = now;
  }
  if (status === "Delivered" && !deliveredAt) {
    deliveredAt = now;
    if (!completedAt) completedAt = now;
  }

  db.prepare(`
    UPDATE customer_repairs SET
      status = ?,
      assigned_technician = ?,
      technician_notes = ?,
      accessories_received = ?,
      parts_cost_cents = ?,
      labor_fee_cents = ?,
      total_amount_cents = ?,
      advance_paid_cents = ?,
      completed_at = ?,
      delivered_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    status,
    assignedTechnician,
    technicianNotes,
    accessoriesReceived,
    partsCostCents,
    laborFeeCents,
    totalAmountCents,
    advancePaidCents,
    completedAt,
    deliveredAt,
    now,
    id
  );

  recordAuditEvent(
    actor,
    "repair.updated",
    `Updated repair job ${existing.job_number} status to ${status} (Total: ${formatMinorUnitsToLkr(totalAmountCents)}).`
  );

  return getCustomerRepairJob(id, db)!;
}

export function getCustomerRepairJob(id: string, database?: DatabaseSync): CustomerRepairJob | null {
  const db = database || getDatabase();
  ensureRepairsSchema(db);

  const row = db.prepare("SELECT * FROM customer_repairs WHERE id = ? OR job_number = ?").get(id, id) as any;
  return row ? rowToRepair(row) : null;
}

export function listCustomerRepairJobs(
  filter?: { status?: string; phone?: string; technician?: string },
  database?: DatabaseSync
): CustomerRepairJob[] {
  const db = database || getDatabase();
  ensureRepairsSchema(db);

  let sql = "SELECT * FROM customer_repairs WHERE 1=1";
  const params: any[] = [];

  if (filter?.status && filter.status !== "All") {
    sql += " AND status = ?";
    params.push(filter.status);
  }
  if (filter?.phone) {
    sql += " AND customer_phone LIKE ?";
    params.push(`%${filter.phone.replace(/\D/g, "")}%`);
  }
  if (filter?.technician) {
    sql += " AND LOWER(assigned_technician) = LOWER(?)";
    params.push(filter.technician);
  }

  sql += " ORDER BY created_at DESC";
  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(rowToRepair);
}

/**
 * Generates an 80mm ESC/POS Thermal Intake Job Sheet Slip to hand over to the customer.
 */
export async function generateRepairJobSheetHtml(
  repairId: string,
  origin = "http://localhost:3000",
  database?: DatabaseSync
): Promise<string> {
  const job = getCustomerRepairJob(repairId, database);
  if (!job) throw new Error("Repair job not found.");
  const settings = getShopSettings();

  const qrDataUrl = await QRCode.toDataURL(`${origin}/claim/${job.jobNumber}`, {
    margin: 1,
    width: 140,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Job Sheet - ${job.jobNumber}</title>
  <style>
    @page { size: auto; margin: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      color: #000;
      background: #fff;
      margin: 0 auto;
      padding: 10px 4px;
      max-width: 76mm;
      font-size: 13px;
      line-height: 1.25;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .line { border-top: 1px dashed #000; margin: 6px 0; }
    .double-line { border-top: 2px solid #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    .qr-box { text-align: center; margin: 10px 0; }
    .qr-box img { width: 130px; height: 130px; }
    .terms { font-size: 10px; line-height: 1.2; text-align: justify; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="center bold" style="font-size: 1.25em;">${settings.shopName}</div>
  <div class="center">${settings.address}</div>
  <div class="center">Tel: ${settings.phone}</div>
  <div class="double-line"></div>

  <div class="center bold" style="font-size: 1.1em;">*** CUSTOMER REPAIR INTAKE ***</div>
  <div class="center">OFFICIAL SERVICE JOB SHEET</div>
  <div class="line"></div>

  <div class="row"><span>Job No:</span><span class="bold" style="font-size: 1.1em;">${job.jobNumber}</span></div>
  <div class="row"><span>Date Received:</span><span>${job.receivedAt.slice(0, 10)}</span></div>
  <div class="row"><span>Status:</span><span class="bold">${job.status}</span></div>

  <div class="line"></div>
  <div class="bold">CUSTOMER DETAILS:</div>
  <div class="row"><span>Name:</span><span class="bold">${job.customerName}</span></div>
  <div class="row"><span>Phone:</span><span>${job.customerPhone}</span></div>

  <div class="line"></div>
  <div class="bold">DEVICE SPECIFICATIONS:</div>
  <div class="row"><span>Brand / Model:</span><span class="bold">${job.deviceBrand} ${job.deviceModel}</span></div>
  <div class="row"><span>Serial No:</span><span>${job.serial}</span></div>
  <div class="row"><span>Pass / PIN:</span><span>${job.devicePasswordPin || "None"}</span></div>
  <div class="row"><span>Accessories:</span><span>${job.accessoriesReceived}</span></div>
  <div class="row"><span>Physical State:</span><span>${job.physicalCondition}</span></div>

  <div class="line"></div>
  <div class="bold">REPORTED FAULT:</div>
  <div style="font-size: 12px; margin: 4px 0; background: #eee; padding: 4px; border: 1px solid #ccc;">
    ${job.reportedFault}
  </div>

  <div class="line"></div>
  <div class="row"><span>Estimated Cost:</span><span class="bold">${formatMinorUnitsToLkr(job.estimatedCostCents)}</span></div>
  <div class="row"><span>Advance Paid:</span><span class="bold">${job.formattedAdvancePaid}</span></div>

  <div class="qr-box">
    <img src="${qrDataUrl}" alt="Scan QR"/>
    <div style="font-size: 11px;">Scan to check live repair progress</div>
  </div>

  <div class="double-line"></div>
  <div class="bold">SERVICE TERMS & CONDITIONS:</div>
  <div class="terms">
    1. Backup all important data. The shop is not liable for data loss during hardware repair.<br/>
    2. Estimated costs are subject to change if secondary faults are identified during chip-level diagnostics.<br/>
    3. Uncollected devices after 45 days from repair completion notice may be auctioned to recover workshop costs.<br/>
    4. 30-day checking warranty applies only to the specific part or board repair performed.<br/>
    5. Tamper-evident seals are affixed solely to verify warranty authenticity and technician service integrity in accordance with consumer rights laws.
  </div>

  <div style="margin-top: 24px; display: flex; justify-content: space-between; font-size: 11px;">
    <div>__________________<br/>Customer Signature</div>
    <div style="text-align: right;">__________________<br/>Authorized Officer</div>
  </div>
</body>
</html>`;
}

/**
 * Generates an A4 or 80mm Customer Repair Tax Invoice on completion.
 */
export async function generateRepairInvoiceHtml(
  repairId: string,
  origin = "http://localhost:3000",
  database?: DatabaseSync
): Promise<string> {
  const job = getCustomerRepairJob(repairId, database);
  if (!job) throw new Error("Repair job not found.");
  const settings = getShopSettings();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Repair Invoice - ${job.jobNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 24px; }
    .shop-title { font-size: 24px; font-weight: 800; color: #0284c7; }
    .badge { background: #10b981; color: #fff; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #f8fafc; border-bottom: 2px solid #cbd5e1; padding: 10px; text-align: left; }
    td { border-bottom: 1px solid #e2e8f0; padding: 10px; }
    .total-box { margin-left: auto; width: 320px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="shop-title">${settings.shopName}</div>
      <div style="font-size: 13px; color: #64748b;">${settings.address} | Tel: ${settings.phone}</div>
      ${settings.taxId ? `<div style="font-size: 13px; color: #0284c7; font-weight: bold;">TIN / VAT: ${settings.taxId}</div>` : ""}
    </div>
    <div style="text-align: right;">
      <div style="font-size: 20px; font-weight: 800; color: #0f172a;">SERVICE INVOICE</div>
      <div style="font-size: 14px; font-weight: 700; color: #0284c7;">#${job.jobNumber}</div>
      <div style="font-size: 12px; color: #64748b;">Delivered: ${job.deliveredAt ? job.deliveredAt.slice(0, 10) : new Date().toISOString().slice(0, 10)}</div>
      <div style="margin-top: 6px;"><span class="badge">${job.status}</span></div>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
    <div style="background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
      <strong style="font-size: 13px; color: #64748b; text-transform: uppercase;">Customer:</strong>
      <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 2px;">${job.customerName}</div>
      <div style="font-size: 13px; color: #475569;">${job.customerPhone} ${job.customerEmail ? `| ${job.customerEmail}` : ""}</div>
    </div>
    <div style="background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
      <strong style="font-size: 13px; color: #64748b; text-transform: uppercase;">Serviced Device:</strong>
      <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 2px;">${job.deviceBrand} ${job.deviceModel}</div>
      <div style="font-size: 13px; color: #475569;">Serial: ${job.serial} | Tech: ${job.assignedTechnician || "Lead Workshop"}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Service / Item Description</th>
        <th style="text-align: right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <strong>Hardware Replacement Parts</strong>
          <div style="font-size: 12px; color: #64748b;">Components and materials utilized during repair</div>
        </td>
        <td style="text-align: right; font-weight: 600;">${formatCurrency(job.partsCostCents, { symbol: settings.currencySymbol || '$', position: (settings.currencyPosition as any) || 'prefix' })}</td>
      </tr>
      <tr>
        <td>
          <strong>Technician Labor & Chip-Level Diagnostics</strong>
          <div style="font-size: 12px; color: #64748b;">${job.technicianNotes || job.reportedFault}</div>
        </td>
        <td style="text-align: right; font-weight: 600;">${formatCurrency(job.laborFeeCents, { symbol: settings.currencySymbol || '$', position: (settings.currencyPosition as any) || 'prefix' })}</td>
      </tr>
    </tbody>
  </table>

  <div class="total-box">
    <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px;">
      <span>Total Service Charge:</span>
      <strong>${job.formattedTotalAmount}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 14px; color: #059669; margin-bottom: 6px;">
      <span>Less Advance Paid:</span>
      <span>- ${job.formattedAdvancePaid}</span>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; border-top: 2px solid #cbd5e1; padding-top: 8px; color: #0284c7;">
      <span>Balance Paid / Settled:</span>
      <span>${job.formattedBalanceDue}</span>
    </div>
  </div>

  <div style="margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 12px; color: #64748b; text-align: center;">
    Thank you for choosing ${settings.shopName}! 30-day hardware checking warranty provided on replaced components.
  </div>
</body>
</html>`;
}
