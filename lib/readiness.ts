import { listDatabaseBackups, type BackupSummary } from "./backups";
import { databaseQuickCheck } from "./database";

export type ReadinessCheck = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
};

export function getPublicHealth() {
  const database = databaseQuickCheck();
  return {
    status: database.ok ? "healthy" : "unhealthy",
    checkedAt: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    database: database.ok ? "connected" : "unavailable",
  };
}

export function getSystemReadiness() {
  const database = databaseQuickCheck();
  let backups: BackupSummary[] = [];
  let backupError = "";
  try {
    backups = listDatabaseBackups();
  } catch (error) {
    backupError = error instanceof Error ? error.message : "Backup directory is unavailable.";
  }
  const latest = backups[0];
  const backupAgeHours = latest ? (Date.now() - Date.parse(latest.createdAt)) / 3_600_000 : Number.POSITIVE_INFINITY;
  const production = process.env.NODE_ENV === "production";
  const sessionSecret = process.env.DEVICEPASSPORT_SESSION_SECRET ?? "";
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : "");
  const adminEmail = process.env.DEVICEPASSPORT_ADMIN_EMAIL ?? "";
  const adminPassword = process.env.DEVICEPASSPORT_ADMIN_PASSWORD ?? "";
  const checks: ReadinessCheck[] = [
    { key: "database", label: "Database integrity", ok: database.ok, detail: database.ok ? "SQLite quick check passed." : database.message },
    { key: "backups", label: "Recent recovery point", ok: !backupError && backupAgeHours <= 48, detail: backupError || (latest ? `Latest ${latest.kind.toLowerCase()} snapshot is ${humanAge(backupAgeHours)} old.` : "No database snapshot exists yet.") },
    { key: "session", label: "Session signing secret", ok: sessionSecret.length >= 32, detail: sessionSecret.length >= 32 ? "A deployment-grade secret is configured." : "Development fallback works locally; set a unique 32+ character secret before deployment." },
    { key: "public-url", label: "Public HTTPS URL", ok: publicUrl.startsWith("https://"), detail: publicUrl.startsWith("https://") ? "HTTPS application URL is configured." : "Local HTTP works for development; configure the deployed HTTPS origin before launch." },
    { key: "owner-seed", label: "Production Owner seed", ok: adminEmail.includes("@") && adminPassword.length >= 12, detail: adminEmail.includes("@") && adminPassword.length >= 12 ? "Explicit deployment Owner credentials are configured." : "Development Owner fallback works locally; configure production seed credentials before launch." },
  ];
  return {
    status: database.ok && checks.every((check) => check.ok) ? "ready" : "attention",
    checkedAt: new Date().toISOString(),
    environment: production ? "Production" : "Development",
    backups,
    checks,
  };
}

export type SystemReadiness = ReturnType<typeof getSystemReadiness>;

function humanAge(hours: number) {
  if (hours < 1) return "less than one hour";
  if (hours < 48) return `${Math.floor(hours)} hours`;
  return `${Math.floor(hours / 24)} days`;
}
