import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findDevice, getPassportEvidence, isWarrantyActive } from "../../../lib/database";
import { inspectionKeys, inspectionLabels, type CheckStatus } from "../../../lib/inspection";
import { QrCode } from "../../ui/QrCode";

type PassportPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PassportPageProps): Promise<Metadata> {
  const { id } = await params;
  const device = findDevice(id);
  if (!device) return {};
  return {
    title: `${device.name} – Verified passport`,
    description: `Health score ${device.score}/100, Grade ${device.grade}. Tested ${device.testedAt}.`,
  };
}

export default async function PassportPage({ params }: PassportPageProps) {
  const { id } = await params;
  const device = findDevice(id);
  if (!device) notFound();
  const evidence = getPassportEvidence(device.id);
  const warrantyActive = isWarrantyActive(device.warrantyEnds);

  return (
    <main className="passport-page">
      <div className="passport-wrap">
        <nav className="passport-nav">
          <Link className="brand" href="/" style={{ color: "#123c2e", padding: 0 }}>
            <span className="brand-mark">D</span><span className="brand-name">DevicePassport</span>
          </Link>
          <span className="verified-chip">Report integrity verified</span>
        </nav>

        <article className="passport-card">
          <header className="passport-hero">
            <div>
              <div className="hero-kicker">Public device passport</div>
              <h1>{device.name}</h1>
              <p>{device.id} • Serial {device.serial} • Tested {device.testedAt}</p>
            </div>
            <div className="passport-score">
              <strong>{device.score}</strong>
              <span>Grade {device.grade} health</span>
            </div>
          </header>

          <div className="passport-body">
            <section className="passport-main">
              <h2 className="section-title">Verified hardware checks</h2>
              <div className="test-grid">
                <TestCard
                  title="Battery"
                  detail={`${device.batteryHealth}% health • Diagnostic reading`}
                  status={device.batteryHealth >= 75 ? "pass" : "fail"}
                />
                <TestCard
                  title="Storage"
                  detail={`${device.storageHealth}% health • SMART diagnostic`}
                  status={device.storageHealth >= 75 ? "pass" : "fail"}
                />
                {evidence && inspectionKeys.map((key) => (
                  <TestCard
                    key={key}
                    title={inspectionLabels[key].label}
                    detail={evidence.checks[key] === "pass" ? "Technician inspection passed" : "Issue found during inspection"}
                    status={evidence.checks[key]}
                  />
                ))}
              </div>

              {evidence?.notes && (
                <section className="passport-notes">
                  <h2 className="section-title">Technician notes</h2>
                  <p>{evidence.notes}</p>
                </section>
              )}

              {evidence && evidence.photos.length > 0 && (
                <section className="passport-evidence">
                  <h2 className="section-title">Inspection evidence</h2>
                  <div className="passport-photo-grid">
                    {evidence.photos.map((photo) => (
                      <figure key={photo.id}>
                        <Image
                          src={`/api/public/passports/${encodeURIComponent(device.id)}/photos/${encodeURIComponent(photo.id)}`}
                          alt={photo.name}
                          width={480}
                          height={320}
                          unoptimized
                        />
                        <figcaption>{photo.name}</figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}

              <div className="spec-list">
                <h2 className="section-title">Device specification</h2>
                <Spec label="Manufacturer model" value={device.model} />
                <Spec label="Processor" value={device.processor} />
                <Spec label="Memory" value={device.memory} />
                <Spec label="Storage" value={device.storage} />
                <Spec label="Technician" value={device.technician} />
                {evidence && <Spec label="Inspection approved" value={formatApprovalDate(evidence.approvedAt)} />}
              </div>
            </section>

            <aside className="passport-side">
              <QrCode path={`/passport/${device.id}`} label={`QR code for ${device.name}`} />
              <p className="qr-description">Scan to reopen this verified report at any time.</p>
              <Link className="button secondary passport-label-link" href={`/label/${device.id}`}>
                Print 40 × 25 mm QR label
              </Link>
              <div className="warranty-card">
                <span>Digital warranty</span>
                <strong>{warrantyActive ? `Active until ${device.warrantyEnds}` : `Ended ${device.warrantyEnds}`}</strong>
                <div className="meter"><span style={{ width: warrantyActive ? "72%" : "0%" }} /></div>
                <small>{warrantyActive ? "Hardware coverage from the verified seller" : "Service requests remain available for shop review"}</small>
              </div>
              <div className="seller-card">
                <strong>Sold and verified by Lapmart</strong>
                <span>Verified DevicePassport partner • Colombo, Sri Lanka</span>
              </div>
              <Link className="button primary" href={`/passport/${device.id}/claim`} style={{ width: "100%", marginTop: 13 }}>Start warranty claim</Link>
            </aside>
          </div>
        </article>
      </div>
    </main>
  );
}

function TestCard({ title, detail, status }: { title: string; detail: string; status: CheckStatus }) {
  return (
    <div className={`test-card ${status === "fail" ? "test-card-failed" : ""}`}>
      <div className="test-card-head">
        <strong>{title}</strong>
        <span className={`pass-dot ${status === "fail" ? "fail" : ""}`}>{status === "pass" ? "✓" : "!"}</span>
      </div>
      <p>{detail}</p>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return <div className="spec-row"><span>{label}</span><strong>{value}</strong></div>;
}

function formatApprovalDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
