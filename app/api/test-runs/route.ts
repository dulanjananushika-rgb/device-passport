import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { canCreatePassports } from "../../../lib/operations";
import { listPendingTestRuns } from "../../../lib/tester-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreatePassports(session.role)) return NextResponse.json({ error: "Your role cannot access connected test reports." }, { status: 403 });
  return NextResponse.json({ testRuns: listPendingTestRuns() });
}
