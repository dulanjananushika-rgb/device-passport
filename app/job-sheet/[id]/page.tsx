import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "../../../lib/auth";
import { findWarrantyClaimById, getShopSettings } from "../../../lib/database";
import { PrintJobSheet } from "./PrintJobSheet";

type JobSheetPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function JobSheetPage({ params }: JobSheetPageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const claim = findWarrantyClaimById(id);
  if (!claim) notFound();
  const settings = getShopSettings();

  return (
    <main className="job-sheet-page">
      <div className="job-sheet-toolbar"><Link className="button secondary" href="/">Back to service desk</Link><PrintJobSheet /></div>
      <article className="job-sheet-paper">
        <header className="job-sheet-header">
          <div><span className="eyebrow">{settings.shopName}</span><h1>Warranty service job sheet</h1><p>{settings.phone} · {settings.contactEmail}</p></div>
          <div className="job-sheet-id"><span>Job reference</span><strong>{claim.id}</strong><em className={`priority-chip priority-${claim.priority.toLowerCase()}`}>{claim.priority} priority</em></div>
        </header>

        <section className="job-sheet-summary">
          <div><span>Status</span><strong>{claim.status}</strong></div>
          <div><span>Assigned to</span><strong>{claim.assignedToName}</strong></div>
          <div><span>Due date</span><strong>{formatDate(claim.dueDate)}</strong></div>
          <div><span>Coverage</span><strong>{claim.warrantyValid ? "Confirmed" : "Review required"}</strong></div>
        </section>

        <section className="job-sheet-section">
          <h2>Device and customer</h2>
          <div className="job-sheet-grid"><Field label="Device" value={claim.deviceName} /><Field label="Passport" value={claim.deviceId} /><Field label="Serial number" value={claim.serial} /><Field label="Warranty ends" value={claim.warrantyEnds} /><Field label="Customer" value={claim.customerName} /><Field label="Contact" value={[claim.customerEmail, claim.customerPhone].filter(Boolean).join(" · ")} /></div>
        </section>

        <section className="job-sheet-section">
          <h2>Reported issue</h2>
          <div className="job-sheet-issue"><strong>{claim.category}</strong><p>{claim.description}</p><small>Submitted {formatDateTime(claim.createdAt)} · {claim.photoCount} evidence photo{claim.photoCount === 1 ? "" : "s"}</small></div>
        </section>

        {claim.internalNotes.length > 0 && <section className="job-sheet-section"><h2>Internal repair history</h2><div className="job-sheet-note-list">{claim.internalNotes.map((note) => <article key={note.id}><p>{note.note}</p><small>{note.actor} · {formatDateTime(note.createdAt)}</small></article>)}</div></section>}

        <section className="job-sheet-section technician-workspace">
          <h2>Technician worksheet</h2>
          <div className="job-sheet-checks"><span>□ Fault reproduced</span><span>□ Device condition checked</span><span>□ Data/privacy warning given</span><span>□ Final quality test passed</span></div>
          <WriteLines label="Diagnosis" count={3} />
          <WriteLines label="Parts / work completed" count={3} />
          <WriteLines label="Final test result" count={2} />
        </section>

        <footer className="job-sheet-signatures"><div><span>Technician signature</span></div><div><span>Customer handover signature</span></div><div><span>Date</span></div></footer>
        <p className="job-sheet-footer">Printed by {session.name} · {new Date().toLocaleString("en-GB")} · {settings.address}</p>
      </article>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value || "-"}</strong></div>;
}

function WriteLines({ label, count }: { label: string; count: number }) {
  return <div className="job-sheet-write-lines"><strong>{label}</strong>{Array.from({ length: count }, (_, index) => <span key={index} />)}</div>;
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { dateStyle: "medium" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
