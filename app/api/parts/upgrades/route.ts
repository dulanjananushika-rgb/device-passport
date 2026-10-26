import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { listAvailableUpgrades } from "../../../../lib/pos-customization";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const upgrades = listAvailableUpgrades();
    return NextResponse.json({ upgrades });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load upgrade options." },
      { status: 400 }
    );
  }
}
