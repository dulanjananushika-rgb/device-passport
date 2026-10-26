import { NextResponse } from "next/server";
import { getSession } from "../../../../../lib/auth";
import { canManageProcurement } from "../../../../../lib/operations";
import { bulkImportStockIntakes } from "../../../../../lib/bulk-intake";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProcurement(session.role)) {
    return NextResponse.json({ error: "Your role cannot perform bulk procurement imports." }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "CSV data is required." }, { status: 400 });
  }

  const { csvContent, supplierId, supplierInvoice } = payload;
  if (!csvContent || typeof csvContent !== "string") {
    return NextResponse.json({ error: "Missing csvContent string." }, { status: 400 });
  }

  try {
    const result = bulkImportStockIntakes(
      csvContent,
      typeof supplierId === "string" ? supplierId : undefined,
      typeof supplierInvoice === "string" ? supplierInvoice : "BULK-IMPORT",
      session.name || session.email
    );
    return NextResponse.json({ result }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk import failed." },
      { status: 400 }
    );
  }
}
