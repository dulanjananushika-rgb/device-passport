import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { canManageSettings } from "../../../../lib/operations";
import { setTesterAgentActive } from "../../../../lib/tester-store";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageSettings(session.role)) return NextResponse.json({ error: "Owner access is required." }, { status: 403 });
  const payload = await request.json().catch(() => null);
  if (typeof payload?.active !== "boolean") return NextResponse.json({ error: "An active state is required." }, { status: 400 });
  try {
    const { id } = await context.params;
    return NextResponse.json({ agent: setTesterAgentActive(id, payload.active, session.email) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The tester station could not be updated." }, { status: 400 });
  }
}
