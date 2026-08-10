import { NextResponse } from "next/server";
import { acceptSignedTestRun, TesterRequestError } from "../../../../lib/tester-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 10 * 1024 * 1024) return NextResponse.json({ error: "The tester upload is too large." }, { status: 413 });
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "A signed tester payload is required." }, { status: 400 });
  try {
    const testRun = acceptSignedTestRun(request.headers.get("authorization"), payload);
    return NextResponse.json({ testRun }, { status: 201 });
  } catch (error) {
    const status = error instanceof TesterRequestError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "The signed test could not be accepted." }, { status });
  }
}
