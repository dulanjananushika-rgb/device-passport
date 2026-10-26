import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import {
  createCustomerRepairJob,
  listCustomerRepairJobs,
  type CreateRepairInput,
} from "../../../lib/repairs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const phone = url.searchParams.get("phone") || undefined;
  const technician = url.searchParams.get("technician") || undefined;

  try {
    const repairs = listCustomerRepairJobs({ status, phone, technician });
    return NextResponse.json({ repairs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load repair jobs." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Repair job details are required." }, { status: 400 });
  }

  try {
    const input: CreateRepairInput = {
      customerName: String(payload.customerName || ""),
      customerPhone: String(payload.customerPhone || ""),
      customerEmail: payload.customerEmail ? String(payload.customerEmail) : undefined,
      deviceBrand: String(payload.deviceBrand || ""),
      deviceModel: String(payload.deviceModel || ""),
      serial: payload.serial ? String(payload.serial) : undefined,
      devicePasswordPin: payload.devicePasswordPin ? String(payload.devicePasswordPin) : undefined,
      accessoriesReceived: payload.accessoriesReceived ? String(payload.accessoriesReceived) : undefined,
      reportedFault: String(payload.reportedFault || ""),
      physicalCondition: payload.physicalCondition ? String(payload.physicalCondition) : undefined,
      estimatedCostLkr: payload.estimatedCostLkr ? String(payload.estimatedCostLkr) : undefined,
      advancePaidLkr: payload.advancePaidLkr ? String(payload.advancePaidLkr) : undefined,
      assignedTechnician: payload.assignedTechnician ? String(payload.assignedTechnician) : undefined,
    };

    const repair = createCustomerRepairJob(input, session.name || session.email);
    return NextResponse.json({ repair }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create repair job." },
      { status: 400 }
    );
  }
}
