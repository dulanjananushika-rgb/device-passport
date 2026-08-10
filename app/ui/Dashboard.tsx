"use client";

import { ChangeEvent, useMemo, useState } from "react";
import type { DeviceRecord } from "../data/devices";

type View = "overview" | "devices" | "warranties" | "reports";

type DiagnosticImport = {
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

const viewTitles: Record<View, { eyebrow: string; title: string }> = {
  overview: { eyebrow: "Operations", title: "Shop overview" },
  devices: { eyebrow: "Inventory", title: "Device passports" },
  warranties: { eyebrow: "After-sales", title: "Warranty control" },
  reports: { eyebrow: "Performance", title: "Health reports" },
};

export function Dashboard({ initialDevices, userEmail }: { initialDevices: DeviceRecord[]; userEmail: string }) {
  const [records, setRecords] = useState(initialDevices);
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [imported, setImported] = useState<DiagnosticImport | null>(null);
  const [importError, setImportError] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredDevices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((device) =>
      [device.name, device.id, device.serial, device.model].join(" ").toLowerCase().includes(needle),
    );
  }, [query, records]);

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as DiagnosticImport;
        if (!parsed.device?.serialNumber || !parsed.device?.model) {
          throw new Error("The report is missing a device model or serial number.");
        }
        setImported(parsed);
      } catch (error) {
        setImported(null);
        setImportError(error instanceof Error ? error.message : "This report could not be read.");
      }
    };
    reader.readAsText(file);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setImported(null);
    setImportError("");
  }

  async function publishPassport() {
    if (!imported) return;
    setSaving(true);
    setImportError("");
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(imported),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setImportError(result.error ?? "The passport could not be created.");
      setSaving(false);
      return;
    }

    setRecords((current) => [result.device as DeviceRecord, ...current]);
    setSaving(false);
    closeModal();
    setView("devices");
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  const title = viewTitles[view];
  const publishedCount = records.filter((device) => device.status === "Published").length;
  const reviewCount = records.filter((device) => device.status === "Needs review").length;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <button className="brand brand-button" onClick={() => setView("overview")}>
          <span className="brand-mark">D</span><span className="brand-name">DevicePassport</span>
        </button>

        <div className="nav-label">Workspace</div>
        <div className="nav-stack">
          <NavButton icon="H" label="Overview" active={view === "overview"} onClick={() => setView("overview")} />
          <NavButton icon="D" label="Devices" active={view === "devices"} onClick={() => setView("devices")} />
          <NavButton icon="W" label="Warranties" active={view === "warranties"} onClick={() => setView("warranties")} />
          <NavButton icon="R" label="Reports" active={view === "reports"} onClick={() => setView("reports")} />
        </div>

        <div className="nav-label">Manage</div>
        <div className="nav-stack secondary">
          <NavButton icon="T" label="Technicians" active={false} onClick={() => setView("reports")} />
          <NavButton icon="S" label="Settings" active={false} onClick={() => setView("reports")} />
        </div>

        <div className="sidebar-account">
          <span className="avatar">LM</span>
          <span className="account-copy"><strong>Lapmart</strong><span>{userEmail}</span></span>
          <button className="logout-button" onClick={signOut} title="Sign out" aria-label="Sign out">-&gt;</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><div className="eyebrow">{title.eyebrow}</div><h1>{title.title}</h1></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Notifications">N<span className="notification-dot" /></button>
            <button className="button primary" onClick={() => setModalOpen(true)}>+ New device test</button>
          </div>
        </header>

        {view === "overview" && (
          <Overview records={records} publishedCount={publishedCount} reviewCount={reviewCount} onNewTest={() => setModalOpen(true)} onViewDevices={() => setView("devices")} />
        )}
        {view === "devices" && <DeviceList devices={filteredDevices} query={query} onQuery={setQuery} onNewTest={() => setModalOpen(true)} />}
        {view === "warranties" && <Warranties records={records} />}
        {view === "reports" && <Reports records={records} />}
      </main>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-test-title">
            <div className="modal-head">
              <div><div className="eyebrow">Device intake</div><h2 id="new-test-title">Create a verified passport</h2></div>
              <button className="close-button" onClick={closeModal} aria-label="Close dialog">x</button>
            </div>
            <div className="stepper" aria-label="Passport creation progress">
              <div className="step active" data-step="1">Import</div>
              <div className={`step ${imported ? "active" : ""}`} data-step="2">Review</div>
              <div className={`step ${saving ? "active" : ""}`} data-step="3">Publish</div>
            </div>
            <div className="modal-body">
              {imported ? (
                <div className="import-success">
                  <h3>Diagnostic report imported</h3>
                  <div className="import-grid">
                    <div><span>Device</span><strong>{imported.device?.manufacturer} {imported.device?.model}</strong></div>
                    <div><span>Serial</span><strong>{imported.device?.serialNumber}</strong></div>
                    <div><span>Memory</span><strong>{imported.device?.memoryGB ?? "-"} GB</strong></div>
                    <div><span>Battery health</span><strong>{imported.battery?.healthPercent ?? "-"}%</strong></div>
                  </div>
                </div>
              ) : (
                <label className="drop-zone">
                  <span><span className="drop-icon">JSON</span><h3>Import the Windows health report</h3><p>Run the DevicePassport collector on the laptop, then select the generated JSON file here.</p><span className="button secondary small">Choose report</span><input className="file-input" type="file" accept="application/json,.json" onChange={handleImport} /></span>
                </label>
              )}
              {importError && <div className="error-box" role="alert">{importError}</div>}
            </div>
            <div className="modal-foot">
              <button className="button secondary" onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="button primary" disabled={!imported || saving} onClick={publishPassport}>{saving ? "Saving passport..." : "Create passport"}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}><span className="nav-icon" aria-hidden="true">{icon}</span><span>{label}</span></button>;
}

