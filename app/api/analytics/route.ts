import { NextResponse } from "next/server";
import { getFinanceAnalytics } from "../../../lib/analytics";
import { getSession } from "../../../lib/auth";
import { canViewFinance } from "../../../lib/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewFinance(session.role)) return NextResponse.json({ error: "Only Owners can view financial analytics." }, { status: 403 });
  return NextResponse.json({ analytics: getFinanceAnalytics() });
}
