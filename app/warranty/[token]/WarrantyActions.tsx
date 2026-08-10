"use client";

import { useState } from "react";

type WarrantyActionsProps = {
  path: string;
  customerEmail: string;
  deviceName: string;
};

export function WarrantyActions({ path, customerEmail, deviceName }: WarrantyActionsProps) {
  const [copied, setCopied] = useState(false);

  function shareUrl() {
    return new URL(path, window.location.origin).toString();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function shareWhatsApp() {
    const message = `Your digital warranty for ${deviceName}: ${shareUrl()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  function shareEmail() {
    const subject = `Digital warranty for ${deviceName}`;
    const body = `Keep this private warranty link for support and claims:\n\n${shareUrl()}`;
    window.location.href = `mailto:${encodeURIComponent(customerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return <div className="warranty-actions"><button className="button primary" type="button" onClick={() => window.print()}>Print warranty card</button><button className="button secondary" type="button" onClick={copyLink}>{copied ? "Link copied" : "Copy secure link"}</button><button className="button secondary" type="button" onClick={shareWhatsApp}>Share via WhatsApp</button><button className="button secondary" type="button" onClick={shareEmail}>Send by email</button></div>;
}
