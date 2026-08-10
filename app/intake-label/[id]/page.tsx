import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { getShopSettings } from "../../../lib/database";
import { findStockIntakeById } from "../../../lib/procurement";
import { PrintButton } from "../../label/[id]/PrintButton";
import { QrCode } from "../../ui/QrCode";

export const metadata: Metadata = { title: "Print stock intake label" };

type IntakeLabelPageProps = { params: Promise<{ id: string }> };

export default async function IntakeLabelPage({ params }: IntakeLabelPageProps) {
  if (!(await getSession())) redirect("/login");
  const { id } = await params;
  const intake = findStockIntakeById(id);
  if (!intake) notFound();
  const settings = getShopSettings();

  return (
    <main className="intake-label-page">
      <section className="label-controls">
        <div><span className="eyebrow">Internal inventory label</span><h1>Ready for a 60 × 30 mm intake label</h1><p>Attach this before diagnostics so the supplier record and serial stay together.</p></div>
        <div className="label-actions"><Link className="button secondary" href="/">Back to dashboard</Link><PrintButton /></div>
      </section>
      <article className="stock-intake-label" aria-label={`Printable stock intake label for ${intake.deviceName}`}>
        <div className="stock-label-copy"><div className="stock-label-brand">{settings.shopName} · INTAKE</div><strong>{intake.deviceName}</strong><span>{intake.model}</span><b>{intake.serial}</b><small>{intake.id} · {intake.supplierName}</small></div>
        <div className="stock-label-qr"><QrCode path="/" label={`Internal intake QR for ${intake.serial}`} /><span>SCAN & SEARCH SERIAL</span></div>
      </article>
    </main>
  );
}
