import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { changeStaffPassword, updateStaffAccount } from "../../../../lib/database";
import { canManageStaff, isStaffRole } from "../../../../lib/operations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageStaff(session.role)) return NextResponse.json({ error: "Owner access is required." }, { status: 403 });
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  if (!payload || !isStaffRole(payload.role)) return NextResponse.json({ error: "Enter valid staff account details." }, { status: 400 });
  if (id === session.id && payload.active === false) return NextResponse.json({ error: "You cannot disable your own active session." }, { status: 400 });
  try {
    const staff = updateStaffAccount(id, {
      name: typeof payload.name === "string" ? payload.name : "",
      role: payload.role,
      active: payload.active !== false,
    }, session.email);
    if (typeof payload.password === "string" && payload.password) changeStaffPassword(id, payload.password, session.email);
    return NextResponse.json({ staff });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The staff account could not be updated." }, { status: 400 });
  }
}
