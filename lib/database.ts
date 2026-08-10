import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { devices as seedDevices, type DeviceRecord } from "../app/data/devices";
import {
  calculateInspectionScore,
  inspectionKeys,
  type DiagnosticReport,
  type InspectionChecks,
  type InspectionPhotoInput,
} from "./inspection";

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

type InspectionRow = {
  display: "pass" | "fail";
  keyboard: "pass" | "fail";
  camera: "pass" | "fail";
  audio: "pass" | "fail";
  ports: "pass" | "fail";
  wireless: "pass" | "fail";
  notes: string;
  approved_at: string;
};

type PhotoRow = {
  id: string;
  name: string;
  mime_type: string;
  data?: Uint8Array;
};

export type PassportEvidence = {
  checks: InspectionChecks;
  notes: string;
  approvedAt: string;
  photos: Array<{ id: string; name: string; mimeType: string }>;
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
    CREATE TABLE IF NOT EXISTS device_inspections (
      device_id TEXT PRIMARY KEY,
      display TEXT NOT NULL,
      keyboard TEXT NOT NULL,
      camera TEXT NOT NULL,
      audio TEXT NOT NULL,
      ports TEXT NOT NULL,
      wireless TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      approved_at TEXT NOT NULL,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS device_photos (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data BLOB NOT NULL,
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
  const insertInspection = database.prepare(`
    INSERT OR IGNORE INTO device_inspections (
      device_id, display, keyboard, camera, audio, ports, wireless, notes, approved_at
    ) VALUES (?, 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', ?, ?)
  `);
  for (const device of seedDevices) {
    insert.run(...deviceValues(device));
    insertInspection.run(device.id, "Demo inspection completed before sale.", device.testedAt);
  }

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

export function getPassportEvidence(deviceId: string): PassportEvidence | null {
  const database = getDatabase();
  const inspection = database.prepare("SELECT * FROM device_inspections WHERE device_id = ?").get(deviceId) as unknown as InspectionRow | undefined;
  if (!inspection) return null;
  const photos = database.prepare("SELECT id, name, mime_type FROM device_photos WHERE device_id = ? ORDER BY created_at, id").all(deviceId) as unknown as PhotoRow[];
  return {
    checks: {
      display: inspection.display,
      keyboard: inspection.keyboard,
      camera: inspection.camera,
      audio: inspection.audio,
      ports: inspection.ports,
      wireless: inspection.wireless,
    },
    notes: inspection.notes,
    approvedAt: inspection.approved_at,
    photos: photos.map((photo) => ({ id: photo.id, name: photo.name, mimeType: photo.mime_type })),
  };
}

export function getPassportPhoto(deviceId: string, photoId: string) {
  const row = getDatabase().prepare("SELECT id, name, mime_type, data FROM device_photos WHERE device_id = ? AND id = ?").get(deviceId, photoId) as unknown as PhotoRow | undefined;
  return row?.data ? { data: row.data, mimeType: row.mime_type, name: row.name } : null;
}

export function createDeviceFromReport(
  report: DiagnosticReport,
  checks: InspectionChecks,
  notes: string,
  photos: InspectionPhotoInput[],
  technician: string,
): DeviceRecord {
  const model = report.device?.model?.trim();
  const serial = report.device?.serialNumber?.trim();
  if (!model || !serial || serial === "UNKNOWN-SERIAL") throw new Error("A valid device model and serial number are required.");
  if (!inspectionKeys.every((key) => checks[key] === "pass" || checks[key] === "fail")) throw new Error("Every manual inspection check must be completed.");
  if (photos.length > 4) throw new Error("A maximum of four evidence photos is allowed.");

  const database = getDatabase();
  const existing = database.prepare("SELECT id FROM devices WHERE serial = ?").get(serial) as { id: string } | undefined;
  if (existing) throw new Error(`A passport already exists for serial ${serial}.`);

  const scoring = calculateInspectionScore(report, checks);
  const firstDisk = report.storage?.[0];
  const testedDate = report.collectedAt ? new Date(report.collectedAt) : new Date();
  const warrantyDate = new Date();
  warrantyDate.setMonth(warrantyDate.getMonth() + 6);

  const device: DeviceRecord = {
    id: `DVP-LK-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`,
    name: [report.device?.manufacturer, model].filter(Boolean).join(" "),
    model,
    serial,
    grade: scoring.grade,
    score: scoring.score,
    batteryHealth: scoring.batteryHealth,
    storageHealth: scoring.storageHealth,
    memory: report.device?.memoryGB ? `${report.device.memoryGB} GB` : "Not detected",
    storage: firstDisk ? `${firstDisk.sizeGB ?? "?"} GB ${firstDisk.model ?? "storage"}` : "Not detected",
    processor: report.device?.processor?.trim() || "Not detected",
    testedAt: testedDate.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
    technician,
    warrantyEnds: warrantyDate.toLocaleDateString("en-GB", { dateStyle: "medium" }),
    status: scoring.needsReview ? "Needs review" : "Published",
  };

  const preparedPhotos = photos.map(parsePhoto);
  database.exec("BEGIN");
  try {
    database.prepare(`
      INSERT INTO devices (
        id, name, model, serial, grade, score, battery_health, storage_health,
        memory, storage, processor, tested_at, technician, warranty_ends, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...deviceValues(device));
    database.prepare("INSERT INTO diagnostic_reports (id, device_id, report_json) VALUES (?, ?, ?)").run(randomUUID(), device.id, JSON.stringify(report));
    database.prepare(`
      INSERT INTO device_inspections (
        device_id, display, keyboard, camera, audio, ports, wireless, notes, approved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(device.id, checks.display, checks.keyboard, checks.camera, checks.audio, checks.ports, checks.wireless, notes.trim(), new Date().toISOString());
    const insertPhoto = database.prepare("INSERT INTO device_photos (id, device_id, name, mime_type, data) VALUES (?, ?, ?, ?, ?)");
    for (const photo of preparedPhotos) insertPhoto.run(randomUUID(), device.id, photo.name, photo.mimeType, photo.data);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return device;
}

function parsePhoto(photo: InspectionPhotoInput) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(photo.dataUrl);
  if (!match) throw new Error(`Photo ${photo.name || "upload"} must be a JPEG, PNG, or WebP image.`);
  const data = Buffer.from(match[2], "base64");
  if (data.byteLength > 2 * 1024 * 1024) throw new Error(`Photo ${photo.name || "upload"} is larger than 2 MB.`);
  return { name: photo.name.slice(0, 120) || "Device photo", mimeType: match[1], data };
}
