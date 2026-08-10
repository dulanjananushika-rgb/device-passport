import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "../lib/auth";
import { getShopSettings, listAuditEvents, listDevices, listStaffAccounts, listWarrantyClaims } from "../lib/database";
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

  const ownerData = session.role === "Owner";
  return (
    <Dashboard
      initialDevices={listDevices()}
      initialClaims={listWarrantyClaims()}
      initialStaff={ownerData ? listStaffAccounts() : []}
      initialAudit={ownerData ? listAuditEvents() : []}
      initialSettings={getShopSettings()}
      session={session}
    />
  );
}
