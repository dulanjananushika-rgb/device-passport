import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { createStaffAccount, listStaffAccounts } from "../../../lib/database";
import { canManageStaff, isStaffRole } from "../../../lib/operations";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageStaff(session.role)) return NextResponse.json({ error: "Owner access is required." }, { status: 403 });
  return NextResponse.json({ staff: listStaffAccounts() });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageStaff(session.role)) return NextResponse.json({ error: "Owner access is required." }, { status: 403 });
  const payload = await request.json().catch(() => null);
  if (!payload || !isStaffRole(payload.role)) return NextResponse.json({ error: "Enter valid staff account details." }, { status: 400 });
  try {
    const staff = createStaffAccount({
      name: typeof payload.name === "string" ? payload.name : "",
      email: typeof payload.email === "string" ? payload.email : "",
      role: payload.role,
      password: typeof payload.password === "string" ? payload.password : "",
    }, session.email);
    return NextResponse.json({ staff }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The staff account could not be created." }, { status: 400 });
  }
}
