import { NextResponse } from "next/server";
import { updateDeviceFinance } from "../../../../../lib/analytics";
import { getSession } from "../../../../../lib/auth";
import { parseLkrToCents } from "../../../../../lib/finance";
import { canViewFinance } from "../../../../../lib/operations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewFinance(session.role)) return NextResponse.json({ error: "Only Owners can update device costs." }, { status: 403 });
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Enter valid device costs." }, { status: 400 });
  try {
    const { id } = await params;
    const purchaseCostCents = parseLkrToCents(payload.purchaseCostLkr, "Purchase cost");
    const refurbishmentCostCents = parseLkrToCents(payload.refurbishmentCostLkr, "Refurbishment cost");
    const device = updateDeviceFinance(id, purchaseCostCents, refurbishmentCostCents, session.email);
    return NextResponse.json({ device });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Device costs could not be updated." }, { status: 400 });
  }
}
