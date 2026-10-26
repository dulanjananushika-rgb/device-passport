import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabase, getShopSettings } from "./database";
import { formatMinorUnitsToLkr, parseLkrToCents } from "./finance";

export interface DeviceReservation {
  id: string;
  deviceId: string;
  deviceName: string;
  model: string;
  serial: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  advanceCents: number;
  formattedAdvance: string;
  heldUntil: string;
  status: "Active" | "Fulfilled" | "Cancelled" | "Expired";
  paymentMethod: string;
  paymentReference: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  advanceLkr: string;
  heldDays?: number;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
}

export function ensureReservationSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_reservations (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      advance_cents INTEGER NOT NULL DEFAULT 0,
      held_until TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      payment_reference TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reservations_device ON device_reservations(device_id, status);
    CREATE INDEX IF NOT EXISTS idx_reservations_phone ON device_reservations(customer_phone);
  `);
}

export function createReservation(
  deviceId: string,
  input: ReservationInput,
  actor: string,
  database?: DatabaseSync
): DeviceReservation {
  const db = database || getDatabase();
  ensureReservationSchema(db);

  const device = db.prepare("SELECT id, name, model, serial, status FROM devices WHERE id = ?").get(deviceId) as any;
  if (!device) throw new Error("Device not found.");
  if (device.status !== "Published") throw new Error("Only published stock ready for sale can be reserved.");

  const sale = db.prepare("SELECT device_id FROM device_sales WHERE device_id = ?").get(deviceId);
  if (sale) throw new Error("This device has already been sold.");

  const activeRes = db.prepare("SELECT id FROM device_reservations WHERE device_id = ? AND status = 'Active'").get(deviceId);
  if (activeRes) throw new Error("This device is already reserved by another customer.");

  const customerName = (input.customerName || "").trim();
  const customerPhone = (input.customerPhone || "").trim();
  const customerEmail = (input.customerEmail || "").trim().toLowerCase();
  if (!customerName || customerName.length < 2) throw new Error("Customer name is required.");
  if (!customerPhone || customerPhone.length < 7) throw new Error("A valid customer phone number is required.");

  const advanceCents = parseLkrToCents(input.advanceLkr, "Advance deposit", false);
  if (advanceCents <= 0) throw new Error("Advance deposit must be greater than zero.");

  const heldDays = input.heldDays && input.heldDays > 0 ? Math.min(input.heldDays, 14) : 3;
  const now = new Date();
  const heldUntilDate = new Date(now.getTime() + heldDays * 86_400_000);
  const heldUntil = heldUntilDate.toISOString().slice(0, 10);
  const nowIso = now.toISOString();

  const id = `RES-${randomUUID().slice(0, 8).toUpperCase()}`;
  const paymentMethod = input.paymentMethod || "Cash";
  const paymentReference = (input.paymentReference || "").trim();
  const notes = (input.notes || "").trim();

  db.prepare(`
    INSERT INTO device_reservations (
      id, device_id, customer_name, customer_phone, customer_email,
      advance_cents, held_until, status, payment_method, payment_reference,
      notes, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?)
  `).run(
    id, deviceId, customerName, customerPhone, customerEmail,
    advanceCents, heldUntil, paymentMethod, paymentReference,
    notes, actor, nowIso, nowIso
  );

  return {
    id,
    deviceId: device.id,
    deviceName: device.name,
    model: device.model,
    serial: device.serial,
    customerName,
    customerPhone,
    customerEmail,
    advanceCents,
    formattedAdvance: formatMinorUnitsToLkr(advanceCents),
    heldUntil,
    status: "Active",
    paymentMethod,
    paymentReference,
    notes,
    createdBy: actor,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function getActiveReservationForDevice(deviceId: string, database?: DatabaseSync): DeviceReservation | null {
  const db = database || getDatabase();
  ensureReservationSchema(db);

  const row = db.prepare(`
    SELECT r.*, d.name as dev_name, d.model, d.serial
    FROM device_reservations r
    JOIN devices d ON d.id = r.device_id
    WHERE r.device_id = ? AND r.status = 'Active'
    LIMIT 1
  `).get(deviceId) as any;

  if (!row) return null;

  return {
    id: row.id,
    deviceId: row.device_id,
    deviceName: row.dev_name,
    model: row.model,
    serial: row.serial,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email || "",
    advanceCents: row.advance_cents,
    formattedAdvance: formatMinorUnitsToLkr(row.advance_cents),
    heldUntil: row.held_until,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function cancelReservation(reservationId: string, actor: string, reason = "Cancelled by staff", database?: DatabaseSync): boolean {
  const db = database || getDatabase();
  ensureReservationSchema(db);
  const now = new Date().toISOString();
  const res = db.prepare("SELECT * FROM device_reservations WHERE id = ?").get(reservationId) as any;
  if (!res) return false;

  const note = res.notes ? `${res.notes} | Cancelled by ${actor}: ${reason}` : `Cancelled by ${actor}: ${reason}`;
  db.prepare("UPDATE device_reservations SET status = 'Cancelled', notes = ?, updated_at = ? WHERE id = ?").run(note, now, reservationId);
  return true;
}

export function fulfillReservation(reservationId: string, database?: DatabaseSync): boolean {
  const db = database || getDatabase();
  ensureReservationSchema(db);
  const now = new Date().toISOString();
  db.prepare("UPDATE device_reservations SET status = 'Fulfilled', updated_at = ? WHERE id = ?").run(now, reservationId);
  return true;
}

export function listReservations(status = "Active", database?: DatabaseSync): DeviceReservation[] {
  const db = database || getDatabase();
  ensureReservationSchema(db);

  let query = `
    SELECT r.*, d.name as dev_name, d.model, d.serial
    FROM device_reservations r
    JOIN devices d ON d.id = r.device_id
  `;
  const params: string[] = [];
  if (status !== "All") {
    query += " WHERE r.status = ?";
    params.push(status);
  }
  query += " ORDER BY r.created_at DESC";

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((row) => ({
    id: row.id,
    deviceId: row.device_id,
    deviceName: row.dev_name,
    model: row.model,
    serial: row.serial,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email || "",
    advanceCents: row.advance_cents,
    formattedAdvance: formatMinorUnitsToLkr(row.advance_cents),
    heldUntil: row.held_until,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function generateReservationReceiptHtml(reservationId: string, database?: DatabaseSync): string {
  const db = database || getDatabase();
  ensureReservationSchema(db);

  const row = db.prepare(`
    SELECT r.*, d.name as dev_name, d.model, d.serial, d.memory, d.storage, d.processor
    FROM device_reservations r
    JOIN devices d ON d.id = r.device_id
    WHERE r.id = ?
  `).get(reservationId) as any;

  if (!row) throw new Error("Reservation not found.");

  const settings = getShopSettings();
  const formattedAdvance = formatMinorUnitsToLkr(row.advance_cents);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Advance Booking - ${row.id}</title>
  <style>
    @page { size: auto; margin: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      color: #000;
      background: #fff;
      margin: 0 auto;
      padding: 10px 4px;
      max-width: 72mm;
      font-size: 13px;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .line { border-top: 1px dashed #000; margin: 6px 0; }
    .double-line { border-top: 2px solid #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
  </style>
</head>
<body onload="window.print()">
  <div class="center">
    <div class="bold" style="font-size: 1.2em;">${settings.shopName}</div>
    <div>${settings.tagline}</div>
    <div>${settings.address}</div>
    <div>Tel: ${settings.phone}</div>
  </div>

  <div class="double-line"></div>
  <div class="center bold">CUSTOMER ADVANCE RECEIPT</div>
  <div class="center">STOCK RESERVATION VOUCHER</div>
  <div class="line"></div>

  <div class="row"><span>Booking Ref:</span><span class="bold">${row.id}</span></div>
  <div class="row"><span>Date:</span><span>${row.created_at.slice(0, 10)}</span></div>
  <div class="row"><span>Customer:</span><span class="bold">${row.customer_name}</span></div>
  <div class="row"><span>Phone:</span><span>${row.customer_phone}</span></div>

  <div class="line"></div>
  <div class="bold">RESERVED LAPTOP:</div>
  <div>${row.dev_name}</div>
  <div class="row"><span>Serial:</span><span class="bold">${row.serial}</span></div>
  <div class="row"><span>Spec:</span><span>${row.processor} | ${row.memory}</span></div>

  <div class="double-line"></div>
  <div class="row bold" style="font-size: 1.15em;">
    <span>ADVANCE PAID:</span>
    <span>${formattedAdvance}</span>
  </div>
  <div class="row"><span>Tender:</span><span>${row.payment_method}</span></div>
  ${row.payment_reference ? `<div class="row"><span>Ref #:</span><span>${row.payment_reference}</span></div>` : ""}
  <div class="double-line"></div>

  <div class="center" style="margin: 8px 0; padding: 6px; border: 1px solid #000;">
    <div class="bold">HOLD VALID UNTIL:</div>
    <div class="bold" style="font-size: 1.2em; color: #000;">${row.held_until}</div>
    <div style="font-size: 0.85em; margin-top: 4px;">Please present this receipt when paying the remaining balance.</div>
  </div>

  <div class="line"></div>
  <div class="center" style="font-size: 0.8em;">
    <div>Advance payments are non-refundable after the hold deadline.</div>
    <div style="margin-top: 6px;">Thank you for trusting ${settings.shopName}!</div>
  </div>
</body>
</html>`;
}
