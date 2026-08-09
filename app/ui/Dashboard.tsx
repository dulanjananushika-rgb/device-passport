"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { devices, type DeviceRecord } from "../data/devices";

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
  overview: { eyebrow: "Operations", title: "Good morning, Kasun" },
  devices: { eyebrow: "Inventory", title: "Device passports" },
  warranties: { eyebrow: "After-sales", title: "Warranty control" },
  reports: { eyebrow: "Performance", title: "Health reports" },
};

export function Dashboard() {
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [imported, setImported] = useState<DiagnosticImport | null>(null);
  const [importError, setImportError] = useState("");

  const filteredDevices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return devices;
    return devices.filter((device) =>
      [device.name, device.id, device.serial, device.model]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query]);

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
    setModalOpen(false);
    setImported(null);
    setImportError("");
  }

  const title = viewTitles[view];

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <a className="brand" href="#" onClick={() => setView("overview")}>
          <span className="brand-mark">D</span>
          <span className="brand-name">DevicePassport</span>
        </a>

        <div className="nav-label">Workspace</div>
        <div className="nav-stack">
          <NavButton icon="⌂" label="Overview" active={view === "overview"} onClick={() => setView("overview")} />
          <NavButton icon="▣" label="Devices" active={view === "devices"} onClick={() => setView("devices")} />
          <NavButton icon="✓" label="Warranties" active={view === "warranties"} onClick={() => setView("warranties")} />
          <NavButton icon="↗" label="Reports" active={view === "reports"} onClick={() => setView("reports")} />
        </div>

        <div className="nav-label">Manage</div>
        <div className="nav-stack secondary">
          <NavButton icon="♙" label="Technicians" active={false} onClick={() => setView("reports")} />
          <NavButton icon="⚙" label="Settings" active={false} onClick={() => setView("reports")} />
        </div>

        <div className="sidebar-account">
          <span className="avatar">KP</span>
          <span className="account-copy">
            <strong>Kasun Perera</strong>
            <span>Lapmart • Owner</span>
          </span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">{title.eyebrow}</div>
            <h1>{title.title}</h1>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Notifications">
              ◌<span className="notification-dot" />
            </button>
            <button className="button primary" onClick={() => setModalOpen(true)}>
              <span aria-hidden="true">＋</span> New device test
            </button>
          </div>
        </header>

        {view === "overview" && <Overview onNewTest={() => setModalOpen(true)} onViewDevices={() => setView("devices")} />}
        {view === "devices" && (
          <DeviceList devices={filteredDevices} query={query} onQuery={setQuery} onNewTest={() => setModalOpen(true)} />
        )}
        {view === "warranties" && <Warranties />}
        {view === "reports" && <Reports />}
      </main>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-test-title">
            <div className="modal-head">
              <div>
                <div className="eyebrow">Device intake</div>
                <h2 id="new-test-title">Create a verified passport</h2>
              </div>
              <button className="close-button" onClick={closeModal} aria-label="Close dialog">×</button>
            </div>
            <div className="stepper" aria-label="Passport creation progress">
              <div className="step active" data-step="1">Import</div>
              <div className={`step ${imported ? "active" : ""}`} data-step="2">Review</div>
              <div className="step" data-step="3">Publish</div>
            </div>
            <div className="modal-body">
              {imported ? (
                <div className="import-success">
                  <h3>✓ Diagnostic report imported</h3>
                  <div className="import-grid">
                    <div><span>Device</span><strong>{imported.device?.manufacturer} {imported.device?.model}</strong></div>
                    <div><span>Serial</span><strong>{imported.device?.serialNumber}</strong></div>
                    <div><span>Memory</span><strong>{imported.device?.memoryGB ?? "—"} GB</strong></div>
                    <div><span>Battery health</span><strong>{imported.battery?.healthPercent ?? "—"}%</strong></div>
                  </div>
                </div>
              ) : (
                <label className="drop-zone">
                  <span>
                    <span className="drop-icon">JSON</span>
                    <h3>Import the Windows health report</h3>
                    <p>Run the DevicePassport collector on the laptop, then select the generated JSON file here.</p>
                    <span className="button secondary small">Choose report</span>
                    <input className="file-input" type="file" accept="application/json,.json" onChange={handleImport} />
                  </span>
                </label>
              )}
              {importError && <div className="error-box" role="alert">{importError}</div>}
            </div>
            <div className="modal-foot">
              <button className="button secondary" onClick={closeModal}>Cancel</button>
              <button className="button primary" disabled={!imported} onClick={() => { closeModal(); setView("devices"); }}>
                Review device <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
      <span className="nav-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function Overview({ onNewTest, onViewDevices }: { onNewTest: () => void; onViewDevices: () => void }) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">Trust, made visible</div>
          <h2>Every refurbished laptop deserves proof.</h2>
          <p>Run a consistent health test, publish a tamper-aware device passport, and keep the warranty in one place—from intake to after-sales.</p>
          <div className="hero-actions">
            <button className="button primary" onClick={onNewTest}>＋ Test a laptop</button>
            <a className="button secondary" href="/passport/DVP-LK-240831">View customer passport ↗</a>
          </div>
        </div>
        <div className="hero-proof" aria-label="Latest verified device summary">
          <div className="proof-top">
            <div><div className="proof-label">Latest passport</div><div className="proof-device">ThinkPad T14 Gen 2</div></div>
            <div className="grade-badge">A</div>
          </div>
          <div className="health-meter">
            <div className="health-row"><span>Overall health</span><strong>92 / 100</strong></div>
            <div className="meter"><span style={{ width: "92%" }} /></div>
          </div>
          <div className="proof-meta">
            <div><span>Battery</span><strong>87% health</strong></div>
            <div><span>Storage</span><strong>98% healthy</strong></div>
            <div><span>Test ID</span><strong>DVP-240831</strong></div>
            <div><span>Warranty</span><strong>184 days</strong></div>
          </div>
        </div>
      </section>

      <section className="stats" aria-label="Business summary">
        <Stat label="Passports this month" value="148" indicator="+18%" />
        <Stat label="Published devices" value="126" indicator="85.1%" />
        <Stat label="Active warranties" value="94" indicator="Healthy" />
        <Stat label="Open claims" value="03" indicator="1 urgent" />
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-head">
            <div><h3 className="panel-title">Recent device tests</h3><p className="panel-subtitle">Latest technician reports and passport status</p></div>
            <button className="text-link" onClick={onViewDevices}>View all →</button>
          </div>
          <DeviceTable devices={devices.slice(0, 4)} />
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3 className="panel-title">Live activity</h3><p className="panel-subtitle">Today across your shop</p></div></div>
          <div className="activity-list">
            <Activity icon="✓" title="Passport published" body="ThinkPad T14 • DVP-240831" time="4m" />
            <Activity icon="↗" title="QR passport viewed" body="MacBook Air M1 • 12 views" time="18m" />
            <Activity icon="!" title="Review requested" body="EliteBook 840 • Battery below 75%" time="1h" />
            <Activity icon="W" title="Warranty activated" body="Latitude 7420 • 6 months" time="3h" />
          </div>
        </div>
      </section>
    </>
  );
}

