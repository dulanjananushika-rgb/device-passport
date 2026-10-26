import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { canActivateSales } from "../../../../lib/operations";
import {
  getPendingFollowUpSequences,
  markSequenceDispatched,
  type SequenceType,
} from "../../../../lib/whatsapp-sequences";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canActivateSales(session.role)) {
    return NextResponse.json({ error: "Access denied to sales follow-ups." }, { status: 403 });
  }

  const url = new URL(request.url);
  const referenceDate = url.searchParams.get("referenceDate") || undefined;

  try {
    const sequences = getPendingFollowUpSequences(referenceDate);
    return NextResponse.json({ sequences });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load follow-up sequences." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canActivateSales(session.role)) {
    return NextResponse.json({ error: "Access denied to sales follow-ups." }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Follow-up payload is required." }, { status: 400 });
  }

  const { deviceId, sequenceType, customerPhone, messageText } = payload;
  if (!deviceId || !sequenceType) {
    return NextResponse.json({ error: "Device ID and Sequence Type are required." }, { status: 400 });
  }

  try {
    markSequenceDispatched(
      String(deviceId),
      sequenceType as SequenceType,
      String(customerPhone || ""),
      String(messageText || "")
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record sequence dispatch." },
      { status: 400 }
    );
  }
}
