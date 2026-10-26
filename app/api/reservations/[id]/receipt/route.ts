import { NextResponse } from "next/server";
import { getSession } from "../../../../../lib/auth";
import { generateReservationReceiptHtml } from "../../../../../lib/reservations";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const html = generateReservationReceiptHtml(id);
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Receipt not found." },
      { status: 404 }
    );
  }
}
