import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { authenticateStaff, changeStaffPassword } from "../../../../lib/database";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => null);
  const currentPassword = typeof payload?.currentPassword === "string" ? payload.currentPassword : "";
  const newPassword = typeof payload?.newPassword === "string" ? payload.newPassword : "";
  if (!authenticateStaff(session.email, currentPassword)) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  try {
    changeStaffPassword(session.id, newPassword, session.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Password could not be changed." }, { status: 400 });
  }
}
