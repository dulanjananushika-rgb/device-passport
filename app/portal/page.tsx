import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { getCustomerPortalData, verifyCustomerSession } from "../../lib/customer-portal";
import { getShopSettings } from "../../lib/database";
import { ShopBrand } from "../ui/ShopBrand";
import { CustomerPortalClient } from "./CustomerPortalClient";

export const metadata: Metadata = {
  title: "Customer Self-Service Warranty & Device Portal",
  description:
    "Login with your mobile phone number to view your purchased laptops, active warranty coverage, invoice receipts, and submit warranty service claims.",
};

export const dynamic = "force-dynamic";

export default async function CustomerPortalPage() {
  const settings = getShopSettings();
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("devicepassport_customer_session")?.value;

  let portalData = null;
  if (sessionToken) {
    const session = verifyCustomerSession(sessionToken);
    if (session.valid && session.phone) {
      portalData = getCustomerPortalData(session.phone);
    }
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 font-sans pb-16">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-[#0d1424]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShopBrand settings={settings} />
            <span className="text-xs uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
              Customer Portal
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/catalog"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Browse Showroom
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-10">
        <CustomerPortalClient initialData={portalData} shopPhone={settings?.phone || "0771234567"} />
      </main>
    </div>
  );
}
