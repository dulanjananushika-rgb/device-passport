import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findDevice, getShopSettings, isWarrantyActive } from "../../../../lib/database";
import { ShopBrand } from "../../../ui/ShopBrand";
import { ClaimForm } from "./ClaimForm";

type ClaimPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ handover?: string }>;
};

export async function generateMetadata({ params }: ClaimPageProps): Promise<Metadata> {
  const { id } = await params;
  const device = findDevice(id);
  return device ? { title: `Warranty claim – ${device.name}` } : {};
}

export default async function ClaimPage({ params, searchParams }: ClaimPageProps) {
  const { id } = await params;
  const { handover } = await searchParams;
  const device = findDevice(id);
  if (!device) notFound();
  const covered = isWarrantyActive(device.sale?.warrantyEnds ?? "");
  const settings = getShopSettings();

  return (
    <main className="claim-page">
      <div className="claim-wrap">
        <nav className="passport-nav">
          <ShopBrand settings={settings} href={`/passport/${device.id}`} />
          <span className={`coverage-chip ${covered ? "active" : "expired"}`}>{!device.sale ? "Awaiting sale activation" : covered ? "Coverage active" : "Coverage needs review"}</span>
        </nav>

        <div className="claim-layout">
          <aside className="claim-device-card">
            <div className="eyebrow">Warranty support</div>
            <h1>Tell us what went wrong.</h1>
            <p>Submit the issue directly to {settings.shopName}, the shop that verified this device. No customer account is required.</p>
            <div className="claim-device-summary">
              <span>Verified device</span><strong>{device.name}</strong><small>{device.id} • Serial {device.serial}</small>
            </div>
            <div className="coverage-summary"><span>Warranty coverage</span><strong>{!device.sale ? "Not activated" : covered ? `Active until ${formatSaleDate(device.sale.warrantyEnds)}` : `Ended ${formatSaleDate(device.sale.warrantyEnds)}`}</strong><small>{!device.sale ? "Ask the shop to complete the customer handover first." : covered ? "Coverage will be confirmed with this claim." : `${settings.shopName} will review available service options.`}</small></div>
            <Link className="text-link" href={`/passport/${device.id}`}>← Back to device passport</Link>
          </aside>
          {device.sale ? <section className="claim-form-card">
            <div className="eyebrow">New claim</div>
            <h2>Warranty claim details</h2>
            <p>Provide one contact method and a clear description. Photos help the technician diagnose the issue faster.</p>
            <ClaimForm deviceId={device.id} initialCustomer={handover === device.sale.handoverToken ? { name: device.sale.customerName, email: device.sale.customerEmail, phone: device.sale.customerPhone } : undefined} />
          </section> : <section className="claim-form-card claim-not-active"><div className="eyebrow">Activation required</div><h2>This warranty has not started yet.</h2><p>The shop must record the sale before a customer claim can be submitted. Contact {settings.shopName} with the device passport ID and invoice.</p><Link className="button primary" href={`/passport/${device.id}`}>Return to device passport</Link></section>}
        </div>
      </div>
    </main>
  );
}

function formatSaleDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" });
}
