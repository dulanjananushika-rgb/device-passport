import { NextResponse } from "next/server";
import { getSession } from "../../../../../lib/auth";
import { activateDeviceSale } from "../../../../../lib/database";
import { canActivateSales } from "../../../../../lib/operations";
import type { PaymentMethod, DeliveryMethod } from "../../../../../lib/sales";

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
      salePriceLkr: typeof payload.salePriceLkr === "string" || typeof payload.salePriceLkr === "number" ? String(payload.salePriceLkr) : "",
      paymentMethod: typeof payload.paymentMethod === "string" ? (payload.paymentMethod as PaymentMethod) : "Cash",
      cashReceivedLkr: typeof payload.cashReceivedLkr === "string" ? payload.cashReceivedLkr : undefined,
      cardAmountLkr: typeof payload.cardAmountLkr === "string" ? payload.cardAmountLkr : undefined,
      bankTransferLkr: typeof payload.bankTransferLkr === "string" ? payload.bankTransferLkr : undefined,
      installmentLkr: typeof payload.installmentLkr === "string" ? payload.installmentLkr : undefined,
      paymentReference: typeof payload.paymentReference === "string" ? payload.paymentReference : "",
      upgradePartIds: Array.isArray(payload.upgradePartIds) ? payload.upgradePartIds.filter((p: unknown) => typeof p === "string") : undefined,
      warrantyBreakdown: payload.warrantyBreakdown && typeof payload.warrantyBreakdown === "object" ? payload.warrantyBreakdown : undefined,
      bundledAccessories: Array.isArray(payload.bundledAccessories) ? payload.bundledAccessories.filter((a: unknown) => typeof a === "string") : undefined,
      deliveryMethod: typeof payload.deliveryMethod === "string" ? (payload.deliveryMethod as DeliveryMethod) : "In-Store Pickup",
      courierName: typeof payload.courierName === "string" ? payload.courierName : "",
      courierWaybill: typeof payload.courierWaybill === "string" ? payload.courierWaybill : "",
      courierFeeLkr: typeof payload.courierFeeLkr === "string" ? payload.courierFeeLkr : undefined,
      discountLkr: typeof payload.discountLkr === "string" ? payload.discountLkr : undefined,
      discountReason: typeof payload.discountReason === "string" ? payload.discountReason : "",
      fromReservationId: typeof payload.fromReservationId === "string" ? payload.fromReservationId : undefined,
    }, session.email);
    return NextResponse.json({ device }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The sale could not be activated." }, { status: 400 });
  }
}
