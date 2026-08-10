import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findDevice, isWarrantyActive } from "../../../../lib/database";
import { ClaimForm } from "./ClaimForm";

type ClaimPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ClaimPageProps): Promise<Metadata> {
  const { id } = await params;
  const device = findDevice(id);
  return device ? { title: `Warranty claim – ${device.name}` } : {};
}

export default async function ClaimPage({ params }: ClaimPageProps) {
  const { id } = await params;
  const device = findDevice(id);
  if (!device) notFound();
  const covered = isWarrantyActive(device.warrantyEnds);

  return (
    <main className="claim-page">
      <div className="claim-wrap">
        <nav className="passport-nav">
          <Link className="brand" href={`/passport/${device.id}`} style={{ color: "#123c2e", padding: 0 }}><span className="brand-mark">D</span><span className="brand-name">DevicePassport</span></Link>
          <span className={`coverage-chip ${covered ? "active" : "expired"}`}>{covered ? "Coverage active" : "Coverage needs review"}</span>
        </nav>

        <div className="claim-layout">
          <aside className="claim-device-card">
            <div className="eyebrow">Warranty support</div>
            <h1>Tell us what went wrong.</h1>
            <p>Submit the issue directly to the shop that verified this device. No customer account is required.</p>
            <div className="claim-device-summary">
              <span>Verified device</span><strong>{device.name}</strong><small>{device.id} • Serial {device.serial}</small>
            </div>
            <div className="coverage-summary"><span>Warranty coverage</span><strong>{covered ? `Active until ${device.warrantyEnds}` : `Ended ${device.warrantyEnds}`}</strong><small>{covered ? "Coverage will be confirmed with this claim." : "The shop will review available service options."}</small></div>
            <Link className="text-link" href={`/passport/${device.id}`}>← Back to device passport</Link>
          </aside>
          <section className="claim-form-card">
            <div className="eyebrow">New claim</div>
            <h2>Warranty claim details</h2>
            <p>Provide one contact method and a clear description. Photos help the technician diagnose the issue faster.</p>
            <ClaimForm deviceId={device.id} />
          </section>
        </div>
      </div>
    </main>
  );
}
