import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { getShopSettings, updateShopSettings } from "../../../lib/database";
import { canManageSettings } from "../../../lib/operations";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ settings: getShopSettings() });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageSettings(session.role)) return NextResponse.json({ error: "Owner access is required." }, { status: 403 });
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Enter valid shop settings." }, { status: 400 });
  try {
    const settings = updateShopSettings({
      shopName: typeof payload.shopName === "string" ? payload.shopName : "",
      tagline: typeof payload.tagline === "string" ? payload.tagline : "",
      contactEmail: typeof payload.contactEmail === "string" ? payload.contactEmail : "",
      phone: typeof payload.phone === "string" ? payload.phone : "",
      address: typeof payload.address === "string" ? payload.address : "",
      warrantyMonths: Number(payload.warrantyMonths),
      warrantyTerms: typeof payload.warrantyTerms === "string" ? payload.warrantyTerms : "",
      logoDataUrl: typeof payload.logoDataUrl === "string" ? payload.logoDataUrl : "",
      currencyCode: typeof payload.currencyCode === "string" ? payload.currencyCode : undefined,
      currencySymbol: typeof payload.currencySymbol === "string" ? payload.currencySymbol : undefined,
      currencyPosition: typeof payload.currencyPosition === "string" ? payload.currencyPosition : undefined,
      dateFormat: typeof payload.dateFormat === "string" ? payload.dateFormat : undefined,
      taxMode: typeof payload.taxMode === "string" ? payload.taxMode : undefined,
      defaultShippingCarrier: typeof payload.defaultShippingCarrier === "string" ? payload.defaultShippingCarrier : undefined,
      taxId: typeof payload.taxId === "string" ? payload.taxId : undefined,
      taxRatePercent: typeof payload.taxRatePercent !== "undefined" ? Number(payload.taxRatePercent) : undefined,
      taxInclusive: typeof payload.taxInclusive !== "undefined" ? Boolean(payload.taxInclusive) : undefined,
    }, session.email);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Shop settings could not be saved." }, { status: 400 });
  }
}
