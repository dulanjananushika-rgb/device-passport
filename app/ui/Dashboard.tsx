"use client";

import { ChangeEvent, useMemo, useState } from "react";
import Image from "next/image";
import type { DeviceRecord } from "../data/devices";
import { claimStatuses, type ClaimStatus, type WarrantyClaimSummary } from "../../lib/claims";
import {
  calculateInspectionScore,
  inspectionKeys,
  inspectionLabels,
  type CheckStatus,
  type DiagnosticReport,
  type InspectionChecks,
  type InspectionKey,
  type InspectionPhotoInput,
} from "../../lib/inspection";

type View = "overview" | "devices" | "warranties" | "reports";
type WizardStage = 1 | 2 | 3;

const viewTitles: Record<View, { eyebrow: string; title: string }> = {
  overview: { eyebrow: "Operations", title: "Shop overview" },
  devices: { eyebrow: "Inventory", title: "Device passports" },
  warranties: { eyebrow: "After-sales", title: "Warranty claims" },
  reports: { eyebrow: "Performance", title: "Health reports" },
};

export function Dashboard({ initialDevices, initialClaims, userEmail }: { initialDevices: DeviceRecord[]; initialClaims: WarrantyClaimSummary[]; userEmail: string }) {
  const [records, setRecords] = useState(initialDevices);
  const [claims, setClaims] = useState(initialClaims);
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [stage, setStage] = useState<WizardStage>(1);
  const [imported, setImported] = useState<DiagnosticReport | null>(null);
  const [checks, setChecks] = useState<Partial<Record<InspectionKey, CheckStatus>>>({});
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<InspectionPhotoInput[]>([]);
  const [approved, setApproved] = useState(false);
  const [createdDevice, setCreatedDevice] = useState<DeviceRecord | null>(null);
  const [importError, setImportError] = useState("");
  const [saving, setSaving] = useState(false);

  const checksComplete = inspectionKeys.every((key) => checks[key] === "pass" || checks[key] === "fail");
  const scorePreview = imported && checksComplete
    ? calculateInspectionScore(imported, checks as InspectionChecks)
    : null;

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
        const parsed = JSON.parse(String(reader.result)) as DiagnosticReport;
        if (!parsed.device?.serialNumber || !parsed.device?.model) {
          throw new Error("The report is missing a device model or serial number.");
        }
        setImported(parsed);
        setStage(2);
      } catch (error) {
        setImported(null);
        setImportError(error instanceof Error ? error.message : "This report could not be read.");
      }
    };
    reader.readAsText(file);
  }

  function setCheck(key: InspectionKey, status: CheckStatus) {
    setChecks((current) => ({ ...current, [key]: status }));
  }

  async function handlePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setImportError("");
    if (files.length + photos.length > 4) {
      setImportError("A maximum of four evidence photos is allowed.");
      return;
    }
    const tooLarge = files.find((file) => file.size > 2 * 1024 * 1024);
    if (tooLarge) {
      setImportError(`${tooLarge.name} is larger than 2 MB.`);
      return;
    }
    const encoded = await Promise.all(files.map((file) => readPhoto(file)));
    setPhotos((current) => [...current, ...encoded]);
    event.target.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setStage(1);
    setImported(null);
    setChecks({});
    setNotes("");
    setPhotos([]);
    setApproved(false);
    setCreatedDevice(null);
    setImportError("");
  }

  async function publishPassport() {
    if (!imported || !checksComplete || !approved) return;
    setSaving(true);
    setImportError("");
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ report: imported, checks, notes, photos }),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setImportError(result.error ?? "The passport could not be created.");
      setSaving(false);
      return;
    }

    setRecords((current) => [result.device as DeviceRecord, ...current]);
    setCreatedDevice(result.device as DeviceRecord);
    setSaving(false);
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  const title = viewTitles[view];
  const publishedCount = records.filter((device) => device.status === "Published").length;
  const reviewCount = records.filter((device) => device.status === "Needs review").length;
  const openClaimCount = claims.filter((claim) => claim.status !== "Completed" && claim.status !== "Rejected").length;

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
          <NavButton icon="C" label="Claims" active={view === "warranties"} onClick={() => setView("warranties")} />
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
            <button className="icon-button" aria-label="Notifications">N{openClaimCount > 0 && <span className="notification-dot" />}</button>
            <button className="button primary" onClick={() => setModalOpen(true)}>+ New device test</button>
          </div>
        </header>

        {view === "overview" && (
          <Overview records={records} publishedCount={publishedCount} reviewCount={reviewCount} openClaimCount={openClaimCount} onNewTest={() => setModalOpen(true)} onViewDevices={() => setView("devices")} />
        )}
        {view === "devices" && <DeviceList devices={filteredDevices} query={query} onQuery={setQuery} onNewTest={() => setModalOpen(true)} />}
        {view === "warranties" && <Warranties records={records} claims={claims} onClaimUpdate={(updated) => setClaims((current) => current.map((claim) => claim.id === updated.id ? updated : claim))} />}
        {view === "reports" && <Reports records={records} />}
      </main>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-test-title">
            <div className="modal-head">
              <div><div className="eyebrow">Technician workflow</div><h2 id="new-test-title">{createdDevice ? "Passport ready" : "Create a verified passport"}</h2></div>
              <button className="close-button" onClick={closeModal} aria-label="Close dialog">x</button>
            </div>
            {!createdDevice && <div className="stepper" aria-label="Passport creation progress"><div className={`step ${stage >= 1 ? "active" : ""}`} data-step="1">Import</div><div className={`step ${stage >= 2 ? "active" : ""}`} data-step="2">Inspect</div><div className={`step ${stage >= 3 ? "active" : ""}`} data-step="3">Approve</div></div>}
            <div className="modal-body wizard-body">
              {createdDevice ? (
                <div className="publish-success"><span className="publish-check">OK</span><div className="eyebrow">Published successfully</div><h3>{createdDevice.name}</h3><p>{createdDevice.id} is saved with a Grade {createdDevice.grade} health score of {createdDevice.score}/100.</p><div className="publish-actions"><a className="button secondary" href={`/passport/${createdDevice.id}`}>Open public passport</a><a className="button primary" href={`/label/${createdDevice.id}`}>Print QR label</a></div></div>
              ) : stage === 1 ? (
                <label className="drop-zone"><span><span className="drop-icon">JSON</span><h3>Import the Windows health report</h3><p>Run the DevicePassport collector on the laptop, then select its generated report.</p><span className="button secondary small">Choose report</span><input className="file-input" type="file" accept="application/json,.json" onChange={handleImport} /></span></label>
              ) : stage === 2 && imported ? (
                <div className="wizard-section">
                  <div className="import-success compact"><h3>Automatic report connected</h3><div className="import-grid"><div><span>Device</span><strong>{imported.device?.manufacturer} {imported.device?.model}</strong></div><div><span>Serial</span><strong>{imported.device?.serialNumber}</strong></div><div><span>Memory</span><strong>{imported.device?.memoryGB ?? "-"} GB</strong></div><div><span>Battery</span><strong>{imported.battery?.healthPercent ?? "-"}%</strong></div></div></div>
                  <div className="wizard-title"><div><h3>Manual hardware inspection</h3><p>Test every item and record the actual result.</p></div><span>{Object.keys(checks).length}/{inspectionKeys.length} complete</span></div>
                  <div className="inspection-list">{inspectionKeys.map((key) => <InspectionControl key={key} checkKey={key} value={checks[key]} onChange={setCheck} />)}</div>
                  <label className="notes-field">Technician notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Cosmetic marks, replaced parts, or anything the buyer should know" maxLength={800} /></label>
                </div>
              ) : imported && scorePreview ? (
                <div className="wizard-section">
                  <div className="score-preview"><div><div className="eyebrow">Calculated result</div><strong>{scorePreview.score}<small>/100</small></strong><span>{scorePreview.needsReview ? "Needs technician review" : "Ready to publish"}</span></div><div className="grade-badge preview-grade">{scorePreview.grade}</div></div>
                  <div className="score-breakdown"><div><span>Battery</span><strong>{scorePreview.batteryHealth}%</strong></div><div><span>Storage</span><strong>{scorePreview.storageHealth}%</strong></div><div><span>Manual checks</span><strong>{scorePreview.manualScore}%</strong></div></div>
                  <div className="photo-section"><div className="wizard-title"><div><h3>Photo evidence</h3><p>Add up to four JPEG, PNG, or WebP photos. Maximum 2 MB each.</p></div><span>{photos.length}/4</span></div><div className="photo-grid">{photos.map((photo, index) => <div className="photo-preview" key={`${photo.name}-${index}`}><Image src={photo.dataUrl} alt={photo.name} width={160} height={100} unoptimized /><button type="button" onClick={() => removePhoto(index)} aria-label={`Remove ${photo.name}`}>x</button><span>{photo.name}</span></div>)}{photos.length < 4 && <label className="photo-add">+<span>Add photos</span><input className="file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handlePhotos} /></label>}</div></div>
                  <label className="approval-check"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /><span><strong>I approve this inspection</strong><small>I confirm the automatic report and manual checks match this physical device.</small></span></label>
                </div>
              ) : null}
              {importError && <div className="error-box" role="alert">{importError}</div>}
            </div>
            <div className="modal-foot">
              {createdDevice ? <><button className="button secondary" onClick={() => { closeModal(); setView("devices"); }}>Done</button><a className="button primary" href={`/label/${createdDevice.id}`}>Print label</a></> : <><button className="button secondary" onClick={stage === 1 ? closeModal : () => setStage((stage - 1) as WizardStage)} disabled={saving}>{stage === 1 ? "Cancel" : "Back"}</button>{stage < 3 ? <button className="button primary" disabled={stage === 1 ? !imported : !checksComplete} onClick={() => setStage((stage + 1) as WizardStage)}>Continue</button> : <button className="button primary" disabled={!approved || saving} onClick={publishPassport}>{saving ? "Saving passport..." : "Approve & publish"}</button>}</>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function InspectionControl({ checkKey, value, onChange }: { checkKey: InspectionKey; value?: CheckStatus; onChange: (key: InspectionKey, status: CheckStatus) => void }) {
  const copy = inspectionLabels[checkKey];
  return <div className="inspection-control"><div><strong>{copy.label}</strong><span>{copy.hint}</span></div><div className="check-options"><button type="button" className={value === "pass" ? "selected pass" : ""} onClick={() => onChange(checkKey, "pass")}>Pass</button><button type="button" className={value === "fail" ? "selected fail" : ""} onClick={() => onChange(checkKey, "fail")}>Fail</button></div></div>;
}

function readPhoto(file: File): Promise<InspectionPhotoInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function NavButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}><span className="nav-icon" aria-hidden="true">{icon}</span><span>{label}</span></button>;
}