function DeviceList({ devices: records, query, onQuery, onNewTest }: { devices: DeviceRecord[]; query: string; onQuery: (value: string) => void; onNewTest: () => void }) {
  return (
    <section className="page-section">
      <div className="section-head">
        <div><div className="eyebrow">{records.length} records</div><h2>Device inventory</h2></div>
        <div className="row-actions">
          <input className="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search name, serial or passport…" aria-label="Search device passports" />
          <button className="button primary" onClick={onNewTest}>＋ New test</button>
        </div>
      </div>
      <div className="panel">
        {records.length ? <DeviceTable devices={records} /> : <div className="empty-state">No passports match “{query}”.</div>}
      </div>
    </section>
  );
}

function Warranties() {
  return (
    <section className="page-section">
      <div className="section-head"><div><div className="eyebrow">94 protected devices</div><h2>Warranty pipeline</h2></div></div>
      <section className="stats">
        <Stat label="Active" value="94" indicator="76%" />
        <Stat label="Expiring in 30 days" value="12" indicator="Follow up" />
        <Stat label="Open claims" value="03" indicator="1 urgent" />
        <Stat label="Resolved this month" value="09" indicator="2.4 days avg" />
      </section>
      <div className="panel">
        <div className="panel-head"><div><h3 className="panel-title">Warranty attention list</h3><p className="panel-subtitle">Devices with upcoming expiry or an active claim</p></div></div>
        <DeviceTable devices={devices.slice(1)} />
      </div>
    </section>
  );
}

