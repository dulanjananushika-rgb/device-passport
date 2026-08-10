import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findDeviceByHandoverToken, getShopSettings, isWarrantyActive } from "../../../lib/database";
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
