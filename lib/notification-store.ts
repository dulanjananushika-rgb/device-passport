import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDatabase, recordAuditEvent } from "./database";
import type {
  NotificationAction,
  NotificationChannel,
  NotificationItem,
  NotificationSeverity,
  NotificationStatus,
  NotificationType,
} from "./notifications";

type NotificationRow = {
  id: string;
  notification_key: string;
  type: NotificationType;
  severity: NotificationSeverity;
  status: NotificationStatus;
  entity_id: string;
  title: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  device_name: string;
  message: string;
  action_url: string;
  due_date: string;
  created_at: string;
  updated_at: string;
};

type NotificationActionRow = {
  id: string;
  action: string;
  channel: NotificationChannel | "";
  actor: string;
  created_at: string;
};

type NotificationSeed = Omit<NotificationItem, "id" | "status" | "createdAt" | "updatedAt" | "actions">;

type ClaimAlertRow = {
  id: string;
  tracking_token: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  status: string;
  due_date: string;
  device_name: string;
};

type SaleAlertRow = {
  device_id: string;
  device_name: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  warranty_ends: string;
  handover_token: string;
};

type ReadyDeviceRow = {
  id: string;
  name: string;
  created_at: string;
};

function ensureNotificationSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS notification_queue (
      id TEXT PRIMARY KEY,
      notification_key TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      title TEXT NOT NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_email TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      device_name TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      action_url TEXT NOT NULL,
      due_date TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notification_actions (
      id TEXT PRIMARY KEY,
      notification_id TEXT NOT NULL,
      action TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (notification_id) REFERENCES notification_queue(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_notification_actions_notification ON notification_actions(notification_id, created_at);
  `);
}

function publicBaseUrl() {
  const renderUrl = process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : "";
  return (process.env.DEVICEPASSPORT_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || renderUrl || "http://localhost:3000").replace(/\/$/, "");
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function upsertNotification(database: DatabaseSync, seed: NotificationSeed, now: string) {
  database.prepare(`
    INSERT INTO notification_queue (
      id, notification_key, type, severity, status, entity_id, title,
      customer_name, customer_email, customer_phone, device_name,
      message, action_url, due_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(notification_key) DO UPDATE SET
      status = CASE WHEN notification_queue.status = 'Resolved' THEN 'Pending' ELSE notification_queue.status END,
      severity = excluded.severity,
      title = excluded.title,
      customer_name = excluded.customer_name,
      customer_email = excluded.customer_email,
      customer_phone = excluded.customer_phone,
      device_name = excluded.device_name,
      message = excluded.message,
      action_url = excluded.action_url,
      due_date = excluded.due_date,
      updated_at = CASE WHEN notification_queue.status = 'Resolved' THEN excluded.updated_at ELSE notification_queue.updated_at END
  `).run(
    randomUUID(), seed.key, seed.type, seed.severity, seed.entityId, seed.title,
    seed.customerName, seed.customerEmail, seed.customerPhone, seed.deviceName,
    seed.message, seed.actionUrl, seed.dueDate, now, now,
  );
}

export function syncNotificationQueue() {
  const database = getDatabase();
  ensureNotificationSchema(database);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const baseUrl = publicBaseUrl();
  const activeKeys = new Set<string>();

  const claims = database.prepare(`
    SELECT c.id, c.tracking_token, c.customer_name, c.customer_email, c.customer_phone,
      c.status, c.due_date, d.name AS device_name
    FROM warranty_claims c
    JOIN devices d ON d.id = c.device_id
  `).all() as unknown as ClaimAlertRow[];

  for (const claim of claims) {
    if (claim.status === "New") {
      const key = `claim-new:${claim.id}`;
      activeKeys.add(key);
      upsertNotification(database, {
        key,
        type: "NewClaim",
        severity: "Info",
        entityId: claim.id,
        title: `New warranty claim ${claim.id}`,
        customerName: claim.customer_name,
        customerEmail: claim.customer_email,
        customerPhone: claim.customer_phone,
        deviceName: claim.device_name,
        message: `Hi ${claim.customer_name}, we received warranty claim ${claim.id} for your ${claim.device_name}. You can follow every update here: ${baseUrl}/claim/${claim.tracking_token}`,
        actionUrl: `/job-sheet/${claim.id}`,
        dueDate: claim.due_date,
      }, now);
    }

    if (claim.status !== "Completed" && claim.status !== "Rejected" && claim.due_date < today) {
      const key = `claim-overdue:${claim.id}:${claim.due_date}`;
      activeKeys.add(key);
      upsertNotification(database, {
        key,
        type: "ClaimOverdue",
        severity: "Urgent",
        entityId: claim.id,
        title: `Service SLA overdue for ${claim.id}`,
        customerName: claim.customer_name,
        customerEmail: claim.customer_email,
        customerPhone: claim.customer_phone,
        deviceName: claim.device_name,
        message: `Hi ${claim.customer_name}, here is an update on warranty claim ${claim.id} for your ${claim.device_name}. Our service team is following it up. Track the latest progress here: ${baseUrl}/claim/${claim.tracking_token}`,
        actionUrl: `/job-sheet/${claim.id}`,
        dueDate: claim.due_date,
      }, now);
    }
  }

  const sales = database.prepare(`
    SELECT s.device_id, d.name AS device_name, s.customer_name, s.customer_email,
      s.customer_phone, s.warranty_ends, s.handover_token
    FROM device_sales s
    JOIN devices d ON d.id = s.device_id
  `).all() as unknown as SaleAlertRow[];

  for (const sale of sales) {
    const daysRemaining = Math.ceil((Date.parse(`${sale.warranty_ends}T23:59:59.999Z`) - Date.now()) / 86_400_000);
    if (daysRemaining < 0 || daysRemaining > 30) continue;
    const isFinalWeek = daysRemaining <= 7;
    const type: NotificationType = isFinalWeek ? "Warranty7" : "Warranty30";
    const key = `warranty-${isFinalWeek ? "7" : "30"}:${sale.device_id}:${sale.warranty_ends}`;
    activeKeys.add(key);
    upsertNotification(database, {
      key,
      type,
      severity: isFinalWeek ? "Urgent" : "Warning",
      entityId: sale.device_id,
      title: `${sale.device_name} warranty expires ${isFinalWeek ? "this week" : "within 30 days"}`,
      customerName: sale.customer_name,
      customerEmail: sale.customer_email,
      customerPhone: sale.customer_phone,
      deviceName: sale.device_name,
      message: `Hi ${sale.customer_name}, a reminder that the warranty for your ${sale.device_name} ends on ${formatDate(sale.warranty_ends)}. Keep your digital warranty card here: ${baseUrl}/warranty/${sale.handover_token}`,
      actionUrl: `/warranty/${sale.handover_token}`,
      dueDate: sale.warranty_ends,
    }, now);
  }

  const readyDevices = database.prepare(`
    SELECT d.id, d.name, d.created_at
    FROM devices d
    LEFT JOIN device_sales s ON s.device_id = d.id
    WHERE d.status = 'Published' AND s.device_id IS NULL
  `).all() as unknown as ReadyDeviceRow[];

  for (const device of readyDevices) {
    const key = `ready-device:${device.id}`;
    activeKeys.add(key);
    upsertNotification(database, {
      key,
      type: "ReadyDevice",
      severity: "Info",
      entityId: device.id,
      title: `${device.name} is ready for customer handover`,
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      deviceName: device.name,
      message: `${device.name} passed inspection and is waiting in Ready stock. Record the buyer and invoice in Sales when the device is handed over.`,
      actionUrl: `/passport/${device.id}`,
      dueDate: "",
    }, now);
  }

  const activeRows = database.prepare("SELECT id, notification_key FROM notification_queue WHERE status IN ('Pending', 'Opened')").all() as Array<{ id: string; notification_key: string }>;
  const resolve = database.prepare("UPDATE notification_queue SET status = 'Resolved', updated_at = ? WHERE id = ?");
  const logResolve = database.prepare("INSERT INTO notification_actions (id, notification_id, action, channel, actor, created_at) VALUES (?, ?, 'Automatically resolved', '', 'System', ?)");
  for (const row of activeRows) {
    if (activeKeys.has(row.notification_key)) continue;
    resolve.run(now, row.id);
    logResolve.run(randomUUID(), row.id, now);
  }
}

function listActions(database: DatabaseSync, notificationId: string): NotificationAction[] {
  const rows = database.prepare("SELECT id, action, channel, actor, created_at FROM notification_actions WHERE notification_id = ? ORDER BY created_at DESC, id DESC").all(notificationId) as unknown as NotificationActionRow[];
  return rows.map((row) => ({ id: row.id, action: row.action, channel: row.channel, actor: row.actor, createdAt: row.created_at }));
}

function rowToNotification(database: DatabaseSync, row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    key: row.notification_key,
    type: row.type,
    severity: row.severity,
    status: row.status,
    entityId: row.entity_id,
    title: row.title,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    deviceName: row.device_name,
    message: row.message,
    actionUrl: row.action_url,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    actions: listActions(database, row.id),
  };
}

export function listNotifications(): NotificationItem[] {
  syncNotificationQueue();
  const database = getDatabase();
  ensureNotificationSchema(database);
  const rows = database.prepare(`
    SELECT * FROM notification_queue
    ORDER BY
      CASE status WHEN 'Pending' THEN 0 WHEN 'Opened' THEN 1 ELSE 2 END,
      CASE severity WHEN 'Urgent' THEN 0 WHEN 'Warning' THEN 1 ELSE 2 END,
      created_at DESC
    LIMIT 250
  `).all() as unknown as NotificationRow[];
  return rows.map((row) => rowToNotification(database, row));
}

function getNotification(database: DatabaseSync, id: string) {
  const row = database.prepare("SELECT * FROM notification_queue WHERE id = ?").get(id) as unknown as NotificationRow | undefined;
  if (!row) throw new Error("Notification not found.");
  return row;
}

function recordNotificationAction(database: DatabaseSync, notificationId: string, action: string, channel: NotificationChannel | "", actor: string, now: string) {
  database.prepare("INSERT INTO notification_actions (id, notification_id, action, channel, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), notificationId, action, channel, actor, now);
}

export function openNotificationComposer(id: string, channel: NotificationChannel, actor: string) {
  const database = getDatabase();
  ensureNotificationSchema(database);
  const row = getNotification(database, id);
  if (row.status === "Done" || row.status === "Dismissed" || row.status === "Resolved") throw new Error("Reopen this notification before contacting the customer.");
  let href = "";
  if (channel === "WhatsApp") {
    const rawPhone = row.customer_phone.replace(/\D/g, "");
    if (!rawPhone) throw new Error("This customer does not have a phone number.");
    const phone = rawPhone.startsWith("0") ? `94${rawPhone.slice(1)}` : rawPhone;
    href = `https://wa.me/${phone}?text=${encodeURIComponent(row.message)}`;
  } else {
    if (!row.customer_email) throw new Error("This customer does not have an email address.");
    href = `mailto:${encodeURIComponent(row.customer_email)}?subject=${encodeURIComponent(row.title)}&body=${encodeURIComponent(row.message)}`;
  }
  const now = new Date().toISOString();
  database.prepare("UPDATE notification_queue SET status = 'Opened', updated_at = ? WHERE id = ?").run(now, id);
  recordNotificationAction(database, id, "Composer opened", channel, actor, now);
  recordAuditEvent(actor, "notification.opened", `Opened ${channel} composer for ${row.title}.`);
  const updated = getNotification(database, id);
  return { href, notification: rowToNotification(database, updated) };
}

export function updateNotificationStatus(id: string, status: "Pending" | "Done" | "Dismissed", actor: string) {
  const database = getDatabase();
  ensureNotificationSchema(database);
  const row = getNotification(database, id);
  const now = new Date().toISOString();
  database.prepare("UPDATE notification_queue SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
  const action = status === "Pending" ? "Reopened" : status === "Done" ? "Marked done" : "Dismissed";
  recordNotificationAction(database, id, action, "", actor, now);
  recordAuditEvent(actor, "notification.status", `${action} notification: ${row.title}.`);
  return rowToNotification(database, getNotification(database, id));
}
