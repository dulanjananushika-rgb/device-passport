import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "../lib/auth";
import { ensureDailyBackup } from "../lib/backups";
import { getShopSettings, listAuditEvents, listClaimAssignees, listDevices, listStaffAccounts, listWarrantyClaims } from "../lib/database";
import { getSystemReadiness } from "../lib/readiness";
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
  ensureDailyBackup();

  const ownerData = session.role === "Owner";
  return (
    <Dashboard
      initialDevices={listDevices()}
      initialClaims={listWarrantyClaims()}
      initialClaimAssignees={listClaimAssignees()}
      initialStaff={ownerData ? listStaffAccounts() : []}
      initialAudit={ownerData ? listAuditEvents() : []}
      initialSettings={getShopSettings()}
      initialSystem={ownerData ? getSystemReadiness() : null}
      session={session}
    />
  );
}
