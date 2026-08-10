"use client";

import { useState } from "react";

export function WarrantyActions() {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <div className="warranty-actions"><button className="button primary" type="button" onClick={() => window.print()}>Print warranty card</button><button className="button secondary" type="button" onClick={copyLink}>{copied ? "Link copied" : "Copy secure link"}</button></div>;
}
