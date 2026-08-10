import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { getSystemReadiness } from "../../../lib/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "Owner") return NextResponse.json({ error: "Only an Owner can view system readiness." }, { status: 403 });
  return NextResponse.json({ system: getSystemReadiness() }, { headers: { "cache-control": "no-store" } });
}