function Overview({ records, publishedCount, reviewCount, onNewTest, onViewDevices }: { records: DeviceRecord[]; publishedCount: number; reviewCount: number; onNewTest: () => void; onViewDevices: () => void }) {
  const latest = records[0];
  return (
    <>
      <section className="hero">
        <div className="hero-copy"><div className="hero-kicker">Trust, made visible</div><h2>Every refurbished laptop deserves proof.</h2><p>Run a consistent health test, publish a transparent device passport, and keep the warranty in one place from intake to after-sales.</p><div className="hero-actions"><button className="button primary" onClick={onNewTest}>+ Test a laptop</button>{latest && <a className="button secondary" href={`/passport/${latest.id}`}>View customer passport</a>}</div></div>
        {latest && <div className="hero-proof" aria-label="Latest verified device summary"><div className="proof-top"><div><div className="proof-label">Latest passport</div><div className="proof-device">{latest.name}</div></div><div className="grade-badge">{latest.grade}</div></div><div className="health-meter"><div className="health-row"><span>Overall health</span><strong>{latest.score} / 100</strong></div><div className="meter"><span style={{ width: `${latest.score}%` }} /></div></div><div className="proof-meta"><div><span>Battery</span><strong>{latest.batteryHealth}% health</strong></div><div><span>Storage</span><strong>{latest.storageHealth}% healthy</strong></div><div><span>Test ID</span><strong>{latest.id}</strong></div><div><span>Status</span><strong>{latest.status}</strong></div></div></div>}
      </section>
      <section className="stats" aria-label="Business summary"><Stat label="Total passports" value={String(records.length)} indicator="Live DB" /><Stat label="Published devices" value={String(publishedCount)} indicator={`${Math.round((publishedCount / Math.max(records.length, 1)) * 100)}%`} /><Stat label="Needs review" value={String(reviewCount)} indicator={reviewCount ? "Attention" : "Clear"} /><Stat label="Open claims" value="0" indicator="No claims" /></section>
      <section className="content-grid">
        <div className="panel"><div className="panel-head"><div><h3 className="panel-title">Recent device tests</h3><p className="panel-subtitle">Saved in your standalone database</p></div><button className="text-link" onClick={onViewDevices}>View all</button></div><DeviceTable devices={records.slice(0, 4)} /></div>
        <div className="panel"><div className="panel-head"><div><h3 className="panel-title">System status</h3><p className="panel-subtitle">Independent Next.js stack</p></div></div><div className="activity-list"><Activity icon="DB" title="Local database connected" body={`${records.length} device records available`} time="Live" /><Activity icon="API" title="Report upload API" body="Authenticated technician endpoint" time="Ready" /><Activity icon="QR" title="Public passports" body="Customers do not need an account" time="Open" /></div></div>
      </section>
    </>
  );
}

