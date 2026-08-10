import { NextResponse } from "next/server";
import { getSession } from "../../../../../lib/auth";
import { parseLkrToCents } from "../../../../../lib/finance";
import { canAccessProcurement, canManageProcurement } from "../../../../../lib/operations";
import { procurementStatuses, updateStockIntake, type ProcurementStatus } from "../../../../../lib/procurement";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessProcurement(session.role)) return NextResponse.json({ error: "Your role cannot update stock intake." }, { status: 403 });
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Enter a valid intake update." }, { status: 400 });
  if (payload.purchaseCostLkr !== undefined && !canManageProcurement(session.role)) return NextResponse.json({ error: "Only Owners can update purchase costs." }, { status: 403 });
  if (payload.status !== undefined && (typeof payload.status !== "string" || !procurementStatuses.includes(payload.status as ProcurementStatus))) return NextResponse.json({ error: "Choose a valid intake status." }, { status: 400 });
  try {
    const { id } = await params;
    const intake = updateStockIntake(id, {
      status: payload.status as ProcurementStatus | undefined,
      notes: typeof payload.notes === "string" ? payload.notes : undefined,
      purchaseCostCents: payload.purchaseCostLkr === undefined ? undefined : parseLkrToCents(payload.purchaseCostLkr, "Purchase cost"),
    }, session.email);
    return NextResponse.json({ intake });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Stock intake could not be updated." }, { status: 400 });
  }
}