function Overview({ records, publishedCount, reviewCount, openClaimCount, onNewTest, onViewDevices }: { records: DeviceRecord[]; publishedCount: number; reviewCount: number; openClaimCount: number; onNewTest: () => void; onViewDevices: () => void }) {
  const latest = records[0];
  return (
    <>
      <section className="hero">
        <div className="hero-copy"><div className="hero-kicker">Trust, made visible</div><h2>Every refurbished laptop deserves proof.</h2><p>Run a consistent health test, publish a transparent device passport, and keep the warranty in one place from intake to after-sales.</p><div className="hero-actions"><button className="button primary" onClick={onNewTest}>+ Test a laptop</button>{latest && <a className="button secondary" href={`/passport/${latest.id}`}>View customer passport</a>}</div></div>
        {latest && <div className="hero-proof" aria-label="Latest verified device summary"><div className="proof-top"><div><div className="proof-label">Latest passport</div><div className="proof-device">{latest.name}</div></div><div className="grade-badge">{latest.grade}</div></div><div className="health-meter"><div className="health-row"><span>Overall health</span><strong>{latest.score} / 100</strong></div><div className="meter"><span style={{ width: `${latest.score}%` }} /></div></div><div className="proof-meta"><div><span>Battery</span><strong>{latest.batteryHealth}% health</strong></div><div><span>Storage</span><strong>{latest.storageHealth}% healthy</strong></div><div><span>Test ID</span><strong>{latest.id}</strong></div><div><span>Status</span><strong>{latest.status}</strong></div></div></div>}
      </section>
      <section className="stats" aria-label="Business summary"><Stat label="Total passports" value={String(records.length)} indicator="Live DB" /><Stat label="Published devices" value={String(publishedCount)} indicator={`${Math.round((publishedCount / Math.max(records.length, 1)) * 100)}%`} /><Stat label="Needs review" value={String(reviewCount)} indicator={reviewCount ? "Attention" : "Clear"} /><Stat label="Open claims" value={String(openClaimCount)} indicator={openClaimCount ? "Action needed" : "Clear"} /></section>
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

function Warranties({ records, claims, onClaimUpdate }: { records: DeviceRecord[]; claims: WarrantyClaimSummary[]; onClaimUpdate: (claim: WarrantyClaimSummary) => void }) {
  const [selectedId, setSelectedId] = useState(claims[0]?.id ?? "");
  const [nextStatus, setNextStatus] = useState<ClaimStatus>(claims[0]?.status ?? "New");
  const [publicNote, setPublicNote] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [referenceTime] = useState(() => Date.now());
  const selected = claims.find((claim) => claim.id === selectedId) ?? claims[0];
  const activeCoverage = records.filter((device) => {
    const expiry = Date.parse(device.warrantyEnds);
    return Number.isFinite(expiry) && expiry + 24 * 60 * 60 * 1000 > referenceTime;
  }).length;
  const openClaims = claims.filter((claim) => claim.status !== "Completed" && claim.status !== "Rejected").length;
  const completedClaims = claims.filter((claim) => claim.status === "Completed").length;

  function chooseClaim(claim: WarrantyClaimSummary) {
    setSelectedId(claim.id);
    setNextStatus(claim.status);
    setPublicNote("");
    setUpdateError("");
  }

  async function updateClaim() {
    if (!selected) return;
    setUpdating(true);
    setUpdateError("");
    const response = await fetch(`/api/claims/${encodeURIComponent(selected.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus, note: publicNote }),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setUpdateError(result.error ?? "The claim could not be updated.");
      setUpdating(false);
      return;
    }
    onClaimUpdate(result.claim as WarrantyClaimSummary);
    setPublicNote("");
    setUpdating(false);
  }

  return (
    <section className="page-section">
      <div className="section-head"><div><div className="eyebrow">{claims.length} customer requests</div><h2>Warranty pipeline</h2></div></div>
      <section className="stats"><Stat label="Active coverage" value={String(activeCoverage)} indicator="Current" /><Stat label="New claims" value={String(claims.filter((claim) => claim.status === "New").length)} indicator="Inbox" /><Stat label="Open claims" value={String(openClaims)} indicator={openClaims ? "Action needed" : "Clear"} /><Stat label="Completed" value={String(completedClaims)} indicator="All time" /></section>

      {claims.length ? (
        <div className="claims-workspace">
          <section className="panel claims-inbox">
            <div className="panel-head"><div><h3 className="panel-title">Claims inbox</h3><p className="panel-subtitle">Newest activity appears first</p></div></div>
            <div className="claim-list">
              {claims.map((claim) => (
                <button type="button" key={claim.id} className={`claim-list-item ${selected?.id === claim.id ? "selected" : ""}`} onClick={() => chooseClaim(claim)}>
                  <span className={`claim-status status-${claim.status.toLowerCase()}`}>{claim.status}</span>
                  <strong>{claim.deviceName}</strong>
                  <span>{claim.category} • {claim.customerName}</span>
                  <small>{claim.id} • {formatClaimDate(claim.updatedAt)}</small>
                </button>
              ))}
            </div>
          </section>

          {selected && (
            <section className="panel claim-detail">
              <div className="claim-detail-head">
                <div><div className="eyebrow">{selected.id}</div><h3>{selected.category} claim</h3><p>{selected.deviceName} • {selected.deviceId}</p></div>
                <span className={`coverage-chip ${selected.warrantyValid ? "active" : "expired"}`}>{selected.warrantyValid ? "Coverage confirmed" : "Coverage review"}</span>
              </div>
              <div className="claim-detail-grid">
                <div><span>Customer</span><strong>{selected.customerName}</strong></div>
                <div><span>Contact</span><strong>{selected.customerEmail || selected.customerPhone}</strong>{selected.customerEmail && selected.customerPhone && <small>{selected.customerPhone}</small>}</div>
                <div><span>Submitted</span><strong>{formatClaimDate(selected.createdAt)}</strong></div>
                <div><span>Evidence</span><strong>{selected.photoCount} photo{selected.photoCount === 1 ? "" : "s"}</strong></div>
              </div>
              <div className="claim-description-box"><span>Customer description</span><p>{selected.description}</p></div>
              <a className="text-link" href={`/claim/${selected.trackingToken}`} target="_blank" rel="noreferrer">Open private customer tracker ↗</a>

              <div className="claim-update-box">
                <div><h4>Update customer</h4><p>This status and note will appear on the private tracking page.</p></div>
                <div className="claim-update-fields">
                  <label>Status<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as ClaimStatus)}>{claimStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                  <label>Customer update<textarea value={publicNote} onChange={(event) => setPublicNote(event.target.value)} maxLength={600} placeholder="Optional — a clear default update is used when empty" /></label>
                </div>
                {updateError && <div className="error-box" role="alert">{updateError}</div>}
                <button className="button primary" type="button" disabled={updating || (nextStatus === selected.status && !publicNote.trim())} onClick={updateClaim}>{updating ? "Saving update…" : "Save status update"}</button>
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="panel empty-claims"><span>✓</span><h3>No warranty claims yet</h3><p>Customer requests submitted from a public device passport will appear here automatically.</p></div>
      )}
    </section>
  );
}

function formatClaimDate(value: string) {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
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