function DeviceList({ devices, query, onQuery, onNewTest }: { devices: DeviceRecord[]; query: string; onQuery: (value: string) => void; onNewTest: () => void }) {
  return <section className="page-section"><div className="section-head"><div><div className="eyebrow">{devices.length} records</div><h2>Device inventory</h2></div><div className="row-actions"><input className="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search name, serial or passport" aria-label="Search device passports" /><button className="button primary" onClick={onNewTest}>+ New test</button></div></div><div className="panel">{devices.length ? <DeviceTable devices={devices} /> : <div className="empty-state">No passports match &quot;{query}&quot;.</div>}</div></section>;
}

function Warranties({ records }: { records: DeviceRecord[] }) {
  const active = records.filter((device) => device.status === "Published");
  return <section className="page-section"><div className="section-head"><div><div className="eyebrow">{active.length} protected devices</div><h2>Warranty pipeline</h2></div></div><section className="stats"><Stat label="Active" value={String(active.length)} indicator="Current" /><Stat label="Needs review" value={String(records.length - active.length)} indicator="Follow up" /><Stat label="Open claims" value="0" indicator="Clear" /><Stat label="Resolved this month" value="0" indicator="No claims" /></section><div className="panel"><div className="panel-head"><div><h3 className="panel-title">Warranty device list</h3><p className="panel-subtitle">Public passport and coverage status</p></div></div><DeviceTable devices={records} /></div></section>;
}

function Reports({ records }: { records: DeviceRecord[] }) {
  const average = records.length ? (records.reduce((sum, device) => sum + device.score, 0) / records.length).toFixed(1) : "0";
  const gradeA = records.filter((device) => device.grade === "A").length;
  const lowBattery = records.filter((device) => device.batteryHealth < 75).length;
  return <section className="page-section"><div className="section-head"><div><div className="eyebrow">Live database metrics</div><h2>Quality overview</h2></div></div><section className="stats"><Stat label="Average health score" value={average} indicator="All devices" /><Stat label="Grade A devices" value={String(gradeA)} indicator={`${Math.round((gradeA / Math.max(records.length, 1)) * 100)}%`} /><Stat label="Battery reviews" value={String(lowBattery)} indicator="Below 75%" /><Stat label="Total tested" value={String(records.length)} indicator="Stored" /></section><div className="panel"><div className="panel-head"><div><h3 className="panel-title">Review queue</h3><p className="panel-subtitle">Issues caught before a device reaches a buyer</p></div></div><DeviceTable devices={records.filter((device) => device.status === "Needs review")} /></div></section>;
}

function Stat({ label, value, indicator }: { label: string; value: string; indicator: string }) {
  return <div className="stat-card"><div className="stat-top"><span className="stat-label">{label}</span><span className="stat-indicator">{indicator}</span></div><div className="stat-value">{value}</div></div>;
}

function DeviceTable({ devices }: { devices: DeviceRecord[] }) {
  if (!devices.length) return <div className="empty-state">No devices in this list.</div>;
  return <div className="table-wrap"><table className="device-table"><thead><tr><th>Device</th><th>Health</th><th>Grade</th><th>Status</th><th>Passport</th></tr></thead><tbody>{devices.map((device) => <tr key={device.id}><td><div className="device-cell"><span className="device-thumb">PC</span><span><span className="device-name">{device.name}</span><span className="device-id">{device.id} | {device.serial}</span></span></div></td><td><span className="score">{device.score}</span>/100</td><td><span className="grade-badge" style={{ width: 31, height: 31, borderRadius: 10, fontSize: 12 }}>{device.grade}</span></td><td><span className={`status-pill ${device.status === "Published" ? "published" : device.status === "Needs review" ? "review" : ""}`}>{device.status}</span></td><td><a className="button secondary small" href={`/passport/${device.id}`}>Open</a></td></tr>)}</tbody></table></div>;
}

function Activity({ icon, title, body, time }: { icon: string; title: string; body: string; time: string }) {
  return <div className="activity"><span className="activity-icon">{icon}</span><p><strong>{title}</strong>{body}</p><time>{time}</time></div>;
}
