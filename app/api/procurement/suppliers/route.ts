import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { canManageProcurement } from "../../../../lib/operations";
import { createSupplier } from "../../../../lib/procurement";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProcurement(session.role)) return NextResponse.json({ error: "Only Owners can manage suppliers." }, { status: 403 });
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Enter valid supplier details." }, { status: 400 });
  try {
    const supplier = createSupplier({
      name: typeof payload.name === "string" ? payload.name : "",
      contactName: typeof payload.contactName === "string" ? payload.contactName : "",
      email: typeof payload.email === "string" ? payload.email : "",
      phone: typeof payload.phone === "string" ? payload.phone : "",
    }, session.email);
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Supplier could not be created." }, { status: 400 });
  }
}
