import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getDatabase, recordAuditEvent } from "./database";
import { inspectionKeys, type DiagnosticReport, type InspectionChecks, type InspectionPhotoInput } from "./inspection";
import type { PendingTestRun, SignedTestRunInput, TesterAgent } from "./tester-types";

type TesterAgentRow = {
  id: string;
  name: string;
  token_hash: string;
  active: number;
  last_seen_at: string;
  created_by: string;
  created_at: string;
};

type TestRunRow = {
  id: string;
  agent_id: string;
  agent_name: string;
  report_json: string;
  checks_json: string;
  notes: string;
  photos_json: string;
  received_at: string;
};

export class TesterRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest();
}

function equalHex(left: string, right: string) {
  if (!/^[a-f\d]{64}$/i.test(left) || !/^[a-f\d]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function rowToAgent(row: TesterAgentRow): TesterAgent {
  return {
    id: row.id,
    name: row.name,
    active: row.active === 1,
    lastSeenAt: row.last_seen_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function parseJson<T>(value: string, fallback: T) {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToRun(row: TestRunRow): PendingTestRun {
  const report = parseJson<DiagnosticReport>(row.report_json, {});
  return {
    id: row.id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    report,
    checks: parseJson<Partial<InspectionChecks>>(row.checks_json, {}),
    notes: row.notes,
    photos: parseJson<InspectionPhotoInput[]>(row.photos_json, []),
    signatureVerified: true,
    receivedAt: row.received_at,
    serial: report.device?.serialNumber?.trim() ?? "",
    model: report.device?.model?.trim() ?? "",
  };
}

export function listTesterAgents() {
  return (getDatabase().prepare(`
    SELECT id, name, token_hash, active, last_seen_at, created_by, created_at
    FROM tester_agents ORDER BY active DESC, created_at DESC
  `).all() as unknown as TesterAgentRow[]).map(rowToAgent);
}

export function createTesterAgent(nameValue: string, actor: string) {
  const name = nameValue.trim();
  if (name.length < 2 || name.length > 80) throw new Error("Enter a tester station name between 2 and 80 characters.");
  const database = getDatabase();
  const duplicate = database.prepare("SELECT id FROM tester_agents WHERE name = ? COLLATE NOCASE AND active = 1").get(name);
  if (duplicate) throw new Error("An active tester station already uses this name.");

  const id = `agent_${randomUUID()}`;
  const token = `${id}.${randomBytes(32).toString("base64url")}`;
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO tester_agents (id, name, token_hash, active, last_seen_at, created_by, created_at, updated_at)
    VALUES (?, ?, ?, 1, '', ?, ?, ?)
  `).run(id, name, hashToken(token).toString("hex"), actor, now, now);
  recordAuditEvent(actor, "tester.created", `Created tester station ${name}.`);
  const row = database.prepare(`
    SELECT id, name, token_hash, active, last_seen_at, created_by, created_at FROM tester_agents WHERE id = ?
  `).get(id) as unknown as TesterAgentRow;
  return { agent: rowToAgent(row), token };
}

export function setTesterAgentActive(id: string, active: boolean, actor: string) {
  const database = getDatabase();
  const current = database.prepare("SELECT name FROM tester_agents WHERE id = ?").get(id) as { name: string } | undefined;
  if (!current) throw new Error("Tester station not found.");
  database.prepare("UPDATE tester_agents SET active = ?, updated_at = ? WHERE id = ?")
    .run(active ? 1 : 0, new Date().toISOString(), id);
  recordAuditEvent(actor, active ? "tester.enabled" : "tester.revoked", `${active ? "Enabled" : "Revoked"} tester station ${current.name}.`);
  const row = database.prepare(`
    SELECT id, name, token_hash, active, last_seen_at, created_by, created_at FROM tester_agents WHERE id = ?
  `).get(id) as unknown as TesterAgentRow;
  return rowToAgent(row);
}

const testRunSelect = `
  SELECT r.id, r.agent_id, a.name AS agent_name, r.report_json, r.checks_json,
    r.notes, r.photos_json, r.received_at
  FROM tester_test_runs r
  JOIN tester_agents a ON a.id = r.agent_id
`;

export function listPendingTestRuns() {
  return (getDatabase().prepare(`${testRunSelect} WHERE r.status = 'Pending' ORDER BY r.received_at DESC`).all() as unknown as TestRunRow[])
    .map(rowToRun);
}

export function getPendingTestRun(id: string) {
  const row = getDatabase().prepare(`${testRunSelect} WHERE r.id = ? AND r.status = 'Pending'`).get(id) as unknown as TestRunRow | undefined;
  return row ? rowToRun(row) : null;
}

function validateChecks(value: unknown) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new TesterRequestError("Manual checks must be an object.");
  const input = value as Record<string, unknown>;
  const checks: Partial<InspectionChecks> = {};
  for (const key of inspectionKeys) {
    if (input[key] === undefined) continue;
    if (input[key] !== "pass" && input[key] !== "fail") throw new TesterRequestError(`Invalid ${key} check result.`);
    checks[key] = input[key];
  }
  return checks;
}

function validatePhotos(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 4) throw new TesterRequestError("A maximum of four evidence photos is allowed.");
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new TesterRequestError(`Photo ${index + 1} is invalid.`);
    const photo = item as Record<string, unknown>;
    const name = typeof photo.name === "string" ? photo.name.trim() : "";
    const dataUrl = typeof photo.dataUrl === "string" ? photo.dataUrl : "";
    if (!name || name.length > 180 || !/^data:image\/(jpeg|png|webp);base64,/i.test(dataUrl)) throw new TesterRequestError(`Photo ${index + 1} is invalid.`);
    if (dataUrl.length > 2_800_000) throw new TesterRequestError(`${name} is larger than 2 MB.`);
    return { name, dataUrl };
  });
}

export function acceptSignedTestRun(authorization: string | null, input: SignedTestRunInput) {
  const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? "");
  if (!match) throw new TesterRequestError("A tester agent token is required.", 401);
  const token = match[1];
  const separator = token.indexOf(".");
  const agentId = separator > 0 ? token.slice(0, separator) : "";
  const database = getDatabase();
  const agent = agentId ? database.prepare(`
    SELECT id, name, token_hash, active, last_seen_at, created_by, created_at FROM tester_agents WHERE id = ?
  `).get(agentId) as unknown as TesterAgentRow | undefined : undefined;
  if (!agent || !agent.active || !equalHex(hashToken(token).toString("hex"), agent.token_hash)) {
    throw new TesterRequestError("The tester agent token is invalid or revoked.", 401);
  }

  if (typeof input?.reportJson !== "string" || !input.reportJson || input.reportJson.length > 1_000_000) {
    throw new TesterRequestError("A diagnostic report up to 1 MB is required.");
  }
  if (typeof input.signature !== "string" || !/^[a-f\d]{64}$/i.test(input.signature)) {
    throw new TesterRequestError("A valid SHA-256 report signature is required.");
  }
  const expected = createHmac("sha256", token).update(input.reportJson, "utf8").digest("hex");
  if (!equalHex(expected, input.signature)) throw new TesterRequestError("Report signature verification failed.", 401);

  let report: DiagnosticReport;
  try {
    report = JSON.parse(input.reportJson) as DiagnosticReport;
  } catch {
    throw new TesterRequestError("The signed diagnostic report is not valid JSON.");
  }
  const model = report.device?.model?.trim();
  const serial = report.device?.serialNumber?.trim();
  if (!model || !serial || serial === "UNKNOWN-SERIAL") throw new TesterRequestError("The signed report requires a device model and serial number.");
  if (model.length > 180 || serial.length > 180) throw new TesterRequestError("The report model or serial number is too long.");
  if (database.prepare("SELECT id FROM devices WHERE serial = ? COLLATE NOCASE").get(serial)) {
    throw new TesterRequestError(`A passport already exists for serial ${serial}.`, 409);
  }
  const pendingRows = database.prepare("SELECT report_json FROM tester_test_runs WHERE status = 'Pending'").all() as Array<{ report_json: string }>;
  if (pendingRows.some((row) => parseJson<DiagnosticReport>(row.report_json, {}).device?.serialNumber?.trim().toLowerCase() === serial.toLowerCase())) {
    throw new TesterRequestError(`A connected test is already waiting for serial ${serial}.`, 409);
  }

  const submittedChecks = validateChecks(input.checks);
  const signedChecks = validateChecks(report.manualChecks);
  for (const key of inspectionKeys) {
    if (signedChecks[key] && submittedChecks[key] && signedChecks[key] !== submittedChecks[key]) {
      throw new TesterRequestError(`The ${key} result does not match the signed report.`);
    }
  }
  const v4Report = Number.parseFloat(report.reportVersion ?? "0") >= 4;
  if (v4Report && !inspectionKeys.every((key) => signedChecks[key] === "pass" || signedChecks[key] === "fail")) {
    throw new TesterRequestError("Tester V4 reports must include every manual result inside the signed JSON.");
  }
  if (v4Report && !inspectionKeys.every((key) => {
    const status = report.interactiveTests?.results?.[key]?.status;
    return (status === "pass" || status === "fail") && status === signedChecks[key];
  })) {
    throw new TesterRequestError("Tester V4 reports must include a completed interactive result matching every signed manual result.");
  }
  const checks = { ...submittedChecks, ...signedChecks };
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > 800) throw new TesterRequestError("Technician notes must be 800 characters or fewer.");
  const photos = validatePhotos(input.photos);
  const id = `run_${randomUUID()}`;
  const now = new Date().toISOString();
  try {
    database.exec("BEGIN");
    database.prepare(`
      INSERT INTO tester_test_runs (
        id, agent_id, report_json, checks_json, notes, photos_json, signature, status, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
    `).run(id, agent.id, input.reportJson, JSON.stringify(checks), notes, JSON.stringify(photos), input.signature.toLowerCase(), now);
    database.prepare("UPDATE tester_agents SET last_seen_at = ?, updated_at = ? WHERE id = ?").run(now, now, agent.id);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    if (error instanceof Error && /UNIQUE constraint failed: tester_test_runs.signature/.test(error.message)) {
      throw new TesterRequestError("This signed report was already uploaded.", 409);
    }
    throw error;
  }
  recordAuditEvent(agent.name, "tester.upload", `Uploaded verified test ${id} for serial ${serial}.`);
  return { id, receivedAt: now, serial, model, signatureVerified: true as const };
}
