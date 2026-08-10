import { NextResponse } from "next/server";
import { getPublicHealth } from "../../../lib/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = getPublicHealth();
  return NextResponse.json(health, { status: health.status === "healthy" ? 200 : 503, headers: { "cache-control": "no-store" } });
}
