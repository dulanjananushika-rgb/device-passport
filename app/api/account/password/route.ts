import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { authenticateStaff, changeStaffPassword } from "../../../../lib/database";
import { checkRateLimit, requestRateKey, resetRateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rateKey = requestRateKey(request, "password-change", session.email);
  const rate = checkRateLimit(rateKey, 5, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many password attempts. Try again later." }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } });
  const payload = await request.json().catch(() => null);
  const currentPassword = typeof payload?.currentPassword === "string" ? payload.currentPassword : "";
  const newPassword = typeof payload?.newPassword === "string" ? payload.newPassword : "";
  if (!authenticateStaff(session.email, currentPassword)) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  try {
    changeStaffPassword(session.id, newPassword, session.email);
    resetRateLimit(rateKey);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Password could not be changed." }, { status: 400 });
  }
}
