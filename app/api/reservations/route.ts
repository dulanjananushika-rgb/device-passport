import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { createReservation, listReservations } from "../../../lib/reservations";
import { canActivateSales } from "../../../lib/operations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "Active";

  try {
    const reservations = listReservations(status);
    return NextResponse.json({ reservations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load reservations." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canActivateSales(session.role)) {
    return NextResponse.json({ error: "Your role cannot reserve stock." }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Reservation details are required." }, { status: 400 });
  }

  const { deviceId, ...input } = payload;
  if (!deviceId || typeof deviceId !== "string") {
    return NextResponse.json({ error: "Device ID is required." }, { status: 400 });
  }

  try {
    const reservation = createReservation(deviceId, input, session.name || session.email);
    return NextResponse.json({ reservation }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reserve device." },
      { status: 400 }
    );
  }
}
