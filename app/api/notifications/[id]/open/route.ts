import { NextResponse } from "next/server";
import { getSession } from "../../../../../lib/auth";
import { openNotificationComposer } from "../../../../../lib/notification-store";
import { isNotificationChannel } from "../../../../../lib/notifications";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => null);
  if (!isNotificationChannel(payload?.channel)) return NextResponse.json({ error: "Choose WhatsApp or Email." }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json(openNotificationComposer(id, payload.channel, session.email));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The message composer could not be opened." }, { status: 400 });
  }
}
