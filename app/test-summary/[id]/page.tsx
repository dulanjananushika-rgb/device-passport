import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { findDevice, getPassportEvidence, getShopSettings } from "../../../lib/database";
import { inspectionKeys, inspectionLabels, type CheckStatus } from "../../../lib/inspection";
import { canCreatePassports } from "../../../lib/operations";
import { PrintTestSummary } from "./PrintTestSummary";

type TestSummaryPageProps = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function TestSummaryPage({ params }: TestSummaryPageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreatePassports(session.role)) redirect("/");
  const { id } = await params;
  const device = findDevice(id);
  if (!device) notFound();
  const evidence = getPassportEvidence(device.id);
  const settings = getShopSettings();
  const interactive = device.diagnostics?.interactiveTests ?? [];
  const failures = [
    ...(device.batteryHealth < 75 ? ["Battery health below 75%"] : []),
    ...(device.storageHealth < 75 ? ["Storage health requires review"] : []),
    ...(device.diagnostics?.cpuStressPassed === false ? ["CPU stability test requires review"] : []),
    ...interactive.filter((test) => test.status === "fail").map((test) => `${inspectionLabels[test.key].label}: ${test.detail}`),
    ...(evidence ? inspectionKeys.filter((key) => evidence.checks[key] === "fail").map((key) => `${inspectionLabels[key].label}: technician marked fail`) : []),
  ];

  return (
    <main className="job-sheet-page test-summary-page">
      <div className="job-sheet-toolbar"><Link className="button secondary" href={`/passport/${device.id}`}>Open passport</Link><PrintTestSummary /></div>
      <article className="job-sheet-paper test-summary-paper">
        <header className="job-sheet-header"><div><span className="eyebrow">{settings.shopName}</span><h1>Device test & failure summary</h1><p>{settings.phone} · {settings.contactEmail}</p></div><div className="job-sheet-id"><span>Passport</span><strong>{device.id}</strong><em className={`summary-result ${failures.length ? "review" : "pass"}`}>{failures.length ? "Review required" : "All checks passed"}</em></div></header>

        <section className="job-sheet-summary"><Summary label="Grade" value={`${device.grade} · ${device.score}/100`} /><Summary label="Battery" value={`${device.batteryHealth}% health`} /><Summary label="Storage" value={`${device.storageHealth}% health`} /><Summary label="Signature" value={device.diagnostics?.serverSignatureVerified ? "Agent verified" : "Technician approved"} /></section>

        <section className="job-sheet-section"><h2>Device identity</h2><div className="job-sheet-grid"><Field label="Device" value={device.name} /><Field label="Model" value={device.model} /><Field label="Serial number" value={device.serial} /><Field label="Processor" value={device.processor} /><Field label="Memory" value={device.memory} /><Field label="Storage" value={device.storage} /><Field label="Tested" value={device.testedAt} /><Field label="Technician" value={device.technician} /><Field label="Tester station" value={device.diagnostics?.verifiedAgentName || "Manual import"} /></div></section>

        <section className="job-sheet-section"><h2>Automatic diagnostic evidence</h2><div className="job-sheet-grid"><Field label="Battery cycles" value={formatMetric(device.diagnostics?.batteryCycleCount, " cycles")} /><Field label="SSD power-on time" value={formatMetric(device.diagnostics?.storagePowerOnHours, " hours")} /><Field label="SSD temperature" value={formatMetric(device.diagnostics?.storageTemperatureC, "°C")} /><Field label="Memory used" value={formatMetric(device.diagnostics?.memoryUsedPercent, "%")} /><Field label="CPU stress" value={device.diagnostics?.cpuStressPassed === null || device.diagnostics?.cpuStressPassed === undefined ? "Not exposed" : device.diagnostics.cpuStressPassed ? "Passed" : "Review required"} /><Field label="CPU peak" value={formatMetric(device.diagnostics?.cpuPeakTemperatureC, "°C")} /></div></section>

        <section className="job-sheet-section"><h2>Interactive hardware suite</h2>{interactive.length ? <div className="summary-test-list">{interactive.map((test) => <ResultRow key={test.key} label={inspectionLabels[test.key].label} status={test.status} detail={test.detail} />)}</div> : <div className="job-sheet-issue"><strong>Legacy/manual report</strong><p>No Tester V4 interactive evidence was stored for this passport.</p></div>}</section>

        {evidence && <section className="job-sheet-section"><h2>Approved physical inspection</h2><div className="summary-test-list">{inspectionKeys.map((key) => <ResultRow key={key} label={inspectionLabels[key].label} status={evidence.checks[key]} detail={inspectionLabels[key].hint} />)}</div>{evidence.notes && <div className="summary-notes"><strong>Technician notes</strong><p>{evidence.notes}</p></div>}</section>}

        <section className="job-sheet-section"><h2>Failure summary</h2>{failures.length ? <ol className="failure-summary-list">{failures.map((failure, index) => <li key={`${failure}-${index}`}>{failure}</li>)}</ol> : <div className="job-sheet-issue pass-issue"><strong>No failed checks recorded</strong><p>The automatic, interactive, and approved physical results did not flag a failure.</p></div>}</section>

        <footer className="job-sheet-signatures"><div><span>Technician signature</span></div><div><span>QC approval signature</span></div><div><span>Date</span></div></footer>
        <p className="job-sheet-footer">Printed by {session.name} · {new Date().toLocaleString("en-GB")} · {settings.address}</p>
      </article>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value || "-"}</strong></div>;
}

function ResultRow({ label, status, detail }: { label: string; status: CheckStatus | "not-run"; detail: string }) {
  return <article><span className={`summary-result ${status === "pass" ? "pass" : status === "fail" ? "review" : "neutral"}`}>{status === "not-run" ? "Not run" : status}</span><div><strong>{label}</strong><p>{detail}</p></div></article>;
}

function formatMetric(value: number | null | undefined, suffix: string) {
  return value === null || value === undefined ? "Not exposed" : `${Math.round(value).toLocaleString("en-US")}${suffix}`;
}
