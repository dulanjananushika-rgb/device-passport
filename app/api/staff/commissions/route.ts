import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { canViewFinance, canManageStaff } from "../../../../lib/operations";
import { calculateTechnicianCommissions } from "../../../../lib/technician-commissions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Technicians can see their own, managers/owners can see all
  const url = new URL(request.url);
  const requestedTech = url.searchParams.get("technician") || undefined;
  const startDate = url.searchParams.get("startDate") || undefined;
  const endDate = url.searchParams.get("endDate") || undefined;

  let targetTech = requestedTech;
  if (!canViewFinance(session.role) && !canManageStaff(session.role)) {
    // If not management, lock to session user's own name
    targetTech = session.name || session.email;
  }

  try {
    const summaries = calculateTechnicianCommissions(targetTech, startDate, endDate);
    return NextResponse.json({ summaries });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to calculate technician commissions." },
      { status: 400 }
    );
  }
}
