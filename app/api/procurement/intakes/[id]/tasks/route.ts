import { NextResponse } from "next/server";
import { getSession } from "../../../../../../lib/auth";
import { parseLkrToCents } from "../../../../../../lib/finance";
import { canAccessProcurement } from "../../../../../../lib/operations";
import { createRefurbishmentTask, refurbishmentCategories, type RefurbishmentCategory } from "../../../../../../lib/procurement";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessProcurement(session.role)) return NextResponse.json({ error: "Your role cannot create refurbishment tasks." }, { status: 403 });
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Enter a valid refurbishment task." }, { status: 400 });
  if (typeof payload.category !== "string" || !refurbishmentCategories.includes(payload.category as RefurbishmentCategory)) return NextResponse.json({ error: "Choose a valid refurbishment category." }, { status: 400 });
  try {
    const { id } = await params;
    const task = createRefurbishmentTask(id, {
      category: payload.category as RefurbishmentCategory,
      description: typeof payload.description === "string" ? payload.description : "",
      costCents: parseLkrToCents(payload.costLkr ?? "0", "Task cost"),
    }, session.email);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Refurbishment task could not be created." }, { status: 400 });
  }
}
