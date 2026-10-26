import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const filePath = path.join(process.cwd(), "tools", "macos", "collect-device-health.sh");
  if (!fs.existsSync(filePath)) {
    return new NextResponse("macOS collector script not found", { status: 404 });
  }
  const content = fs.readFileSync(filePath, "utf8");
  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Content-Disposition": 'attachment; filename="collect-device-health.sh"',
      "Cache-Control": "no-cache",
    },
  });
}
