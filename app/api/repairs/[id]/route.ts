import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import {
  getCustomerRepairJob,
  updateCustomerRepairJob,
  type UpdateRepairInput,
  type RepairStatus,
} from "../../../../lib/repairs";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const repair = getCustomerRepairJob(id);
  if (!repair) return NextResponse.json({ error: "Repair job not found." }, { status: 404 });

  return NextResponse.json({ repair });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Update payload is required." }, { status: 400 });
  }

  try {
    const input: UpdateRepairInput = {
      status: payload.status as RepairStatus,
      assignedTechnician: payload.assignedTechnician !== undefined ? String(payload.assignedTechnician) : undefined,
      technicianNotes: payload.technicianNotes !== undefined ? String(payload.technicianNotes) : undefined,
      partsCostLkr: payload.partsCostLkr !== undefined ? String(payload.partsCostLkr) : undefined,
      laborFeeLkr: payload.laborFeeLkr !== undefined ? String(payload.laborFeeLkr) : undefined,
      advancePaidLkr: payload.advancePaidLkr !== undefined ? String(payload.advancePaidLkr) : undefined,
      accessoriesReceived: payload.accessoriesReceived !== undefined ? String(payload.accessoriesReceived) : undefined,
    };

    const repair = updateCustomerRepairJob(id, input, session.name || session.email);
    return NextResponse.json({ repair });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update repair job." },
      { status: 400 }
    );
  }
}
