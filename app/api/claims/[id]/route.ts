import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { updateWarrantyClaimStatus } from "../../../../lib/database";
import { isClaimStatus } from "../../../../lib/claims";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  if (!isClaimStatus(payload?.status)) return NextResponse.json({ error: "Choose a valid claim status." }, { status: 400 });

  try {
    const claim = updateWarrantyClaimStatus(id, payload.status, typeof payload.note === "string" ? payload.note : "", session.email);
    return NextResponse.json({ claim });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The claim could not be updated." }, { status: 400 });
  }
}
