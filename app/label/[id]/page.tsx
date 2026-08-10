import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findDevice, getShopSettings } from "../../../lib/database";
import { QrCode } from "../../ui/QrCode";
import { PrintButton } from "./PrintButton";

type LabelPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: LabelPageProps): Promise<Metadata> {
  const { id } = await params;
  const device = findDevice(id);
  return device ? { title: `Print label – ${device.id}` } : {};
}

export default async function LabelPage({ params }: LabelPageProps) {
  const { id } = await params;
  const device = findDevice(id);
  if (!device) notFound();
  const settings = getShopSettings();

  return (
    <main className="label-page">
      <section className="label-controls">
        <div>
          <span className="eyebrow">{settings.shopName} label</span>
          <h1>Ready for a 40 × 25 mm label</h1>
          <p>Set the printer scale to 100% and disable margins or headers in the print dialog.</p>
        </div>
        <div className="label-actions">
          <Link className="button secondary" href={`/passport/${device.id}`}>Back to passport</Link>
          <PrintButton />
        </div>
      </section>

      <article className="device-label" aria-label={`Printable label for ${device.name}`}>
        <div className="label-copy">
          <div className="label-brand">{settings.logoDataUrl ? <Image src={settings.logoDataUrl} alt="" width={20} height={20} unoptimized /> : <span>{settings.shopName.slice(0, 1).toUpperCase()}</span>} {settings.shopName}</div>
          <strong className="label-model">{device.name}</strong>
          <div className="label-score"><b>{device.score}</b><span>/100<br />GRADE {device.grade}</span></div>
          <small>{device.id}</small>
        </div>
        <div className="label-qr">
          <QrCode path={`/passport/${device.id}`} label={`QR code for ${device.name}`} />
          <span>SCAN FOR PROOF</span>
        </div>
      </article>
    </main>
  );
}
