import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { buildSocialCardOptionsForDevice, generateSocialCardSvg } from "../../../lib/social-graphics";
import { SocialCardClient } from "./SocialCardClient";

interface SocialCardPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: SocialCardPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Social Media Marketing Graphic - ${id}`,
  };
}

export default async function SocialCardPage({ params }: SocialCardPageProps) {
  const { id } = await params;
  const options = await buildSocialCardOptionsForDevice(id);

  if (!options) {
    notFound();
  }

  const svgContent = await generateSocialCardSvg(options);

  return (
    <div className="min-h-screen bg-[#070b14] text-white flex flex-col items-center justify-center p-4 sm:p-8 font-sans">
      <div className="max-w-4xl w-full">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between pb-6 border-b border-slate-800 gap-4 mb-6">
          <div>
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
              1-Click Marketing Generator
            </span>
            <h1 className="text-xl sm:text-2xl font-black mt-1">
              {options.name} (1080 × 1080 px)
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Optimized for Facebook Marketplace, Instagram Feed/Story, and WhatsApp Status
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/passport/${options.serial}`}
              className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              Passport View
            </Link>
            <Link
              href="/catalog"
              className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              Showroom
            </Link>
          </div>
        </div>

        {/* Client Interactive Viewer & Downloader */}
        <SocialCardClient svgContent={svgContent} filename={`${options.serial}-marketing-card.svg`} />
      </div>
    </div>
  );
}
