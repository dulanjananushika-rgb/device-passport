import { NextResponse } from "next/server";
import { createWarrantyClaim } from "../../../../../../lib/database";
import { checkRateLimit, requestRateKey } from "../../../../../../lib/rate-limit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const rate = checkRateLimit(requestRateKey(request, "public-claim", id), 6, 60 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many claim attempts. Try again later." }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } });
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Enter the required claim details." }, { status: 400 });
  }
  if (payload.website) return NextResponse.json({ error: "The claim could not be submitted." }, { status: 400 });

  try {
    const claim = createWarrantyClaim(id, {
      customerName: typeof payload.customerName === "string" ? payload.customerName : "",
      customerEmail: typeof payload.customerEmail === "string" ? payload.customerEmail : "",
      customerPhone: typeof payload.customerPhone === "string" ? payload.customerPhone : "",
      category: payload.category,
      description: typeof payload.description === "string" ? payload.description : "",
      photos: Array.isArray(payload.photos) ? payload.photos : [],
    });
    return NextResponse.json({ claim: { id: claim.id, trackingToken: claim.trackingToken } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The claim could not be submitted." }, { status: 400 });
  }
}
