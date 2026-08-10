import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { devices as seedDevices, type DeviceRecord } from "../app/data/devices";

type DiagnosticReport = {
  reportVersion?: string;
  collectedAt?: string;
  device?: {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    processor?: string;
    memoryGB?: number;
  };
  battery?: { healthPercent?: number };
  storage?: Array<{ model?: string; healthStatus?: string; sizeGB?: number }>;
};

type DeviceRow = {
  id: string;
  name: string;
  model: string;
  serial: string;
  grade: "A" | "B" | "C";
  score: number;
  battery_health: number;
  storage_health: number;
  memory: string;
  storage: string;
  processor: string;
  tested_at: string;
  technician: string;
  warranty_ends: string;
  status: "Published" | "Needs review" | "Draft";
};

const globalDatabase = globalThis as typeof globalThis & { devicePassportDb?: DatabaseSync };

function databasePath() {
  return process.env.DEVICEPASSPORT_DATABASE_PATH ?? path.join(process.cwd(), ".data", "device-passport.db");
}

function getDatabase() {
  if (globalDatabase.devicePassportDb) return globalDatabase.devicePassportDb;

  const filePath = databasePath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  const database = new DatabaseSync(filePath);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      serial TEXT NOT NULL UNIQUE,
      grade TEXT NOT NULL,
      score INTEGER NOT NULL,
      battery_health INTEGER NOT NULL,
      storage_health INTEGER NOT NULL,
      memory TEXT NOT NULL,
      storage TEXT NOT NULL,
      processor TEXT NOT NULL,
      tested_at TEXT NOT NULL,
      technician TEXT NOT NULL,
      warranty_ends TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS diagnostic_reports (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      report_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );
  `);

  const insert = database.prepare(`
    INSERT OR IGNORE INTO devices (
      id, name, model, serial, grade, score, battery_health, storage_health,
      memory, storage, processor, tested_at, technician, warranty_ends, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const device of seedDevices) insert.run(...deviceValues(device));

  globalDatabase.devicePassportDb = database;
  return database;
}

function deviceValues(device: DeviceRecord) {
  return [
    device.id, device.name, device.model, device.serial, device.grade, device.score,
    device.batteryHealth, device.storageHealth, device.memory, device.storage,
    device.processor, device.testedAt, device.technician, device.warrantyEnds, device.status,
  ];
}

function rowToDevice(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    serial: row.serial,
    grade: row.grade,
    score: row.score,
    batteryHealth: row.battery_health,
    storageHealth: row.storage_health,
    memory: row.memory,
    storage: row.storage,
    processor: row.processor,
    testedAt: row.tested_at,
    technician: row.technician,
    warrantyEnds: row.warranty_ends,
    status: row.status,
  };
}

export function listDevices(): DeviceRecord[] {
  const rows = getDatabase().prepare("SELECT * FROM devices ORDER BY created_at DESC, id DESC").all() as unknown as DeviceRow[];
  return rows.map(rowToDevice);
}

export function findDevice(id: string): DeviceRecord | null {
  const row = getDatabase().prepare("SELECT * FROM devices WHERE lower(id) = lower(?)").get(id) as unknown as DeviceRow | undefined;
  return row ? rowToDevice(row) : null;
}

export function createDeviceFromReport(report: DiagnosticReport, technician: string): DeviceRecord {
  const model = report.device?.model?.trim();
  const serial = report.device?.serialNumber?.trim();
  if (!model || !serial || serial === "UNKNOWN-SERIAL") {
    throw new Error("A valid device model and serial number are required.");
  }

  const existing = getDatabase().prepare("SELECT id FROM devices WHERE serial = ?").get(serial) as { id: string } | undefined;
  if (existing) throw new Error(`A passport already exists for serial ${serial}.`);

  const batteryHealth = clamp(report.battery?.healthPercent ?? 0);
  const firstDisk = report.storage?.[0];
  const storageOkay = Boolean(firstDisk && /ok|healthy/i.test(firstDisk.healthStatus ?? ""));
  const storageHealth = firstDisk ? (storageOkay ? 98 : 62) : 0;
  const identityScore = 90;
  const score = Math.round(batteryHealth * 0.45 + storageHealth * 0.35 + identityScore * 0.2);
  const grade: DeviceRecord["grade"] = score >= 88 ? "A" : score >= 74 ? "B" : "C";
  const needsReview = batteryHealth < 75 || !storageOkay;
  const testedDate = report.collectedAt ? new Date(report.collectedAt) : new Date();
  const warrantyDate = new Date();
  warrantyDate.setMonth(warrantyDate.getMonth() + 6);

  const device: DeviceRecord = {
    id: `DVP-LK-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`,
    name: [report.device?.manufacturer, model].filter(Boolean).join(" "),
    model,
    serial,
    grade,
    score,
    batteryHealth,
    storageHealth,
    memory: report.device?.memoryGB ? `${report.device.memoryGB} GB` : "Not detected",
    storage: firstDisk ? `${firstDisk.sizeGB ?? "?"} GB ${firstDisk.model ?? "storage"}` : "Not detected",
    processor: report.device?.processor?.trim() || "Not detected",
    testedAt: testedDate.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
    technician,
    warrantyEnds: warrantyDate.toLocaleDateString("en-GB", { dateStyle: "medium" }),
    status: needsReview ? "Needs review" : "Published",
  };

  const database = getDatabase();
  database.exec("BEGIN");
  try {
    database.prepare(`
      INSERT INTO devices (
        id, name, model, serial, grade, score, battery_health, storage_health,
        memory, storage, processor, tested_at, technician, warranty_ends, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...deviceValues(device));
    database.prepare("INSERT INTO diagnostic_reports (id, device_id, report_json) VALUES (?, ?, ?)")
      .run(randomUUID(), device.id, JSON.stringify(report));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return device;
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
