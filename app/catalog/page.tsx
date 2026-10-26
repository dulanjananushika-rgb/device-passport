import type { Metadata } from "next";
import Link from "next/link";
import { getShopSettings } from "../../lib/database";
import { queryPublicCatalog, type CatalogItem } from "../../lib/public-catalog";
import { ShopBrand } from "../ui/ShopBrand";

export const metadata: Metadata = {
  title: "Live Refurbished Laptop Catalog | Certified & Warranty Backed",
  description:
    "Browse 100% hardware-tested, certified enterprise laptops with transparent battery health, diagnostic benchmark scores, and official warranty.",
};

export const dynamic = "force-dynamic";

interface CatalogPageProps {
  searchParams: Promise<{
    brand?: string;
    ram?: string;
    grade?: string;
    sort?: string;
    q?: string;
  }>;
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const settings = getShopSettings();
  const brand = params.brand || "";
  const minRamGb = params.ram ? parseInt(params.ram, 10) : undefined;
  const grade = (params.grade as "A" | "B" | "C") || undefined;
  const sort = (params.sort as any) || "newest";
  const search = params.q || "";

  const catalog = await queryPublicCatalog({
    brand: brand || undefined,
    minRamGb,
    grade,
    sort,
    search: search || undefined,
    pageSize: 36,
  });

  const brands = ["All", "Lenovo", "Dell", "HP", "Apple", "Asus"];
  const ramOptions = [
    { label: "All RAM", value: "" },
    { label: "8 GB+", value: "8" },
    { label: "16 GB+", value: "16" },
    { label: "32 GB+", value: "32" },
  ];

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100 font-sans pb-16">
      {/* Top Announcement Bar */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-semibold px-4 py-2 text-center tracking-wide">
        🛡️ ALL LAPTOPS ARE 100% HARDWARE CERTIFIED WITH OFFICIAL {settings?.warrantyMonths || 6}-MONTH WARRANTY
      </div>

      {/* Navigation Header */}
      <header className="border-b border-slate-800 bg-[#0d1527]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <ShopBrand settings={settings} />
            <span className="hidden sm:inline-block text-xs uppercase px-2.5 py-1 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 font-medium">
              Live Showroom Catalog
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/portal"
              className="text-xs font-semibold px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700 flex items-center gap-1.5"
            >
              <span>🔑</span>
              <span>Customer Portal</span>
            </Link>
            <a
              href={`https://wa.me/${(settings?.phone || "0771234567").replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 shadow-lg shadow-emerald-900/30"
            >
              <span>💬</span>
              <span>WhatsApp Hotline</span>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-6">
        <div className="max-w-3xl">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Verified Pre-Owned &amp; Refurbished Laptops
          </h1>
          <p className="mt-2 text-slate-400 text-sm sm:text-base">
            Every machine is individually stress-tested, battery health certified, and backed by a transparent digital hardware passport. No hidden flaws.
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div className="mt-8 p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          {/* Brand Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {brands.map((b) => {
              const isActive = (b === "All" && !brand) || brand.toLowerCase() === b.toLowerCase();
              const targetUrl = b === "All" ? "/catalog" : `/catalog?brand=${b}${minRamGb ? `&ram=${minRamGb}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`;
              return (
                <Link
                  key={b}
                  href={targetUrl}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                    isActive
                      ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {b}
                </Link>
              );
            })}
          </div>

          {/* Search Form */}
          <form method="GET" action="/catalog" className="flex items-center gap-2">
            {brand && <input type="hidden" name="brand" value={brand} />}
            {minRamGb && <input type="hidden" name="ram" value={minRamGb} />}
            <input
              type="text"
              name="q"
              defaultValue={search}
              placeholder="Search model, i5, i7, ThinkPad..."
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-full sm:w-64"
            />
            <button
              type="submit"
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 transition"
            >
              Search
            </button>
          </form>
        </div>

        {/* Results Count */}
        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
          <span>Showing <strong className="text-white">{catalog.items.length}</strong> of <strong className="text-white">{catalog.totalCount}</strong> laptops in stock</span>
          {(brand || search || minRamGb) && (
            <Link href="/catalog" className="text-cyan-400 hover:underline">Clear all filters</Link>
          )}
        </div>
      </section>

      {/* Catalog Cards Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6">
        {catalog.items.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/50 rounded-2xl border border-slate-800">
            <p className="text-4xl">💻</p>
            <h3 className="mt-2 text-lg font-bold text-white">No matching laptops found</h3>
            <p className="mt-1 text-sm text-slate-400">Try adjusting your search criteria or clearing filters.</p>
            <Link href="/catalog" className="mt-4 inline-block px-4 py-2 bg-slate-800 text-xs font-semibold rounded-lg text-slate-200">
              View All Laptops
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {catalog.items.map((item) => (
              <CatalogCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function CatalogCard({ item }: { item: CatalogItem }) {
  return (
    <article className="rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between overflow-hidden group shadow-lg hover:shadow-cyan-950/20">
      <div>
        {/* Top Badges */}
        <div className="p-5 pb-3 flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
              {item.brand}
            </span>
            <h3 className="mt-2 text-lg font-bold text-white group-hover:text-cyan-400 transition leading-snug">
              {item.name}
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Model: {item.model} • S/N: {item.serialMasked}
            </p>
          </div>

          <div className="flex flex-col items-end">
            <span
              className={`text-xs font-extrabold px-2 py-0.5 rounded-full border ${
                item.grade === "A"
                  ? "bg-emerald-950/80 text-emerald-300 border-emerald-800"
                  : "bg-amber-950/80 text-amber-300 border-amber-800"
              }`}
            >
              Grade {item.grade}
            </span>
            <span className="text-[11px] font-semibold text-slate-400 mt-1">
              Score: <strong className="text-cyan-400">{item.score}</strong>/100
            </span>
          </div>
        </div>

        {/* Specs Grid */}
        <div className="px-5 py-3 border-y border-slate-800/80 bg-slate-950/40 grid grid-cols-2 gap-2.5 text-xs">
          <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Processor</span>
            <span className="text-slate-200 font-medium truncate block" title={item.processor}>
              {item.processor}
            </span>
          </div>

          <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Memory (RAM)</span>
            <span className="text-slate-200 font-medium truncate block">
              {item.memory}
            </span>
          </div>

          <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Storage</span>
            <span className="text-slate-200 font-medium truncate block">
              {item.storage}
            </span>
          </div>

          <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Battery Health</span>
            <span className="text-emerald-400 font-bold truncate block">
              {item.batteryHealth}% Tested
            </span>
          </div>
        </div>

        {/* Warranty Tag */}
        <div className="px-5 py-2.5 text-[11px] font-semibold text-emerald-400/90 flex items-center gap-1.5">
          <span>🛡️</span>
          <span>{item.warrantyDurationMonths} Months Official Hardware Warranty</span>
        </div>
      </div>

      {/* Footer & Action Buttons */}
      <div className="p-5 pt-3 bg-slate-950/60 border-t border-slate-800/60">
        <div className="flex items-baseline justify-between mb-4">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Direct Price</span>
          <span className="text-xl font-black text-white tracking-tight">
            {item.formattedPrice}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Link
            href={`/passport/${item.serial}`}
            className="text-center text-xs font-semibold px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            Inspect Passport
          </Link>
          <a
            href={item.inquiryWhatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-xs font-bold px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center justify-center gap-1 shadow-md shadow-emerald-950"
          >
            <span>💬 WhatsApp</span>
          </a>
        </div>
      </div>
    </article>
  );
}
