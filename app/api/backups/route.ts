import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { createManualBackup, listDatabaseBackups } from "../../../lib/backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "Owner") return NextResponse.json({ error: "Only an Owner can manage backups." }, { status: 403 });
  return NextResponse.json({ backups: listDatabaseBackups() }, { headers: { "cache-control": "no-store" } });
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "Owner") return NextResponse.json({ error: "Only an Owner can create backups." }, { status: 403 });
  try {
    const backup = createManualBackup(session.email);
    return NextResponse.json({ backup }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The backup could not be created." }, { status: 500 });
  }
}
