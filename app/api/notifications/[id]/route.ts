import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { updateNotificationStatus } from "../../../../lib/notification-store";
import { isNotificationStatusAction } from "../../../../lib/notifications";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => null);
  if (!isNotificationStatusAction(payload?.status)) return NextResponse.json({ error: "Choose a valid notification action." }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json({ notification: updateNotificationStatus(id, payload.status, session.email) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The notification could not be updated." }, { status: 400 });
  }
}
