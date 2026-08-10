import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { createDeviceFromReport } from "../../../lib/database";
import { canCreatePassports } from "../../../lib/operations";
import { getPendingTestRun } from "../../../lib/tester-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreatePassports(session.role)) return NextResponse.json({ error: "Your role cannot create device passports." }, { status: 403 });

  const payload = await request.json().catch(() => null);
  const testRunId = typeof payload?.testRunId === "string" ? payload.testRunId : "";
  const connectedRun = testRunId ? getPendingTestRun(testRunId) : null;
  const sourceReport = connectedRun?.report ?? payload?.report;
  if (testRunId && !connectedRun) return NextResponse.json({ error: "This connected test report is no longer available." }, { status: 409 });
  if (!sourceReport || typeof sourceReport !== "object" || !payload?.checks) {
    return NextResponse.json({ error: "A valid diagnostic JSON report is required." }, { status: 400 });
  }
  const report = structuredClone(sourceReport);
  report.integrity = {
    ...(report.integrity && typeof report.integrity === "object" ? report.integrity : {}),
    serverSignatureVerified: Boolean(connectedRun),
    verifiedTestRunId: connectedRun?.id ?? "",
    verifiedAgentName: connectedRun?.agentName ?? "",
  };

  try {
    const device = createDeviceFromReport(
      report,
      payload.checks,
      typeof payload.notes === "string" ? payload.notes : "",
      Array.isArray(payload.photos) ? payload.photos : [],
      session.email,
      testRunId,
    );
    return NextResponse.json({ device }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The report could not be saved." }, { status: 400 });
  }
}
