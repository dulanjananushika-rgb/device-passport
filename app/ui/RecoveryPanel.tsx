"use client";

import { useState } from "react";
import type { SystemReadiness } from "../../lib/readiness";

type RecoveryPanelProps = {
  initialSystem: SystemReadiness;
  onAuditChange: () => Promise<void>;
};

export function RecoveryPanel({ initialSystem, onAuditChange }: RecoveryPanelProps) {
  const [system, setSystem] = useState(initialSystem);
  const [creating, setCreating] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function refreshSystem() {
    const response = await fetch("/api/system", { cache: "no-store" });
    if (!response.ok) throw new Error("System readiness could not be refreshed.");
    const result = await response.json();
    setSystem(result.system as SystemReadiness);
  }

  async function createBackup() {
    setCreating(true);
    setError("");
    setSuccess("");
    const response = await fetch("/api/backups", { method: "POST" });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setError(result.error ?? "The backup could not be created.");
      setCreating(false);
      return;
    }
    setSuccess(`Recovery point ${result.backup.name} created.`);
    setCreating(false);
    await refreshSystem();
    await onAuditChange();
  }

  function prepareRestore(name: string) {
    setSelectedBackup(name);
    setConfirmation("");
    setPassword("");
    setError("");
    setSuccess("");
  }

  async function restoreBackup() {
    setRestoring(true);
    setError("");
    setSuccess("");
    const response = await fetch("/api/backups/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: selectedBackup, confirmation, password }),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setError(result.error ?? "The database could not be restored.");
      setRestoring(false);
      return;
    }
    setPassword("");
    setConfirmation("");
    setSelectedBackup("");
    setSuccess(`Restored ${result.result.restored}. Safety copy: ${result.result.safetyBackup.name}. Reload the dashboard to use the restored data.`);
    setRestoring(false);
    await refreshSystem();
  }

  return (
    <section className="panel settings-card recovery-card">
      <div className="panel-head"><div><h3 className="panel-title">Data protection</h3><p className="panel-subtitle">Daily snapshots, verified downloads, and guarded restore</p></div><span className={`system-state ${system.status}`}>{system.status === "ready" ? "Launch ready" : "Needs attention"}</span></div>

      <div className="readiness-grid">
        {system.checks.map((check) => <div className={`readiness-check ${check.ok ? "ok" : "warn"}`} key={check.key}><span>{check.ok ? "✓" : "!"}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div></div>)}
      </div>

      <div className="backup-toolbar"><div><strong>Recovery points</strong><span>Automatic snapshots are retained for 14 days.</span></div><button className="button primary small" type="button" disabled={creating || restoring} onClick={createBackup}>{creating ? "Creating snapshot…" : "+ Create backup now"}</button></div>
      {error && <div className="error-box" role="alert">{error}</div>}
      {success && <div className="success-box" role="status">{success}</div>}

      <div className="backup-list">
        {system.backups.length ? system.backups.slice(0, 8).map((backup) => <article className="backup-row" key={backup.name}><span className={`backup-kind ${backup.kind.toLowerCase()}`}>{backup.kind.slice(0, 1)}</span><div><strong>{backup.kind} snapshot</strong><small>{formatDate(backup.createdAt)} · {formatBytes(backup.sizeBytes)}</small><code>{backup.name}</code></div><div className="backup-actions"><a className="button secondary small" href={`/api/backups/${encodeURIComponent(backup.name)}`}>Download</a><button className="text-link danger-text" type="button" onClick={() => prepareRestore(backup.name)}>Restore</button></div></article>) : <div className="empty-state">No recovery points yet. Create the first verified snapshot now.</div>}
      </div>

      {selectedBackup && <div className="restore-confirmation"><div><span className="eyebrow">Destructive recovery action</span><h4>Restore {selectedBackup}?</h4><p>A fresh safety snapshot is created first. Current data will then be replaced by this verified recovery point.</p></div><div className="restore-fields"><label>Type RESTORE<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label><label>Current Owner password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label></div><div className="row-actions"><button className="button secondary" type="button" disabled={restoring} onClick={() => setSelectedBackup("")}>Cancel</button><button className="button danger-button" type="button" disabled={restoring || confirmation !== "RESTORE" || !password} onClick={restoreBackup}>{restoring ? "Validating and restoring…" : "Restore verified backup"}</button></div></div>}
    </section>
  );
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
