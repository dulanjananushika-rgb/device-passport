import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { getDailySettlement, generateDailySettlementThermalHtml } from "../../../lib/daily-settlement";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const dateIso = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const format = url.searchParams.get("format");

  try {
    const settlement = getDailySettlement(dateIso);
    if (format === "thermal") {
      const html = generateDailySettlementThermalHtml(settlement);
      return new NextResponse(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return NextResponse.json({ settlement });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate settlement." },
      { status: 400 }
    );
  }
}
