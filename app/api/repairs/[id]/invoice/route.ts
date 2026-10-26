import { NextResponse } from "next/server";
import { generateRepairInvoiceHtml } from "../../../../../lib/repairs";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const origin = url.origin;

  try {
    const html = await generateRepairInvoiceHtml(id, origin);
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return new NextResponse(
      `<html><body><h2>Invoice Error:</h2><p>${error instanceof Error ? error.message : "Not found"}</p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
