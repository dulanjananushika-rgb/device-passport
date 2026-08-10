import { financeAnalyticsCsv } from "../../../../lib/analytics";
import { getSession } from "../../../../lib/auth";
import { canViewFinance } from "../../../../lib/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewFinance(session.role)) return Response.json({ error: "Only Owners can export financial analytics." }, { status: 403 });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${financeAnalyticsCsv()}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="device-passport-finance-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
