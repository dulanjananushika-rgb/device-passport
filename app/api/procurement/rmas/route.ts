import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { canAccessProcurement } from "../../../../lib/operations";
import { createSupplierRma, listSupplierRmas, getRmaMetrics, type SupplierRmaInput } from "../../../../lib/supplier-rma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessProcurement(session.role)) {
    return NextResponse.json({ error: "Access denied to procurement and RMAs." }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const supplierId = url.searchParams.get("supplierId") || undefined;

  try {
    const rmas = listSupplierRmas({ status, supplierId });
    const metrics = getRmaMetrics();
    return NextResponse.json({ rmas, metrics });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load supplier RMAs." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessProcurement(session.role)) {
    return NextResponse.json({ error: "Your role cannot log supplier RMAs." }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "RMA details are required." }, { status: 400 });
  }

  try {
    const input: SupplierRmaInput = {
      supplierId: String(payload.supplierId || ""),
      rmaNumber: payload.rmaNumber ? String(payload.rmaNumber) : undefined,
      itemType: payload.itemType === "Device / Laptop" ? "Device / Laptop" : "Spare Part",
      itemName: String(payload.itemName || ""),
      serial: String(payload.serial || ""),
      faultDescription: String(payload.faultDescription || ""),
      dispatchedAt: payload.dispatchedAt ? String(payload.dispatchedAt) : undefined,
      notes: payload.notes ? String(payload.notes) : undefined,
    };

    const rma = createSupplierRma(input, session.name || session.email);
    return NextResponse.json({ rma }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record supplier RMA." },
      { status: 400 }
    );
  }
}
