import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, validateCredentials } from "../../../../lib/auth";
import { checkRateLimit, requestRateKey, resetRateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
  const normalizedEmail = body?.email?.trim().toLowerCase() ?? "";
  const rateKey = requestRateKey(request, "login", normalizedEmail);
  const rate = checkRateLimit(rateKey, 8, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many sign-in attempts. Try again later." }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } });
  const staff = body?.email && body.password ? validateCredentials(body.email, body.password) : null;
  if (!staff) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }
  resetRateLimit(rateKey);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(staff), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return response;
}
