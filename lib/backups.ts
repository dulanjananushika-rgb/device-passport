import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  createDatabaseSnapshot,
  getDatabaseFilePath,
  recordAuditEvent,
  replaceDatabaseFromSnapshot,
} from "./database";
import { logSystemEvent } from "./system-log";

export type BackupKind = "Automatic" | "Manual" | "Safety";

export type BackupSummary = {
  name: string;
  kind: BackupKind;
  sizeBytes: number;
  createdAt: string;
};

const backupNamePattern = /^device-passport-(auto-\d{8}|manual-\d{8}-\d{6}-[A-F0-9]{6}|safety-\d{8}-\d{6}-[A-F0-9]{6})\.db$/;
const requiredTables = ["devices", "device_inspections", "shop_settings", "staff_users", "device_sales", "audit_events"];

export function getBackupDirectory() {
  const configured = process.env.DEVICEPASSPORT_BACKUP_PATH?.trim();
  if (configured) return path.resolve(/* turbopackIgnore: true */ configured);
  const databasePath = getDatabaseFilePath();
  if (databasePath === ":memory:") throw new Error("Backups are unavailable for an in-memory database.");
  return path.join(/* turbopackIgnore: true */ path.dirname(databasePath), "backups");
}

export function listDatabaseBackups(): BackupSummary[] {
  const directory = getBackupDirectory();
  if (!existsSync(/* turbopackIgnore: true */ directory)) return [];
  return readdirSync(/* turbopackIgnore: true */ directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && backupNamePattern.test(entry.name))
    .map((entry) => {
      const stats = statSync(path.join(/* turbopackIgnore: true */ directory, entry.name));
      return { name: entry.name, kind: backupKind(entry.name), sizeBytes: stats.size, createdAt: stats.mtime.toISOString() };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function createManualBackup(actor: string) {
  return createDatabaseBackup("Manual", actor);
}

export function ensureDailyBackup() {
  try {
    const today = compactDate(new Date());
    const existing = listDatabaseBackups().find((backup) => backup.name === `device-passport-auto-${today}.db`);
    if (existing) return { ok: true as const, backup: existing, created: false };
    const backup = createDatabaseBackup("Automatic", "System");
    pruneAutomaticBackups(14);
    logSystemEvent("info", "backup.automatic", `Created ${backup.name}.`);
    return { ok: true as const, backup, created: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automatic backup failed.";
    logSystemEvent("error", "backup.automatic_failed", message);
    return { ok: false as const, error: message };
  }
}

export function resolveBackupFile(name: string) {
  if (!backupNamePattern.test(name) || path.basename(name) !== name) throw new Error("Choose a valid DevicePassport backup.");
  const resolved = path.join(/* turbopackIgnore: true */ getBackupDirectory(), name);
  if (!existsSync(/* turbopackIgnore: true */ resolved)) throw new Error("The selected backup no longer exists.");
  return resolved;
}

export function validateDatabaseBackup(filePath: string) {
  const stats = statSync(filePath);
  if (stats.size < 4096 || stats.size > 500 * 1024 * 1024) throw new Error("Backup size is outside the supported range.");
  const candidate = new DatabaseSync(filePath, { readOnly: true });
  try {
    const integrity = candidate.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
    if (integrity?.integrity_check !== "ok") throw new Error("SQLite integrity validation failed.");
    const tables = candidate.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as unknown as Array<{ name: string }>;
    const available = new Set(tables.map((table) => table.name));
    const missing = requiredTables.filter((table) => !available.has(table));
    if (missing.length) throw new Error(`Backup is missing required tables: ${missing.join(", ")}.`);
    const foreignKeyIssue = candidate.prepare("PRAGMA foreign_key_check").get();
    if (foreignKeyIssue) throw new Error("Backup contains invalid database relationships.");
    return { ok: true, sizeBytes: stats.size };
  } finally {
    candidate.close();
  }
}

export function restoreDatabaseBackup(name: string, actor: string) {
  const source = resolveBackupFile(name);
  validateDatabaseBackup(source);
  const safetyBackup = createDatabaseBackup("Safety", actor);
  const databasePath = getDatabaseFilePath();
  if (databasePath === ":memory:") throw new Error("Restore is unavailable for an in-memory database.");
  const staging = path.join(/* turbopackIgnore: true */ path.dirname(databasePath), `.restore-${randomUUID()}.db`);
  copyFileSync(source, staging);

  try {
    replaceDatabaseFromSnapshot(staging);
    recordAuditEvent(actor, "backup.restored", `Restored ${name}; safety snapshot ${safetyBackup.name}.`);
    logSystemEvent("warn", "backup.restored", `Restored ${name}; safety snapshot ${safetyBackup.name}.`);
    return { restored: name, safetyBackup };
  } catch (error) {
    rmSync(staging, { force: true });
    const message = error instanceof Error ? error.message : "Database restore failed.";
    logSystemEvent("error", "backup.restore_failed", message);
    throw error;
  }
}

function createDatabaseBackup(kind: BackupKind, actor: string) {
  const directory = getBackupDirectory();
  mkdirSync(directory, { recursive: true });
  const now = new Date();
  const suffix = kind === "Automatic"
    ? `auto-${compactDate(now)}`
    : `${kind === "Manual" ? "manual" : "safety"}-${compactDate(now)}-${compactTime(now)}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const name = `device-passport-${suffix}.db`;
  const destination = path.join(/* turbopackIgnore: true */ directory, name);
  createDatabaseSnapshot(destination);
  const summary = { name, kind, sizeBytes: statSync(destination).size, createdAt: statSync(destination).mtime.toISOString() } satisfies BackupSummary;
  if (kind !== "Automatic") recordAuditEvent(actor, "backup.created", `Created ${kind.toLowerCase()} snapshot ${name}.`);
  return summary;
}

function pruneAutomaticBackups(keep: number) {
  const automatic = listDatabaseBackups().filter((backup) => backup.kind === "Automatic");
  for (const backup of automatic.slice(keep)) rmSync(resolveBackupFile(backup.name), { force: true });
}

function backupKind(name: string): BackupKind {
  if (name.includes("-auto-")) return "Automatic";
  if (name.includes("-safety-")) return "Safety";
  return "Manual";
}

function compactDate(value: Date) {
  return value.toISOString().slice(0, 10).replaceAll("-", "");
}

function compactTime(value: Date) {
  return value.toISOString().slice(11, 19).replaceAll(":", "");
}
