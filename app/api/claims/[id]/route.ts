import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { updateWarrantyClaim } from "../../../../lib/database";
import { isClaimPriority, isClaimStatus } from "../../../../lib/claims";
import { parseLkrToCents } from "../../../../lib/finance";
import { canRecordServiceCosts } from "../../../../lib/operations";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Enter a valid claim update." }, { status: 400 });
  if (payload.status !== undefined && !isClaimStatus(payload.status)) return NextResponse.json({ error: "Choose a valid claim status." }, { status: 400 });
  if (payload.priority !== undefined && !isClaimPriority(payload.priority)) return NextResponse.json({ error: "Choose a valid service priority." }, { status: 400 });
  if (payload.serviceCostLkr !== undefined && !canRecordServiceCosts(session.role)) return NextResponse.json({ error: "Your role cannot update warranty service costs." }, { status: 403 });

  try {
    const serviceCostCents = payload.serviceCostLkr === undefined ? undefined : parseLkrToCents(payload.serviceCostLkr, "Warranty service cost");
    const claim = updateWarrantyClaim(id, {
      status: payload.status,
      publicNote: typeof payload.note === "string" ? payload.note : undefined,
      priority: payload.priority,
      assignedToId: typeof payload.assignedToId === "string" ? payload.assignedToId : undefined,
      dueDate: typeof payload.dueDate === "string" ? payload.dueDate : undefined,
      internalNote: typeof payload.internalNote === "string" ? payload.internalNote : undefined,
      serviceCostCents,
    }, session.email);
    return NextResponse.json({ claim: session.role === "Support" ? { ...claim, serviceCostCents: 0 } : claim });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The claim could not be updated." }, { status: 400 });
  }
}
