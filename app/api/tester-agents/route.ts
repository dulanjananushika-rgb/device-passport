import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { canManageSettings } from "../../../lib/operations";
import { createTesterAgent, listTesterAgents } from "../../../lib/tester-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageSettings(session.role)) return NextResponse.json({ error: "Owner access is required." }, { status: 403 });
  return NextResponse.json({ agents: listTesterAgents() });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageSettings(session.role)) return NextResponse.json({ error: "Owner access is required." }, { status: 403 });
  const payload = await request.json().catch(() => null);
  try {
    const result = createTesterAgent(typeof payload?.name === "string" ? payload.name : "", session.email);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The tester station could not be created." }, { status: 400 });
  }
}
