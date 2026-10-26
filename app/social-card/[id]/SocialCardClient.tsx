"use client";

import { useState } from "react";

interface SocialCardClientProps {
  svgContent: string;
  filename: string;
}

export function SocialCardClient({ svgContent, filename }: SocialCardClientProps) {
  const [copied, setCopied] = useState(false);

  function handleDownloadSvg() {
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="flex flex-col items-center">
      {/* 1080x1080 Display Canvas */}
      <div className="w-full max-w-[540px] aspect-square rounded-3xl overflow-hidden shadow-2xl border border-slate-800 bg-[#0a0f1d] p-1">
        <div
          className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>

      {/* Action Buttons Bar */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <button
          onClick={handleDownloadSvg}
          className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-sm tracking-wide transition shadow-lg shadow-cyan-500/25 flex items-center gap-2"
        >
          <span>📥</span>
          <span>Download 1080x1080 Vector SVG</span>
        </button>

        <button
          onClick={handlePrint}
          className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm border border-slate-700 transition flex items-center gap-2"
        >
          <span>🖨️</span>
          <span>Print / Save as PDF</span>
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500 text-center">
        Tip: SVG files can be imported directly into Canva, Photoshop, or uploaded to Instagram &amp; Facebook without quality loss.
      </p>
    </div>
  );
}
