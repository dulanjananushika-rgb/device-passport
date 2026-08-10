import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { createDeviceFromReport } from "../../../lib/database";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => null);
  if (!payload?.report || typeof payload.report !== "object" || !payload.checks) {
    return NextResponse.json({ error: "A valid diagnostic JSON report is required." }, { status: 400 });
  }

  try {
    const device = createDeviceFromReport(
      payload.report,
      payload.checks,
      typeof payload.notes === "string" ? payload.notes : "",
      Array.isArray(payload.photos) ? payload.photos : [],
      session.email,
    );
    return NextResponse.json({ device }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The report could not be saved." }, { status: 400 });
  }
}
