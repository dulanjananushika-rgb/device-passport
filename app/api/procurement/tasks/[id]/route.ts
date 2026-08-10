import { NextResponse } from "next/server";
import { getSession } from "../../../../../lib/auth";
import { canAccessProcurement } from "../../../../../lib/operations";
import { setRefurbishmentTaskCompleted } from "../../../../../lib/procurement";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessProcurement(session.role)) return NextResponse.json({ error: "Your role cannot update refurbishment tasks." }, { status: 403 });
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.completed !== "boolean") return NextResponse.json({ error: "Choose whether the task is completed." }, { status: 400 });
  try {
    const { id } = await params;
    const intake = setRefurbishmentTaskCompleted(id, payload.completed, session.email);
    return NextResponse.json({ intake });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Refurbishment task could not be updated." }, { status: 400 });
  }
}
