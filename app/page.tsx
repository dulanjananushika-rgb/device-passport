import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "../lib/auth";
import { listDevices, listWarrantyClaims } from "../lib/database";
import { Dashboard } from "./ui/Dashboard";

export const metadata: Metadata = {
  title: "DevicePassport | Verified device health",
  description:
    "Create transparent health reports, QR device passports, and track warranties for refurbished laptops.",
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <Dashboard initialDevices={listDevices()} initialClaims={listWarrantyClaims()} userEmail={session.email} />;
}
