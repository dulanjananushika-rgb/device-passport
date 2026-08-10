"use client";

import { ChangeEvent, useMemo, useState } from "react";
import Image from "next/image";
import type { DeviceRecord } from "../data/devices";
import type { StaffSession } from "../../lib/auth";
import { claimPriorities, claimStatuses, type ClaimAssignee, type ClaimPriority, type ClaimStatus, type WarrantyClaimSummary } from "../../lib/claims";
import { canActivateSales, staffRoles, type AuditEvent, type ShopSettings, type StaffAccount, type StaffRole } from "../../lib/operations";
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
import { SalesPanel } from "./SalesPanel";
import { RecoveryPanel } from "./RecoveryPanel";
import { NotificationCenter } from "./NotificationCenter";
import { AnalyticsPanel } from "./AnalyticsPanel";
import type { SystemReadiness } from "../../lib/readiness";
import type { NotificationItem } from "../../lib/notifications";
import type { FinanceAnalytics } from "../../lib/finance";
import type { ProcurementDashboard } from "../../lib/procurement-types";
import { ProcurementPanel } from "./ProcurementPanel";

type View = "overview" | "procurement" | "devices" | "sales" | "warranties" | "notifications" | "reports" | "analytics" | "staff" | "settings";
type WizardStage = 1 | 2 | 3;

const viewTitles: Record<View, { eyebrow: string; title: string }> = {
  overview: { eyebrow: "Operations", title: "Shop overview" },
  procurement: { eyebrow: "Stock operations", title: "Supplier & inventory intake" },
  devices: { eyebrow: "Inventory", title: "Device passports" },
  sales: { eyebrow: "Customer handover", title: "Sales activation" },
  warranties: { eyebrow: "After-sales", title: "Warranty claims" },
  notifications: { eyebrow: "Customer follow-up", title: "Notification centre" },
  reports: { eyebrow: "Performance", title: "Health reports" },
  analytics: { eyebrow: "Business intelligence", title: "Profit & reliability" },
  staff: { eyebrow: "Access control", title: "Staff accounts" },
  settings: { eyebrow: "Configuration", title: "Shop settings" },
};

type DashboardProps = {
  initialDevices: DeviceRecord[];
  initialClaims: WarrantyClaimSummary[];
  initialClaimAssignees: ClaimAssignee[];
  initialNotifications: NotificationItem[];
  initialStaff: StaffAccount[];
  initialAudit: AuditEvent[];
  initialSettings: ShopSettings;
  initialSystem: SystemReadiness | null;
  initialAnalytics: FinanceAnalytics | null;
  initialProcurement: ProcurementDashboard | null;
  session: StaffSession;
};

