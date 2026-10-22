import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, validateCredentials } from "../../../../lib/auth";
import { authenticateDemoRole } from "../../../../lib/database";
import { isStaffRole, type StaffRole } from "../../../../lib/operations";
import { checkRateLimit, requestRateKey, resetRateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string; password?: string; demoRole?: string } | null;

  // 1. One-click Demo Login by Role
  if (body?.demoRole && isStaffRole(body.demoRole)) {
    const staff = authenticateDemoRole(body.demoRole as StaffRole);
    if (!staff) {
      return NextResponse.json({ error: "Could not activate demo role session." }, { status: 500 });
    }
    const response = NextResponse.json({ ok: true, role: staff.role });
    response.cookies.set(SESSION_COOKIE, createSessionToken(staff), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 12 * 60 * 60,
    });
    return response;
  }

  // 2. Standard Email + Password Login
  const normalizedEmail = body?.email?.trim().toLowerCase() ?? "";
  const rateKey = requestRateKey(request, "login", normalizedEmail);
  const rate = checkRateLimit(rateKey, 12, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many sign-in attempts. Try again later." }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } });

  const staff = body?.email && body.password ? validateCredentials(body.email, body.password) : null;
  if (!staff) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }
  resetRateLimit(rateKey);

  const response = NextResponse.json({ ok: true, role: staff.role });
  response.cookies.set(SESSION_COOKIE, createSessionToken(staff), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return response;
}
