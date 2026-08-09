"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type QrCodeProps = {
  path: string;
  label: string;
};

export function QrCode({ path, label }: QrCodeProps) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    const url = new URL(path, window.location.origin).toString();
    QRCode.toDataURL(url, {
      width: 220,
      margin: 2,
      color: { dark: "#123c2eff", light: "#ffffffff" },
      errorCorrectionLevel: "M",
    }).then(setSrc);
  }, [path]);

  return (
    <div className="qr-frame" aria-label={label}>
      {src ? <img src={src} alt={label} /> : <div className="qr-placeholder">Creating QR…</div>}
    </div>
  );
}
