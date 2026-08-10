import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { listAuditEvents } from "../../../lib/database";
import { canManageStaff } from "../../../lib/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageStaff(session.role)) return NextResponse.json({ error: "Owner access is required." }, { status: 403 });
  return NextResponse.json({ audit: listAuditEvents() });
}
