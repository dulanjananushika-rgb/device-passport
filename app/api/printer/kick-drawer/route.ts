import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { canActivateSales } from "../../../../lib/operations";
import { ESC_POS } from "../../../../lib/invoicing";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canActivateSales(session.role)) return NextResponse.json({ error: "Your role cannot operate the cash drawer." }, { status: 403 });

  // Returns standard RJ11 cash drawer kick pulse in raw binary or hex format
  const kickPulse = ESC_POS.KICK_DRAWER_PIN2;
  return new NextResponse(kickPulse, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Printer-Command": "ESC_POS_KICK_DRAWER",
      "Cache-Control": "no-cache",
    },
  });
}
