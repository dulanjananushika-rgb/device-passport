import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { parseLkrToCents } from "../../../lib/finance";
import { canAccessProcurement, canManageProcurement } from "../../../lib/operations";
import { createStockIntake, getProcurementDashboard } from "../../../lib/procurement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessProcurement(session.role)) return NextResponse.json({ error: "Your role cannot access procurement." }, { status: 403 });
  return NextResponse.json({ procurement: getProcurementDashboard(canManageProcurement(session.role)) });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProcurement(session.role)) return NextResponse.json({ error: "Only Owners can create stock intake records." }, { status: 403 });
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Enter valid stock intake details." }, { status: 400 });
  try {
    const intake = createStockIntake({
      supplierId: typeof payload.supplierId === "string" ? payload.supplierId : "",
      deviceName: typeof payload.deviceName === "string" ? payload.deviceName : "",
      model: typeof payload.model === "string" ? payload.model : "",
      serial: typeof payload.serial === "string" ? payload.serial : "",
      supplierInvoice: typeof payload.supplierInvoice === "string" ? payload.supplierInvoice : "",
      purchasedAt: typeof payload.purchasedAt === "string" ? payload.purchasedAt : "",
      purchaseCostCents: parseLkrToCents(payload.purchaseCostLkr, "Purchase cost"),
      notes: typeof payload.notes === "string" ? payload.notes : "",
    }, session.email);
    return NextResponse.json({ intake }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Stock intake could not be created." }, { status: 400 });
  }
}
