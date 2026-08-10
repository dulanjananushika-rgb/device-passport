import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findDeviceByHandoverToken, getShopSettings, isWarrantyActive, listWarrantyServiceHistory } from "../../../lib/database";
import { QrCode } from "../../ui/QrCode";
import { ShopBrand } from "../../ui/ShopBrand";
import { WarrantyActions } from "./WarrantyActions";

type WarrantyPageProps = {
  params: Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: WarrantyPageProps): Promise<Metadata> {
  const { token } = await params;
  const device = findDeviceByHandoverToken(token);
  return device ? { title: `Digital warranty – ${device.name}`, robots: { index: false, follow: false } } : {};
}

export default async function WarrantyPage({ params }: WarrantyPageProps) {
  const { token } = await params;
  const device = findDeviceByHandoverToken(token);
  if (!device?.sale) notFound();
  const settings = getShopSettings();
  const active = isWarrantyActive(device.sale.warrantyEnds);
  const serviceHistory = listWarrantyServiceHistory(device.id);

  return (
    <main className="warranty-page">
      <div className="warranty-wrap">
        <nav className="passport-nav warranty-nav"><ShopBrand settings={settings} /><span className="secure-card-chip">Private customer card</span></nav>
        <article className="digital-warranty-card">
          <header className="digital-warranty-hero">
            <div><div className="hero-kicker">Digital warranty</div><h1>Hi {firstName(device.sale.customerName)}, your device is covered.</h1><p>Keep this private link or QR card for warranty support.</p></div>
            <span className={`warranty-state ${active ? "active" : "expired"}`}><b>{active ? "✓" : "!"}</b>{active ? "Coverage active" : "Coverage ended"}</span>
          </header>

          <div className="digital-warranty-body">
            <section className="warranty-details">
              <div className="warranty-device-block"><span>Verified device</span><h2>{device.name}</h2><p>{device.id} · Serial {device.serial}</p><div className="warranty-health"><strong>{device.score}<small>/100</small></strong><span>Grade {device.grade}<br />verified health</span></div></div>
              <div className="warranty-period"><div><span>Purchased</span><strong>{formatSaleDate(device.sale.soldAt)}</strong></div><div><span>Coverage starts</span><strong>{formatSaleDate(device.sale.warrantyStarts)}</strong></div><div><span>Coverage ends</span><strong>{formatSaleDate(device.sale.warrantyEnds)}</strong></div><div><span>Invoice</span><strong>{device.sale.invoiceReference}</strong></div></div>
              <div className="warranty-owner"><div><span>Registered customer</span><strong>{device.sale.customerName}</strong><small>{device.sale.customerPhone || device.sale.customerEmail}</small></div><div><span>Seller</span><strong>{settings.shopName}</strong><small>{settings.phone} · {settings.address}</small></div></div>
              <section className="warranty-service-history">
                <div className="warranty-service-head"><div><span>Private device record</span><h3>Service history</h3></div><strong>{serviceHistory.length} record{serviceHistory.length === 1 ? "" : "s"}</strong></div>
                {serviceHistory.length ? <div className="warranty-service-list">{serviceHistory.map((record) => <article key={record.id}>
                  <div className="warranty-service-title"><div><span>{record.category}</span><strong>{record.id}</strong></div><em className={`claim-status status-${record.status.toLowerCase()}`}>{record.status}</em></div>
                  <p>{record.description}</p>
                  <div className="warranty-service-events">{record.events.slice(0, 3).map((event) => <div key={event.id}><span className="timeline-dot" /><p><strong>{event.status}</strong>{event.note}<small>{formatDateTime(event.createdAt)} · {event.actor}</small></p></div>)}</div>
                  <Link className="text-link" href={`/claim/${record.trackingToken}`}>Open claim timeline</Link>
                </article>)}</div> : <div className="warranty-service-empty"><strong>No service claims recorded</strong><span>This verified history will update automatically when a warranty claim is opened.</span></div>}
              </section>
              <section className="warranty-terms"><strong>Coverage summary</strong><p>{settings.warrantyTerms}</p></section>
              <div className="customer-card-links"><Link className="button primary" href={`/passport/${device.id}/claim?handover=${device.sale.handoverToken}`}>Start a warranty claim</Link><Link className="button secondary" href={`/passport/${device.id}`}>View verified passport</Link></div>
            </section>

            <aside className="warranty-qr-panel"><QrCode path={`/warranty/${device.sale.handoverToken}`} label={`Private warranty QR for ${device.name}`} /><h3>Save your warranty QR</h3><p>Scan it later to reopen this card. Anyone with this QR can access the registered warranty, so keep it private.</p><WarrantyActions path={`/warranty/${device.sale.handoverToken}`} customerEmail={device.sale.customerEmail} deviceName={device.name} /></aside>
          </div>
        </article>
      </div>
    </main>
  );
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || "there";
}

function formatSaleDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { dateStyle: "long", timeZone: "UTC" });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
