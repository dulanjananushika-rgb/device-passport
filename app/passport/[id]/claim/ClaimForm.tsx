"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useState } from "react";
import { claimCategories, type ClaimPhotoInput } from "../../../../lib/claims";

type ClaimFormProps = {
  deviceId: string;
};

export function ClaimForm({ deviceId }: ClaimFormProps) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [category, setCategory] = useState<(typeof claimCategories)[number]>("Battery");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<ClaimPhotoInput[]>([]);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setError("");
    event.target.value = "";
    if (photos.length + files.length > 4) {
      setError("You can attach up to four photos.");
      return;
    }
    const tooLarge = files.find((file) => file.size > 2 * 1024 * 1024);
    if (tooLarge) {
      setError(`${tooLarge.name} is larger than 2 MB.`);
      return;
    }
    try {
      const encoded = await Promise.all(files.map(readPhoto));
      setPhotos((current) => [...current, ...encoded]);
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "A photo could not be read.");
    }
  }

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerEmail.trim() && !customerPhone.trim()) {
      setError("Enter an email address or phone number so the shop can contact you.");
      return;
    }
    setSubmitting(true);
    setError("");
    const response = await fetch(`/api/public/passports/${encodeURIComponent(deviceId)}/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerName, customerEmail, customerPhone, category, description, photos, website }),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setError(result.error ?? "The claim could not be submitted.");
      setSubmitting(false);
      return;
    }
    router.push(`/claim/${result.claim.trackingToken}`);
  }

  return (
    <form className="claim-form" onSubmit={submitClaim}>
      <div className="claim-fields two-column">
        <label>Full name<input required minLength={2} maxLength={100} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Your name" /></label>
        <label>Issue category<select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>{claimCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className="claim-fields two-column">
        <label>Email address<input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="name@example.com" /></label>
        <label>Phone number<input type="tel" maxLength={30} value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="+94 77 123 4567" /></label>
      </div>
      <label className="claim-description">Describe the issue<textarea required minLength={15} maxLength={1500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What happened, when it started, and what you already tried" /></label>
      <label className="claim-honeypot" aria-hidden="true">Website<input aria-hidden="true" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>

      <section className="claim-photo-section">
        <div className="claim-section-head"><div><strong>Evidence photos</strong><span>Optional • JPEG, PNG or WebP • 2 MB each</span></div><span>{photos.length}/4</span></div>
        <div className="claim-photo-grid">
          {photos.map((photo, index) => (
            <div className="claim-photo" key={`${photo.name}-${index}`}>
              <Image src={photo.dataUrl} alt={photo.name} width={220} height={140} unoptimized />
              <button type="button" onClick={() => setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${photo.name}`}>×</button>
              <span>{photo.name}</span>
            </div>
          ))}
          {photos.length < 4 && <label className="claim-photo-add">+<span>Add photos</span><input className="file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} /></label>}
        </div>
      </section>

      {error && <div className="error-box" role="alert">{error}</div>}
      <button className="button primary claim-submit" type="submit" disabled={submitting}>{submitting ? "Submitting claim…" : "Submit warranty claim"}</button>
      <p className="claim-privacy">Your private tracking link will appear after submission. Keep it safe so you can follow every update.</p>
    </form>
  );
}

function readPhoto(file: File): Promise<ClaimPhotoInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
