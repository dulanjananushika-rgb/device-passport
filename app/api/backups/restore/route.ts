import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { restoreDatabaseBackup } from "../../../../lib/backups";
import { authenticateStaff } from "../../../../lib/database";
import { checkRateLimit, requestRateKey } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "Owner") return NextResponse.json({ error: "Only an Owner can restore backups." }, { status: 403 });
  const rate = checkRateLimit(requestRateKey(request, "backup-restore", session.email), 5, 60 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many restore attempts. Try again later." }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } });

  const payload = await request.json().catch(() => null) as { name?: string; confirmation?: string; password?: string } | null;
  if (payload?.confirmation !== "RESTORE") return NextResponse.json({ error: "Type RESTORE exactly to confirm recovery." }, { status: 400 });
  if (!payload.password || !authenticateStaff(session.email, payload.password)) return NextResponse.json({ error: "Your current Owner password is incorrect." }, { status: 401 });

  try {
    const result = restoreDatabaseBackup(payload.name ?? "", session.email);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The database could not be restored." }, { status: 400 });
  }
}