export function Dashboard({ initialDevices, initialClaims, initialClaimAssignees, initialNotifications, initialStaff, initialAudit, initialSettings, initialSystem, initialAnalytics, initialProcurement, session }: DashboardProps) {
  const [records, setRecords] = useState(initialDevices);
  const [claims, setClaims] = useState(initialClaims);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [staff, setStaff] = useState(initialStaff);
  const [audit, setAudit] = useState(initialAudit);
  const [settings, setSettings] = useState(initialSettings);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [procurement, setProcurement] = useState(initialProcurement);
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
  const [referenceTime] = useState(() => Date.now());

  const checksComplete = inspectionKeys.every((key) => checks[key] === "pass" || checks[key] === "fail");
  const scorePreview = imported && checksComplete
    ? calculateInspectionScore(imported, checks as InspectionChecks)
    : null;

  const filteredDevices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((device) =>
      [device.name, device.id, device.serial, device.model, device.sale?.customerName, device.sale?.customerEmail, device.sale?.customerPhone, device.sale?.invoiceReference].filter(Boolean).join(" ").toLowerCase().includes(needle),
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
    if (procurement) await refreshProcurement();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  const title = viewTitles[view];
  const reviewCount = records.filter((device) => device.status === "Needs review").length;
  const openClaimCount = claims.filter((claim) => claim.status !== "Completed" && claim.status !== "Rejected").length;
  const activeNotificationCount = notifications.filter((notification) => notification.status === "Pending" || notification.status === "Opened").length;
  const canTestDevices = session.role === "Owner" || session.role === "Technician";
  const canActivateDeviceSales = canActivateSales(session.role);
  const isOwner = session.role === "Owner";
  const readyCount = records.filter((device) => device.lifecycleStatus === "Ready").length;
  const soldCount = records.filter((device) => device.lifecycleStatus === "Sold").length;
  const expiringCount = records.filter((device) => {
    const expiry = Date.parse(device.sale?.warrantyEnds ?? "");
    const days = (expiry - referenceTime) / 86_400_000;
    return days >= 0 && days <= 30;
  }).length;

  function updateDevice(updated: DeviceRecord) {
    setRecords((current) => current.map((device) => device.id === updated.id ? updated : device));
  }

  async function refreshAudit() {
    if (!isOwner) return;
    const response = await fetch("/api/audit");
    if (!response.ok) return;
    const result = await response.json();
    setAudit(result.audit as AuditEvent[]);
  }

  async function openNotifications() {
    setView("notifications");
    const response = await fetch("/api/notifications");
    if (!response.ok) return;
    const result = await response.json();
    setNotifications(result.notifications as NotificationItem[]);
  }

  async function openAnalytics() {
    if (!isOwner) return;
    setView("analytics");
    const response = await fetch("/api/analytics", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    setAnalytics(result.analytics as FinanceAnalytics);
  }

  async function refreshProcurement() {
    const response = await fetch("/api/procurement", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    setProcurement(result.procurement as ProcurementDashboard);
  }

  async function openProcurement() {
    if (!procurement) return;
    setView("procurement");
    await refreshProcurement();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <button className="brand brand-button" onClick={() => setView("overview")}>
          {settings.logoDataUrl ? <Image className="brand-logo-image" src={settings.logoDataUrl} alt="" width={32} height={32} unoptimized /> : <span className="brand-mark">{settings.shopName.slice(0, 1).toUpperCase()}</span>}<span className="brand-name">{settings.shopName}</span>
        </button>

        <div className="nav-label">Workspace</div>
        <div className="nav-stack">
          <NavButton icon="H" label="Overview" active={view === "overview"} onClick={() => setView("overview")} />
          {procurement && <NavButton icon="I" label="Intake" active={view === "procurement"} onClick={openProcurement} />}
          <NavButton icon="D" label="Devices" active={view === "devices"} onClick={() => setView("devices")} />
          <NavButton icon="$" label="Sales" active={view === "sales"} onClick={() => setView("sales")} />
          <NavButton icon="C" label="Claims" active={view === "warranties"} onClick={() => setView("warranties")} />
          <NavButton icon="N" label="Notifications" active={view === "notifications"} onClick={openNotifications} />
          <NavButton icon="R" label="Reports" active={view === "reports"} onClick={() => setView("reports")} />
          {isOwner && <NavButton icon="P" label="Analytics" active={view === "analytics"} onClick={openAnalytics} />}
          {isOwner && <NavButton icon="T" label="Staff" active={view === "staff"} onClick={() => setView("staff")} />}
          <NavButton icon="S" label="Settings" active={view === "settings"} onClick={() => setView("settings")} />
        </div>

        <div className="sidebar-account">
          <span className="avatar">{initials(session.name)}</span>
          <span className="account-copy"><strong>{session.name}</strong><span>{session.role}</span></span>
          <button className="logout-button" onClick={signOut} title="Sign out" aria-label="Sign out">-&gt;</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><div className="eyebrow">{title.eyebrow}</div><h1>{title.title}</h1></div>
          <div className="top-actions">
            <button className="icon-button" aria-label={`Notifications${activeNotificationCount ? ` (${activeNotificationCount})` : ""}`} onClick={openNotifications}>N{activeNotificationCount > 0 && <small>{activeNotificationCount > 9 ? "9+" : activeNotificationCount}</small>}</button>
            {canTestDevices && <button className="button primary" onClick={() => setModalOpen(true)}>+ New device test</button>}
          </div>
        </header>

        {view === "overview" && (
          <Overview records={records} readyCount={readyCount} soldCount={soldCount} expiringCount={expiringCount} reviewCount={reviewCount} openClaimCount={openClaimCount} canCreate={canTestDevices} onNewTest={() => setModalOpen(true)} onViewDevices={() => setView("devices")} onViewSales={() => setView("sales")} />
        )}
        {view === "procurement" && procurement && <ProcurementPanel procurement={procurement} canManage={isOwner} onProcurementChange={setProcurement} onAuditChange={refreshAudit} onStartTest={() => setModalOpen(true)} />}
        {view === "devices" && <DeviceList devices={filteredDevices} query={query} onQuery={setQuery} onNewTest={() => setModalOpen(true)} canCreate={canTestDevices} />}
        {view === "sales" && <SalesPanel devices={records} canActivate={canActivateDeviceSales} warrantyMonths={settings.warrantyMonths} onDeviceChange={updateDevice} onAuditChange={refreshAudit} />}
        {view === "warranties" && <Warranties records={records} claims={claims} assignees={initialClaimAssignees} currentStaffId={session.id} canRecordCosts={session.role === "Owner" || session.role === "Technician"} onClaimUpdate={(updated) => setClaims((current) => current.map((claim) => claim.id === updated.id ? updated : claim))} />}
        {view === "notifications" && <NotificationCenter initialNotifications={notifications} onNotificationsChange={setNotifications} />}
        {view === "reports" && <Reports records={records} />}
        {view === "analytics" && isOwner && analytics && <AnalyticsPanel analytics={analytics} onAnalyticsChange={setAnalytics} onAuditChange={refreshAudit} />}
        {view === "staff" && isOwner && <StaffPanel staff={staff} audit={audit} currentStaffId={session.id} onStaffChange={setStaff} onAuditChange={refreshAudit} />}
        {view === "settings" && <SettingsPanel settings={settings} session={session} initialSystem={initialSystem} onSettingsChange={setSettings} onAuditChange={refreshAudit} />}
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
                  <div className="import-success compact"><h3>Tester V2 report connected</h3><div className="import-grid"><div><span>Device</span><strong>{imported.device?.manufacturer} {imported.device?.model}</strong></div><div><span>Serial</span><strong>{imported.device?.serialNumber}</strong></div><div><span>Memory</span><strong>{imported.device?.memoryGB ?? "-"} GB</strong></div><div><span>Battery</span><strong>{imported.battery?.healthPercent ?? "-"}%</strong></div><div><span>Battery cycles</span><strong>{imported.battery?.cycleCount ?? "Not exposed"}</strong></div><div><span>SSD usage</span><strong>{formatHours(imported.storage?.[0]?.powerOnHours)}</strong></div><div><span>CPU stress</span><strong>{formatStress(imported)}</strong></div><div><span>CPU peak</span><strong>{formatTemperature(imported.performance?.stressTest?.peakTemperatureC)}</strong></div></div></div>
                  <div className="wizard-title"><div><h3>Manual hardware inspection</h3><p>Test every item and record the actual result.</p></div><span>{Object.keys(checks).length}/{inspectionKeys.length} complete</span></div>
                  <div className="inspection-list">{inspectionKeys.map((key) => <InspectionControl key={key} checkKey={key} value={checks[key]} onChange={setCheck} />)}</div>
                  <label className="notes-field">Technician notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Cosmetic marks, replaced parts, or anything the buyer should know" maxLength={800} /></label>
                </div>
              ) : imported && scorePreview ? (
                <div className="wizard-section">
                  <div className="score-preview"><div><div className="eyebrow">Calculated result</div><strong>{scorePreview.score}<small>/100</small></strong><span>{scorePreview.needsReview ? "Needs technician review" : "Ready to publish"}</span></div><div className="grade-badge preview-grade">{scorePreview.grade}</div></div>
                  <div className="score-breakdown"><div><span>Battery</span><strong>{scorePreview.batteryHealth}%</strong></div><div><span>Storage</span><strong>{scorePreview.storageHealth}%</strong></div><div><span>CPU stability</span><strong>{scorePreview.performanceScore}%</strong></div><div><span>Manual checks</span><strong>{scorePreview.manualScore}%</strong></div></div>
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

function formatHours(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value).toLocaleString("en-US")} hours` : "Not exposed";
}

function formatTemperature(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}°C` : "Not exposed";
}

function formatStress(report: DiagnosticReport) {
  const stress = report.performance?.stressTest;
  if (!stress?.executed) return "Not run";
  return stress.passed ? `Passed · ${stress.durationSeconds ?? "?"} sec` : "Review required";
}

function NavButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}><span className="nav-icon" aria-hidden="true">{icon}</span><span>{label}</span></button>;
}

function Overview({ records, readyCount, soldCount, expiringCount, reviewCount, openClaimCount, canCreate, onNewTest, onViewDevices, onViewSales }: { records: DeviceRecord[]; readyCount: number; soldCount: number; expiringCount: number; reviewCount: number; openClaimCount: number; canCreate: boolean; onNewTest: () => void; onViewDevices: () => void; onViewSales: () => void }) {
  const latest = records[0];
  return (
    <>
      <section className="hero">
        <div className="hero-copy"><div className="hero-kicker">Trust, made visible</div><h2>Every refurbished laptop deserves proof.</h2><p>Run a consistent health test, activate coverage at handover, and keep the warranty in one place from intake to after-sales.</p><div className="hero-actions">{canCreate && <button className="button primary" onClick={onNewTest}>+ Test a laptop</button>}{readyCount > 0 && <button className="button secondary" onClick={onViewSales}>Activate a sale</button>}{latest && <a className="text-link hero-passport-link" href={`/passport/${latest.id}`}>Open latest passport</a>}</div></div>
        {latest && <div className="hero-proof" aria-label="Latest verified device summary"><div className="proof-top"><div><div className="proof-label">Latest passport</div><div className="proof-device">{latest.name}</div></div><div className="grade-badge">{latest.grade}</div></div><div className="health-meter"><div className="health-row"><span>Overall health</span><strong>{latest.score} / 100</strong></div><div className="meter"><span style={{ width: `${latest.score}%` }} /></div></div><div className="proof-meta"><div><span>Battery</span><strong>{latest.batteryHealth}% health</strong></div><div><span>Storage</span><strong>{latest.storageHealth}% healthy</strong></div><div><span>Test ID</span><strong>{latest.id}</strong></div><div><span>Status</span><strong>{latest.status}</strong></div></div></div>}
      </section>
      <section className="stats" aria-label="Business summary"><Stat label="Total passports" value={String(records.length)} indicator="Live DB" /><Stat label="Ready to sell" value={String(readyCount)} indicator="Verified stock" /><Stat label="Warranties activated" value={String(soldCount)} indicator="Customer handovers" /><Stat label="Expiring in 30 days" value={String(expiringCount)} indicator={expiringCount ? "Follow up" : "Clear"} /></section>
      <section className="content-grid">
        <div className="panel"><div className="panel-head"><div><h3 className="panel-title">Recent device tests</h3><p className="panel-subtitle">Saved in your standalone database</p></div><button className="text-link" onClick={onViewDevices}>View all</button></div><DeviceTable devices={records.slice(0, 4)} /></div>
        <div className="panel"><div className="panel-head"><div><h3 className="panel-title">Action centre</h3><p className="panel-subtitle">What needs the shop team next</p></div></div><div className="activity-list"><Activity icon="$" title="Ready for handover" body={`${readyCount} verified device${readyCount === 1 ? "" : "s"} waiting for a buyer`} time={readyCount ? "Open" : "Clear"} /><Activity icon="QC" title="Inspection review" body={`${reviewCount} passport${reviewCount === 1 ? "" : "s"} need attention`} time={reviewCount ? "Review" : "Clear"} /><Activity icon="C" title="Warranty inbox" body={`${openClaimCount} open customer claim${openClaimCount === 1 ? "" : "s"}`} time={openClaimCount ? "Action" : "Clear"} /></div></div>
      </section>
    </>
  );
}

function DeviceList({ devices, query, canCreate, onQuery, onNewTest }: { devices: DeviceRecord[]; query: string; canCreate: boolean; onQuery: (value: string) => void; onNewTest: () => void }) {
  return <section className="page-section"><div className="section-head"><div><div className="eyebrow">{devices.length} records</div><h2>Device inventory</h2></div><div className="row-actions"><input className="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search name, serial or passport" aria-label="Search device passports" />{canCreate && <button className="button primary" onClick={onNewTest}>+ New test</button>}</div></div><div className="panel">{devices.length ? <DeviceTable devices={devices} /> : <div className="empty-state">No passports match &quot;{query}&quot;.</div>}</div></section>;
}

type ClaimQueueFilter = "Open" | "Mine" | "Overdue" | "Urgent" | "All";

function Warranties({ records, claims, assignees, currentStaffId, canRecordCosts, onClaimUpdate }: { records: DeviceRecord[]; claims: WarrantyClaimSummary[]; assignees: ClaimAssignee[]; currentStaffId: string; canRecordCosts: boolean; onClaimUpdate: (claim: WarrantyClaimSummary) => void }) {
  const firstClaim = claims.find((claim) => claim.status !== "Completed" && claim.status !== "Rejected") ?? claims[0];
  const [selectedId, setSelectedId] = useState(firstClaim?.id ?? "");
  const [filter, setFilter] = useState<ClaimQueueFilter>(claims.some((claim) => claim.status !== "Completed" && claim.status !== "Rejected") ? "Open" : "All");
  const [nextStatus, setNextStatus] = useState<ClaimStatus>(firstClaim?.status ?? "New");
  const [publicNote, setPublicNote] = useState("");
  const [priority, setPriority] = useState<ClaimPriority>(firstClaim?.priority ?? "Normal");
  const [assignedToId, setAssignedToId] = useState(firstClaim?.assignedToId ?? "");
  const [dueDate, setDueDate] = useState(firstClaim?.dueDate ?? "");
  const [internalNote, setInternalNote] = useState("");
  const [serviceCostLkr, setServiceCostLkr] = useState(() => firstClaim ? String(firstClaim.serviceCostCents / 100) : "0");
  const [updateError, setUpdateError] = useState("");
  const [serviceSuccess, setServiceSuccess] = useState("");
  const [updating, setUpdating] = useState(false);
  const [referenceTime] = useState(() => Date.now());
  const today = new Date(referenceTime).toISOString().slice(0, 10);
  const isOpen = (claim: WarrantyClaimSummary) => claim.status !== "Completed" && claim.status !== "Rejected";
  const isOverdue = (claim: WarrantyClaimSummary) => isOpen(claim) && claim.dueDate < today;
  const visibleClaims = claims.filter((claim) => {
    if (filter === "Open") return isOpen(claim);
    if (filter === "Mine") return isOpen(claim) && claim.assignedToId === currentStaffId;
    if (filter === "Overdue") return isOverdue(claim);
    if (filter === "Urgent") return isOpen(claim) && claim.priority === "Urgent";
    return true;
  });
  const selected = claims.find((claim) => claim.id === selectedId) ?? visibleClaims[0] ?? claims[0];
  const activeCoverage = records.filter((device) => {
    const expiry = Date.parse(device.warrantyEnds);
    return Number.isFinite(expiry) && expiry + 24 * 60 * 60 * 1000 > referenceTime;
  }).length;
  const openClaims = claims.filter(isOpen).length;
  const overdueClaims = claims.filter(isOverdue).length;

  function syncServiceFields(claim: WarrantyClaimSummary) {
    setPriority(claim.priority);
    setAssignedToId(claim.assignedToId);
    setDueDate(claim.dueDate);
    setServiceCostLkr(String(claim.serviceCostCents / 100));
  }

  function chooseClaim(claim: WarrantyClaimSummary) {
    setSelectedId(claim.id);
    setNextStatus(claim.status);
    syncServiceFields(claim);
    setPublicNote("");
    setInternalNote("");
    setUpdateError("");
    setServiceSuccess("");
  }

  function chooseFilter(nextFilter: ClaimQueueFilter) {
    setFilter(nextFilter);
    const first = claims.find((claim) => {
      if (nextFilter === "Open") return isOpen(claim);
      if (nextFilter === "Mine") return isOpen(claim) && claim.assignedToId === currentStaffId;
      if (nextFilter === "Overdue") return isOverdue(claim);
      if (nextFilter === "Urgent") return isOpen(claim) && claim.priority === "Urgent";
      return true;
    });
    if (first) chooseClaim(first);
  }

  async function sendClaimUpdate(body: Record<string, unknown>) {
    if (!selected) return null;
    setUpdating(true);
    setUpdateError("");
    setServiceSuccess("");
    const response = await fetch(`/api/claims/${encodeURIComponent(selected.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    setUpdating(false);
    if (!response.ok) {
      setUpdateError(result.error ?? "The claim could not be updated.");
      return null;
    }
    const updated = result.claim as WarrantyClaimSummary;
    onClaimUpdate(updated);
    setNextStatus(updated.status);
    syncServiceFields(updated);
    return updated;
  }

  async function updateCustomer() {
    const updated = await sendClaimUpdate({ status: nextStatus, note: publicNote });
    if (updated) {
      setPublicNote("");
      if (filter === "Open" && (updated.status === "Completed" || updated.status === "Rejected")) setFilter("All");
      setServiceSuccess("Customer timeline updated.");
    }
  }

  async function updateServicePlan() {
    const updated = await sendClaimUpdate({ priority, assignedToId, dueDate, internalNote, ...(canRecordCosts ? { serviceCostLkr } : {}) });
    if (updated) {
      setInternalNote("");
      setServiceSuccess("Internal service plan saved.");
    }
  }

  const serviceChanged = selected && (priority !== selected.priority || assignedToId !== selected.assignedToId || dueDate !== selected.dueDate || (canRecordCosts && Number(serviceCostLkr || 0) !== selected.serviceCostCents / 100) || Boolean(internalNote.trim()));

  return (
    <section className="page-section service-desk-page">
      <div className="section-head"><div><div className="eyebrow">{claims.length} customer requests</div><h2>Warranty service desk</h2></div></div>
      <section className="stats"><Stat label="Active coverage" value={String(activeCoverage)} indicator="Current" /><Stat label="New claims" value={String(claims.filter((claim) => claim.status === "New").length)} indicator="Inbox" /><Stat label="Open service jobs" value={String(openClaims)} indicator={openClaims ? "Action needed" : "Clear"} /><Stat label="Overdue SLA" value={String(overdueClaims)} indicator={overdueClaims ? "Escalate" : "On track"} /></section>

      {claims.length ? (
        <div className="claims-workspace">
          <section className="panel claims-inbox">
            <div className="panel-head claim-inbox-head"><div><h3 className="panel-title">Service queue</h3><p className="panel-subtitle">Assignment, priority and SLA in one view</p></div></div>
            <div className="claim-filters" aria-label="Claim queue filters">{(["Open", "Mine", "Overdue", "Urgent", "All"] as ClaimQueueFilter[]).map((item) => <button type="button" key={item} className={filter === item ? "active" : ""} onClick={() => chooseFilter(item)}>{item}</button>)}</div>
            <div className="claim-list">
              {visibleClaims.map((claim) => (
                <button type="button" key={claim.id} className={`claim-list-item ${selected?.id === claim.id ? "selected" : ""}`} onClick={() => chooseClaim(claim)}>
                  <span className="claim-list-badges"><span className={`claim-status status-${claim.status.toLowerCase()}`}>{claim.status}</span><span className={`priority-chip priority-${claim.priority.toLowerCase()}`}>{claim.priority}</span></span>
                  <strong>{claim.deviceName}</strong>
                  <span>{claim.category} • {claim.customerName}</span>
                  <small>{claim.assignedToName} • <b className={isOverdue(claim) ? "overdue-text" : ""}>{isOverdue(claim) ? "Overdue" : `Due ${formatShortDate(claim.dueDate)}`}</b></small>
                </button>
              ))}
              {!visibleClaims.length && <div className="claim-filter-empty"><strong>Queue is clear</strong><span>No claims match the {filter.toLowerCase()} filter.</span></div>}
            </div>
          </section>

          {selected && (
            <section className="panel claim-detail">
              <div className="claim-detail-head">
                <div><div className="eyebrow">{selected.id}</div><h3>{selected.category} service job</h3><p>{selected.deviceName} • {selected.deviceId}</p></div>
                <div className="claim-head-actions"><span className={`coverage-chip ${selected.warrantyValid ? "active" : "expired"}`}>{selected.warrantyValid ? "Coverage confirmed" : "Coverage review"}</span><a className="button secondary small" href={`/job-sheet/${encodeURIComponent(selected.id)}`} target="_blank" rel="noreferrer">Print job sheet</a></div>
              </div>
              <div className="claim-detail-grid service-detail-grid">
                <div><span>Customer</span><strong>{selected.customerName}</strong></div>
                <div><span>Contact</span><strong>{selected.customerEmail || selected.customerPhone}</strong>{selected.customerEmail && selected.customerPhone && <small>{selected.customerPhone}</small>}</div>
                <div><span>Assigned to</span><strong>{selected.assignedToName}</strong></div>
                <div><span>Service due</span><strong className={isOverdue(selected) ? "overdue-text" : ""}>{formatShortDate(selected.dueDate)}{isOverdue(selected) ? " · Overdue" : ""}</strong></div>
                <div><span>Submitted</span><strong>{formatClaimDate(selected.createdAt)}</strong></div>
                <div><span>Evidence</span><strong>{selected.photoCount} photo{selected.photoCount === 1 ? "" : "s"}</strong></div>
              </div>
              <div className="claim-description-box"><span>Customer description</span><p>{selected.description}</p></div>
              <a className="text-link" href={`/claim/${selected.trackingToken}`} target="_blank" rel="noreferrer">Open private customer tracker ↗</a>

              <div className="service-plan-box">
                <div><h4>Internal service plan</h4><p>Assignment and technician notes stay private to shop staff.</p></div>
                <div className="service-plan-fields">
                  <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as ClaimPriority)}>{claimPriorities.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>Assigned staff<select value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)}><option value="">Unassigned</option>{assignees.map((member) => <option value={member.id} key={member.id}>{member.name} · {member.role}</option>)}</select></label>
                  <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
                  {canRecordCosts && <label>Warranty cost (LKR)<input type="number" min="0" max="100000000" step="0.01" inputMode="decimal" value={serviceCostLkr} onChange={(event) => setServiceCostLkr(event.target.value)} /></label>}
                  <label className="service-note-field">Internal repair note<textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={1200} placeholder="Diagnosis, parts required, test results or handover notes" /></label>
                </div>
                <button className="button primary" type="button" disabled={updating || !serviceChanged} onClick={updateServicePlan}>{updating ? "Saving…" : "Save service plan"}</button>
              </div>

              {selected.internalNotes.length > 0 && <div className="internal-note-history"><div><h4>Repair history</h4><span>{selected.internalNotes.length} private note{selected.internalNotes.length === 1 ? "" : "s"}</span></div>{selected.internalNotes.map((note) => <article key={note.id}><p>{note.note}</p><small>{note.actor} • {formatClaimDate(note.createdAt)}</small></article>)}</div>}

              <div className="claim-update-box">
                <div><h4>Update customer</h4><p>This status and note will appear on the private tracking page.</p></div>
                <div className="claim-update-fields">
                  <label>Status<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as ClaimStatus)}>{claimStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                  <label>Customer update<textarea value={publicNote} onChange={(event) => setPublicNote(event.target.value)} maxLength={600} placeholder="Optional - a clear default update is used when the status changes" /></label>
                </div>
                <button className="button primary" type="button" disabled={updating || (nextStatus === selected.status && !publicNote.trim())} onClick={updateCustomer}>{updating ? "Saving…" : "Publish customer update"}</button>
              </div>
              {updateError && <div className="error-box claim-update-message" role="alert">{updateError}</div>}
              {serviceSuccess && <div className="success-box claim-update-message" role="status">{serviceSuccess}</div>}
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

function formatShortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function StaffPanel({ staff, audit, currentStaffId, onStaffChange, onAuditChange }: { staff: StaffAccount[]; audit: AuditEvent[]; currentStaffId: string; onStaffChange: (staff: StaffAccount[]) => void; onAuditChange: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("Technician");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function createStaff() {
    setSaving(true);
    setError("");
    const response = await fetch("/api/staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, role, password }),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setError(result.error ?? "The staff account could not be created.");
      setSaving(false);
      return;
    }
    onStaffChange([...staff, result.staff as StaffAccount]);
    setName("");
    setEmail("");
    setRole("Technician");
    setPassword("");
    setSaving(false);
    await onAuditChange();
  }

  return (
    <section className="page-section staff-page">
      <div className="section-head"><div><div className="eyebrow">{staff.filter((member) => member.active).length} active accounts</div><h2>Staff access control</h2></div></div>
      <div className="staff-layout">
        <div className="staff-main">
          <section className="panel staff-create-card">
            <div className="panel-head"><div><h3 className="panel-title">Invite a staff member</h3><p className="panel-subtitle">Create a secure shop-owned login</p></div></div>
            <div className="staff-create-form">
              <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Technician name" /></label>
              <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@yourshop.lk" /></label>
              <label>Role<select value={role} onChange={(event) => setRole(event.target.value as StaffRole)}>{staffRoles.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Temporary password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 8 characters" /></label>
            </div>
            <div className="role-guide"><span><b>Owner</b> All settings</span><span><b>Technician</b> Tests + claims</span><span><b>Support</b> Claims only</span></div>
            {error && <div className="error-box" role="alert">{error}</div>}
            <button className="button primary" type="button" disabled={saving} onClick={createStaff}>{saving ? "Creating account…" : "+ Create staff account"}</button>
          </section>

          <section className="panel staff-list-card">
            <div className="panel-head"><div><h3 className="panel-title">Team accounts</h3><p className="panel-subtitle">Roles are enforced by the API, not only the interface</p></div></div>
            <div className="staff-list">{staff.map((member) => <StaffEditor key={member.id} member={member} isCurrent={member.id === currentStaffId} onUpdated={(updated) => { onStaffChange(staff.map((item) => item.id === updated.id ? updated : item)); void onAuditChange(); }} />)}</div>
          </section>
        </div>

        <section className="panel audit-panel">
          <div className="panel-head"><div><h3 className="panel-title">Audit history</h3><p className="panel-subtitle">Sensitive shop actions</p></div></div>
          <div className="audit-list">{audit.length ? audit.map((event) => <article key={event.id}><span>{auditIcon(event.action)}</span><div><strong>{event.summary}</strong><small>{event.actor} • {formatClaimDate(event.createdAt)}</small></div></article>) : <div className="empty-state">No audit activity yet.</div>}</div>
        </section>
      </div>
    </section>
  );
}

function StaffEditor({ member, isCurrent, onUpdated }: { member: StaffAccount; isCurrent: boolean; onUpdated: (staff: StaffAccount) => void }) {
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState(member.role);
  const [active, setActive] = useState(member.active);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    const response = await fetch(`/api/staff/${encodeURIComponent(member.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, role, active, password }),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setError(result.error ?? "The staff account could not be updated.");
      setSaving(false);
      return;
    }
    setPassword("");
    setSaving(false);
    onUpdated(result.staff as StaffAccount);
  }

  return (
    <article className={`staff-editor ${member.active ? "" : "inactive"}`}>
      <div className="staff-identity"><span className="avatar">{initials(member.name)}</span><div><strong>{member.name}{isCurrent && <em>You</em>}</strong><small>{member.email}</small></div><span className={`staff-state ${member.active ? "active" : ""}`}>{member.active ? "Active" : "Disabled"}</span></div>
      <div className="staff-editor-fields">
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Role<select value={role} onChange={(event) => setRole(event.target.value as StaffRole)}>{staffRoles.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Reset password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Leave empty to keep" /></label>
        <label className="staff-active-toggle"><input type="checkbox" checked={active} disabled={isCurrent} onChange={(event) => setActive(event.target.checked)} /><span>Account enabled</span></label>
      </div>
      {error && <div className="error-box" role="alert">{error}</div>}
      <button className="button secondary small" type="button" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save account"}</button>
    </article>
  );
}

function SettingsPanel({ settings, session, initialSystem, onSettingsChange, onAuditChange }: { settings: ShopSettings; session: StaffSession; initialSystem: SystemReadiness | null; onSettingsChange: (settings: ShopSettings) => void; onAuditChange: () => Promise<void> }) {
  const [form, setForm] = useState(settings);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  function change<K extends keyof ShopSettings>(key: K, value: ShopSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function readLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 500 * 1024) {
      setSettingsError("Shop logo must be 500 KB or smaller.");
      return;
    }
    try {
      const logo = await readImageData(file);
      change("logoDataUrl", logo);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "The logo could not be read.");
    }
  }

  async function saveSettings() {
    setSaving(true);
    setSettingsError("");
    setSettingsSuccess("");
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setSettingsError(result.error ?? "Shop settings could not be saved.");
      setSaving(false);
      return;
    }
    setForm(result.settings as ShopSettings);
    onSettingsChange(result.settings as ShopSettings);
    setSettingsSuccess("Shop branding and warranty defaults saved.");
    setSaving(false);
    await onAuditChange();
  }

  async function changePassword() {
    setPasswordError("");
    setPasswordSuccess("");
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    const response = await fetch("/api/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setPasswordError(result.error ?? "Password could not be changed.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSuccess("Password changed successfully.");
    await onAuditChange();
  }

  return (
    <section className="page-section settings-page">
      <div className="section-head"><div><div className="eyebrow">Standalone configuration</div><h2>Brand and account settings</h2></div></div>
      <div className="settings-layout">
        <div className="settings-main">
          <section className="panel settings-card">
            <div className="panel-head"><div><h3 className="panel-title">Shop identity</h3><p className="panel-subtitle">Used on passports, claims, labels, and staff screens</p></div></div>
            <div className="shop-logo-control"><div className="shop-logo-preview">{form.logoDataUrl ? <Image src={form.logoDataUrl} alt={`${form.shopName} logo`} width={80} height={80} unoptimized /> : <span>{form.shopName.slice(0, 1).toUpperCase()}</span>}</div><div><strong>Shop logo</strong><p>Square JPEG, PNG, or WebP up to 500 KB.</p>{session.role === "Owner" && <div className="row-actions"><label className="button secondary small">Upload logo<input className="file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={readLogo} /></label>{form.logoDataUrl && <button className="text-link danger-text" type="button" onClick={() => change("logoDataUrl", "")}>Remove</button>}</div>}</div></div>
            {session.role === "Owner" ? <><div className="settings-fields"><label>Shop name<input value={form.shopName} onChange={(event) => change("shopName", event.target.value)} /></label><label>Tagline<input value={form.tagline} onChange={(event) => change("tagline", event.target.value)} /></label><label>Contact email<input type="email" value={form.contactEmail} onChange={(event) => change("contactEmail", event.target.value)} /></label><label>Phone number<input value={form.phone} onChange={(event) => change("phone", event.target.value)} /></label><label className="full-field">Address<textarea value={form.address} onChange={(event) => change("address", event.target.value)} /></label></div>{settingsError && <div className="error-box" role="alert">{settingsError}</div>}</> : <div className="settings-readonly"><strong>{settings.shopName}</strong><span>{settings.tagline}</span><span>{settings.contactEmail} • {settings.phone}</span><span>{settings.address}</span></div>}
          </section>

          {session.role === "Owner" && <section className="panel settings-card"><div className="panel-head"><div><h3 className="panel-title">Warranty defaults</h3><p className="panel-subtitle">Applied automatically to every new device passport</p></div></div><div className="settings-fields"><label>Coverage duration<select value={form.warrantyMonths} onChange={(event) => change("warrantyMonths", Number(event.target.value))}>{[1,3,6,12,18,24,36].map((months) => <option value={months} key={months}>{months} month{months === 1 ? "" : "s"}</option>)}</select></label><label className="full-field">Public warranty terms<textarea value={form.warrantyTerms} maxLength={1200} onChange={(event) => change("warrantyTerms", event.target.value)} /></label></div>{settingsSuccess && <div className="success-box">{settingsSuccess}</div>}<button className="button primary" type="button" disabled={saving} onClick={saveSettings}>{saving ? "Saving settings…" : "Save shop settings"}</button></section>}
          {session.role === "Owner" && initialSystem && <RecoveryPanel initialSystem={initialSystem} onAuditChange={onAuditChange} />}
        </div>

        <aside className="settings-side">
          <section className="panel account-card"><div className="account-card-head"><span className="avatar large">{initials(session.name)}</span><div><strong>{session.name}</strong><span>{session.email}</span><em>{session.role}</em></div></div><h3>Change my password</h3><div className="account-password-fields"><label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Minimum 8 characters" /></label><label>Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label></div>{passwordError && <div className="error-box" role="alert">{passwordError}</div>}{passwordSuccess && <div className="success-box">{passwordSuccess}</div>}<button className="button secondary" type="button" onClick={changePassword}>Change password</button></section>
        </aside>
      </div>
    </section>
  );
}

function auditIcon(action: string) {
  if (action.startsWith("staff")) return "U";
  if (action.startsWith("settings")) return "S";
  if (action.startsWith("claim")) return "C";
  if (action.startsWith("passport")) return "D";
  return "A";
}

function readImageData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "DP";
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
  return <div className="table-wrap"><table className="device-table"><thead><tr><th>Device</th><th>Health</th><th>Grade</th><th>Lifecycle</th><th>Passport</th></tr></thead><tbody>{devices.map((device) => <tr key={device.id}><td><div className="device-cell"><span className="device-thumb">PC</span><span><span className="device-name">{device.name}</span><span className="device-id">{device.id} | {device.serial}</span></span></div></td><td><span className="score">{device.score}</span>/100</td><td><span className="grade-badge" style={{ width: 31, height: 31, borderRadius: 10, fontSize: 12 }}>{device.grade}</span></td><td><span className={`status-pill lifecycle-${device.lifecycleStatus.toLowerCase()}`}>{device.lifecycleStatus}</span></td><td><a className="button secondary small" href={`/passport/${device.id}`}>Open</a></td></tr>)}</tbody></table></div>;
}

function Activity({ icon, title, body, time }: { icon: string; title: string; body: string; time: string }) {
  return <div className="activity"><span className="activity-icon">{icon}</span><p><strong>{title}</strong>{body}</p><time>{time}</time></div>;
}
