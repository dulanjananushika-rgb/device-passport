import { NextResponse } from "next/server";
import { getSession } from "../../../../../lib/auth";
import { canAccessProcurement } from "../../../../../lib/operations";
import { updateSupplierRmaStatus, type UpdateRmaInput, type RmaStatus } from "../../../../../lib/supplier-rma";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessProcurement(session.role)) {
    return NextResponse.json({ error: "Your role cannot update supplier RMAs." }, { status: 403 });
  }

  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Update payload is required." }, { status: 400 });
  }

  try {
    const input: UpdateRmaInput = {
      status: payload.status as RmaStatus,
      creditLkr: payload.creditLkr ? String(payload.creditLkr) : undefined,
      replacementSerial: payload.replacementSerial ? String(payload.replacementSerial) : undefined,
      notes: payload.notes ? String(payload.notes) : undefined,
    };

    const rma = updateSupplierRmaStatus(id, input, session.name || session.email);
    return NextResponse.json({ rma });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update supplier RMA." },
      { status: 400 }
    );
  }
}
