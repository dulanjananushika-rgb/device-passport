import type { Metadata } from "next";
import { getDevice } from "../../data/devices";
import { QrCode } from "../../ui/QrCode";

type PassportPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PassportPageProps): Promise<Metadata> {
  const { id } = await params;
  const device = getDevice(id);
  return {
    title: `${device.name} – Verified passport`,
    description: `Health score ${device.score}/100, Grade ${device.grade}. Tested ${device.testedAt}.`,
  };
}

export default async function PassportPage({ params }: PassportPageProps) {
  const { id } = await params;
  const device = getDevice(id);

  return (
    <main className="passport-page">
      <div className="passport-wrap">
        <nav className="passport-nav">
          <a className="brand" href="/" style={{ color: "#123c2e", padding: 0 }}>
            <span className="brand-mark">D</span><span className="brand-name">DevicePassport</span>
          </a>
          <span className="verified-chip">Report integrity verified</span>
        </nav>

        <article className="passport-card">
          <header className="passport-hero">
            <div>
              <div className="hero-kicker">Public device passport</div>
              <h1>{device.name}</h1>
              <p>{device.id} • Serial {device.serial} • Tested {device.testedAt}</p>
            </div>
            <div className="passport-score"><strong>{device.score}</strong><span>Health score</span></div>
          </header>

          <div className="passport-body">
            <section className="passport-main">
              <h2 className="section-title">Verified hardware checks</h2>
              <div className="test-grid">
                <TestCard title="Battery" detail={`${device.batteryHealth}% health • Charging normally`} />
                <TestCard title="Storage" detail={`${device.storageHealth}% health • SMART passed`} />
                <TestCard title="Memory" detail={`${device.memory} • Test passed`} />
                <TestCard title="Display & keyboard" detail="Manual inspection completed" />
                <TestCard title="Camera & audio" detail="Input and output test passed" />
                <TestCard title="Ports & wireless" detail="USB, HDMI, Wi-Fi and Bluetooth passed" />
              </div>

              <div className="spec-list">
                <h2 className="section-title">Device specification</h2>
                <Spec label="Manufacturer model" value={device.model} />
                <Spec label="Processor" value={device.processor} />
                <Spec label="Memory" value={device.memory} />
                <Spec label="Storage" value={device.storage} />
                <Spec label="Technician" value={device.technician} />
              </div>
            </section>

            <aside className="passport-side">
              <QrCode path={`/passport/${device.id}`} label={`QR code for ${device.name}`} />
              <p style={{ margin: 0, color: "#64736b", fontSize: 10, lineHeight: 1.5, textAlign: "center" }}>
                Scan to reopen this verified report at any time.
              </p>
              <div className="warranty-card">
                <span>Digital warranty</span>
                <strong>Active until {device.warrantyEnds}</strong>
                <div className="meter"><span style={{ width: "72%" }} /></div>
                <small>184 days remaining • Hardware coverage</small>
              </div>
              <div className="seller-card">
                <strong>Sold and verified by Lapmart</strong>
                <span>Verified DevicePassport partner • Colombo, Sri Lanka</span>
              </div>
              <a className="button primary" href="mailto:support@example.com" style={{ width: "100%", marginTop: 13 }}>Start warranty claim</a>
            </aside>
          </div>
        </article>
      </div>
    </main>
  );
}

function TestCard({ title, detail }: { title: string; detail: string }) {
  return <div className="test-card"><div className="test-card-head"><strong>{title}</strong><span className="pass-dot">✓</span></div><p>{detail}</p></div>;
}

function Spec({ label, value }: { label: string; value: string }) {
  return <div className="spec-row"><span>{label}</span><strong>{value}</strong></div>;
}