function Reports() {
  return (
    <section className="page-section">
      <div className="section-head"><div><div className="eyebrow">August 2026</div><h2>Quality overview</h2></div></div>
      <section className="stats">
        <Stat label="Average health score" value="88.5" indicator="+2.3" />
        <Stat label="Grade A rate" value="72%" indicator="+8%" />
        <Stat label="Battery failures" value="11" indicator="Top issue" />
        <Stat label="Return rate" value="2.1%" indicator="-0.8%" />
      </section>
      <div className="content-grid">
        <div className="panel">
          <div className="panel-head"><div><h3 className="panel-title">Most common review reasons</h3><p className="panel-subtitle">Signals caught before the device reaches a buyer</p></div></div>
          <div className="activity-list">
            <Activity icon="1" title="Battery health below 75%" body="11 devices • 42% of reviews" time="42%" />
            <Activity icon="2" title="Storage warning" body="6 devices • 23% of reviews" time="23%" />
            <Activity icon="3" title="Keyboard or port fault" body="5 devices • 19% of reviews" time="19%" />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3 className="panel-title">Technician accuracy</h3><p className="panel-subtitle">Based on reopened reports</p></div></div>
          <div className="activity-list">
            <Activity icon="KP" title="Kasun Perera" body="81 tests • 98.7% accepted" time="98.7%" />
            <Activity icon="NS" title="Nadeesha Silva" body="67 tests • 97.2% accepted" time="97.2%" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, indicator }: { label: string; value: string; indicator: string }) {
  return <div className="stat-card"><div className="stat-top"><span className="stat-label">{label}</span><span className="stat-indicator">{indicator}</span></div><div className="stat-value">{value}</div></div>;
}

function DeviceTable({ devices: records }: { devices: DeviceRecord[] }) {
  return (
    <div className="table-wrap">
      <table className="device-table">
        <thead><tr><th>Device</th><th>Health</th><th>Grade</th><th>Status</th><th>Passport</th></tr></thead>
        <tbody>
          {records.map((device) => (
            <tr key={device.id}>
              <td><div className="device-cell"><span className="device-thumb">▰</span><span><span className="device-name">{device.name}</span><span className="device-id">{device.id} • {device.serial}</span></span></div></td>
              <td><span className="score">{device.score}</span>/100</td>
              <td><span className="grade-badge" style={{ width: 31, height: 31, borderRadius: 10, fontSize: 12 }}>{device.grade}</span></td>
              <td><span className={`status-pill ${device.status === "Published" ? "published" : device.status === "Needs review" ? "review" : ""}`}>{device.status}</span></td>
              <td><a className="button secondary small" href={`/passport/${device.id}`}>Open ↗</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Activity({ icon, title, body, time }: { icon: string; title: string; body: string; time: string }) {
  return <div className="activity"><span className="activity-icon">{icon}</span><p><strong>{title}</strong>{body}</p><time>{time}</time></div>;
}
