import type { Metadata } from "next";
import { getDailySettlement } from "../../lib/daily-settlement";
import SettlementClient from "./SettlementClient";

export const metadata: Metadata = {
  title: "Day-End Z-Report Settlement - DevicePassport ERP",
  description: "End of day retail sales, cash drawer reconciliation and profit audit.",
};

export const dynamic = "force-dynamic";

export default async function SettlementPage() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const settlement = getDailySettlement(todayIso);

  return <SettlementClient initialData={settlement} initialDate={todayIso} />;
}
