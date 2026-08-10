import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "../lib/auth";
import { ensureDailyBackup } from "../lib/backups";
import { getShopSettings, listAuditEvents, listClaimAssignees, listDevices, listStaffAccounts, listWarrantyClaims } from "../lib/database";
import { listNotifications } from "../lib/notification-store";
import { getSystemReadiness } from "../lib/readiness";
import { Dashboard } from "./ui/Dashboard";
import { getFinanceAnalytics } from "../lib/analytics";
import { getProcurementDashboard } from "../lib/procurement";
import { listPendingTestRuns, listTesterAgents } from "../lib/tester-store";

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
      initialClaims={listWarrantyClaims(session.role !== "Support")}
      initialClaimAssignees={listClaimAssignees()}
      initialNotifications={listNotifications()}
      initialStaff={ownerData ? listStaffAccounts() : []}
      initialAudit={ownerData ? listAuditEvents() : []}
      initialSettings={getShopSettings()}
      initialSystem={ownerData ? getSystemReadiness() : null}
      initialAnalytics={ownerData ? getFinanceAnalytics() : null}
      initialProcurement={session.role !== "Support" ? getProcurementDashboard(ownerData) : null}
      initialTestRuns={session.role !== "Support" ? listPendingTestRuns() : []}
      initialTesterAgents={ownerData ? listTesterAgents() : []}
      session={session}
    />
  );
}
