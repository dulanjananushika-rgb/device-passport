import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findPublicClaim, getShopSettings } from "../../../lib/database";
import { ShopBrand } from "../../ui/ShopBrand";

type TrackingPageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: TrackingPageProps): Promise<Metadata> {
  const { token } = await params;
  const claim = findPublicClaim(token);
  return claim ? { title: `${claim.id} – Warranty claim` } : {};
}

export default async function TrackingPage({ params }: TrackingPageProps) {
  const { token } = await params;
  const claim = findPublicClaim(token);
  if (!claim) notFound();
  const settings = getShopSettings();

  return (
    <main className="tracking-page">
      <div className="tracking-wrap">
        <nav className="passport-nav">
          <ShopBrand settings={settings} href={`/passport/${claim.deviceId}`} />
          <span className={`claim-status status-${claim.status.toLowerCase()}`}>{claim.status}</span>
        </nav>

        <header className="tracking-hero">
          <div><div className="eyebrow">Private claim tracker</div><h1>{claim.id}</h1><p>{claim.category} issue for {claim.deviceName}</p></div>
          <div className="tracking-status"><span>Current status</span><strong>{claim.status}</strong><small>Updated {formatDate(claim.updatedAt)}</small></div>
        </header>

        <div className="tracking-layout">
          <section className="tracking-main">
            <div className="tracking-card">
              <h2>Progress timeline</h2>
              <div className="claim-timeline">
                {claim.events.map((event) => <article key={event.id}><span className="timeline-dot" /><div><div><strong>{event.status}</strong><time>{formatDate(event.createdAt)}</time></div><p>{event.note}</p><small>{event.actor}</small></div></article>)}
              </div>
            </div>

            {claim.photos.length > 0 && <div className="tracking-card"><h2>Submitted evidence</h2><div className="tracking-photo-grid">{claim.photos.map((photo) => <figure key={photo.id}><Image src={`/api/public/claims/${encodeURIComponent(token)}/photos/${encodeURIComponent(photo.id)}`} alt={photo.name} width={500} height={320} unoptimized /><figcaption>{photo.name}</figcaption></figure>)}</div></div>}
          </section>

          <aside className="tracking-side">
            <div className="tracking-card"><h2>Claim summary</h2><dl><div><dt>Device</dt><dd>{claim.deviceName}</dd></div><div><dt>Passport</dt><dd>{claim.deviceId}</dd></div><div><dt>Submitted by</dt><dd>{claim.customerName}</dd></div><div><dt>Issue</dt><dd>{claim.category}</dd></div><div><dt>Coverage</dt><dd>{claim.warrantyValid ? `Confirmed to ${claim.warrantyEnds}` : "Requires shop review"}</dd></div></dl></div>
            <div className="tracking-card"><h2>Issue description</h2><p className="tracking-description">{claim.description}</p></div>
            <Link className="button secondary tracking-passport-link" href={`/passport/${claim.deviceId}`}>View device passport</Link>
          </aside>
        </div>
      </div>
    </main>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
