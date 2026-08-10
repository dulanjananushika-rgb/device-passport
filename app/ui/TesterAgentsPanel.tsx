"use client";

import { useState } from "react";
import type { TesterAgent } from "../../lib/tester-types";

export function TesterAgentsPanel({ agents, onAgentsChange, onAuditChange }: {
  agents: TesterAgent[];
  onAgentsChange: (agents: TesterAgent[]) => void;
  onAuditChange: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [issuedToken, setIssuedToken] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function createAgent() {
    setSaving(true);
    setError("");
    setIssuedToken("");
    const response = await fetch("/api/tester-agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setError(result.error ?? "The tester station could not be created.");
      setSaving(false);
      return;
    }
    onAgentsChange([result.agent as TesterAgent, ...agents]);
    setName("");
    setIssuedToken(String(result.token));
    setSaving(false);
    await onAuditChange();
  }

  async function updateAgent(agent: TesterAgent, active: boolean) {
    setError("");
    const response = await fetch(`/api/tester-agents/${encodeURIComponent(agent.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active }),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setError(result.error ?? "The tester station could not be updated.");
      return;
    }
    onAgentsChange(agents.map((item) => item.id === agent.id ? result.agent as TesterAgent : item));
    await onAuditChange();
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(issuedToken);
      setCopied(true);
    } catch {
      setError("Copy was blocked. Select the token and copy it manually.");
    }
  }

  return (
    <section className="panel settings-card tester-agent-card">
      <div className="panel-head"><div><h3 className="panel-title">Windows tester stations</h3><p className="panel-subtitle">Issue a private upload token for each shop laptop</p></div><span className="secure-badge">Signed uploads</span></div>
      <div className="tester-agent-create"><label>Station name<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Example: Colombo QC Bench 1" /></label><button className="button primary" type="button" disabled={saving || name.trim().length < 2} onClick={createAgent}>{saving ? "Creating..." : "Create station"}</button></div>
      {issuedToken && <div className="token-reveal" role="status"><strong>Copy this token now</strong><p>It is shown only once. Paste it into the Windows tester app on that station.</p><code>{issuedToken}</code><button className="button secondary small" type="button" onClick={copyToken}>{copied ? "Copied" : "Copy token"}</button></div>}
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="tester-agent-list">
        {agents.length ? agents.map((agent) => <article key={agent.id} className={agent.active ? "" : "inactive"}><span className={`agent-state ${agent.active ? "online" : ""}`}>{agent.active ? "Active" : "Revoked"}</span><div><strong>{agent.name}</strong><small>{agent.lastSeenAt ? `Last upload ${formatAgentDate(agent.lastSeenAt)}` : "No uploads yet"}</small></div><button className={`text-link ${agent.active ? "danger-text" : ""}`} type="button" onClick={() => updateAgent(agent, !agent.active)}>{agent.active ? "Revoke" : "Enable"}</button></article>) : <div className="empty-state compact-empty">No Windows tester stations connected yet.</div>}
      </div>
    </section>
  );
}

function formatAgentDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : value;
}
