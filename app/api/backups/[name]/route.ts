import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { resolveBackupFile } from "../../../../lib/backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ name: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "Owner") return NextResponse.json({ error: "Only an Owner can download backups." }, { status: 403 });
  try {
    const { name } = await params;
    const file = resolveBackupFile(name);
    return new NextResponse(new Uint8Array(readFileSync(file)), {
      headers: {
        "content-type": "application/vnd.sqlite3",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The backup could not be downloaded." }, { status: 404 });
  }
}
