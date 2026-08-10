import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { listNotifications } from "../../../lib/notification-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ notifications: listNotifications() });
}
