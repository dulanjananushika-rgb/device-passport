import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { processReturnOrExchange, listReturns } from "../../../lib/returns";
import { canActivateSales } from "../../../lib/operations";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const returns = listReturns();
    return NextResponse.json({ returns });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load returns." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canActivateSales(session.role)) {
    return NextResponse.json({ error: "Your role cannot process returns or exchanges." }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Return details are required." }, { status: 400 });
  }

  try {
    const record = processReturnOrExchange(payload, session.name || session.email);
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process return." },
      { status: 400 }
    );
  }
}
