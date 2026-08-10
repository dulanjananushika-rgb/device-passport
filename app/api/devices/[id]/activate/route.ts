import { NextResponse } from "next/server";
import { getSession } from "../../../../../lib/auth";
import { activateDeviceSale } from "../../../../../lib/database";
import { canActivateSales } from "../../../../../lib/operations";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canActivateSales(session.role)) return NextResponse.json({ error: "Your role cannot activate device sales." }, { status: 403 });

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Sale details are required." }, { status: 400 });

  try {
    const { id } = await params;
    const device = activateDeviceSale(id, {
      customerName: typeof payload.customerName === "string" ? payload.customerName : "",
      customerEmail: typeof payload.customerEmail === "string" ? payload.customerEmail : "",
      customerPhone: typeof payload.customerPhone === "string" ? payload.customerPhone : "",
      invoiceReference: typeof payload.invoiceReference === "string" ? payload.invoiceReference : "",
      soldAt: typeof payload.soldAt === "string" ? payload.soldAt : "",
    }, session.email);
    return NextResponse.json({ device }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The sale could not be activated." }, { status: 400 });
  }
}
