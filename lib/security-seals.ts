import { randomUUID } from "node:crypto";
import { getDatabase, recordAuditEvent } from "./database";

export type SealStatus = "Intact" | "Broken" | "Replaced" | "Tampered";

export interface DeviceSecuritySeal {
  id: string;
  deviceId: string;
  serial: string;
  sealNumber: string;
  placementLocation: string;
  status: SealStatus;
  appliedBy: string;
  appliedAt: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  notes: string;
}

export interface RegisterSealInput {
  deviceId: string;
  serial: string;
  sealNumber: string;
  placementLocation?: string;
  notes?: string;
}

type SealRow = {
  id: string;
  device_id: string;
  serial: string;
  seal_number: string;
  placement_location: string;
  status: SealStatus;
  applied_by: string;
  applied_at: string;
  verified_by: string | null;
  verified_at: string | null;
  notes: string;
};

function rowToSeal(r: SealRow): DeviceSecuritySeal {
  return {
    id: r.id,
    deviceId: r.device_id,
    serial: r.serial,
    sealNumber: r.seal_number,
    placementLocation: r.placement_location,
    status: r.status,
    appliedBy: r.applied_by,
    appliedAt: r.applied_at,
    verifiedBy: r.verified_by,
    verifiedAt: r.verified_at,
    notes: r.notes || "",
  };
}

export function registerSecuritySeal(input: RegisterSealInput, actor: string): DeviceSecuritySeal {
  const db = getDatabase();
  const id = `seal_${randomUUID().slice(0, 12)}`;
  const sealNumber = input.sealNumber.trim().toUpperCase();
  const location = input.placementLocation?.trim() || "Base Cover Bottom Screw";
  const now = new Date().toISOString();

  if (!sealNumber) throw new Error("Seal number is required.");

  db.prepare(`
    INSERT INTO device_security_seals (
      id, device_id, serial, seal_number, placement_location,
      status, applied_by, applied_at, notes
    ) VALUES (?, ?, ?, ?, ?, 'Intact', ?, ?, ?)
  `).run(id, input.deviceId, input.serial, sealNumber, location, actor, now, input.notes || "");

  recordAuditEvent(actor, "security_seal.applied", `Applied tamper-evident seal ${sealNumber} on ${input.serial} at ${location}.`);
  return getSecuritySeal(sealNumber)!;
}

export function verifySecuritySeal(
  sealNumber: string,
  newStatus: SealStatus,
  actor: string,
  notes = ""
): DeviceSecuritySeal {
  const db = getDatabase();
  const seal = getSecuritySeal(sealNumber);
  if (!seal) throw new Error(`Security seal ${sealNumber} not found.`);

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE device_security_seals
    SET status = ?, verified_by = ?, verified_at = ?, notes = ?
    WHERE seal_number = ?
  `).run(newStatus, actor, now, notes, sealNumber.toUpperCase());

  recordAuditEvent(
    actor,
    "security_seal.verified",
    `Verified seal ${sealNumber} on ${seal.serial}: Status changed from ${seal.status} to ${newStatus}. ${notes}`
  );

  return getSecuritySeal(sealNumber)!;
}

export function getSecuritySeal(sealNumberOrId: string): DeviceSecuritySeal | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT * FROM device_security_seals
    WHERE id = ? OR seal_number = ?
  `).get(sealNumberOrId, sealNumberOrId.toUpperCase()) as SealRow | undefined;

  return row ? rowToSeal(row) : null;
}

export function listDeviceSecuritySeals(deviceIdOrSerial: string): DeviceSecuritySeal[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM device_security_seals
    WHERE device_id = ? OR serial = ?
    ORDER BY applied_at DESC
  `).all(deviceIdOrSerial, deviceIdOrSerial) as unknown as SealRow[];

  return rows.map(rowToSeal);
}

/**
 * Checks whether all registered security seals on a laptop are intact.
 * If any seal is broken or tampered with, hardware warranty claims are automatically flagged/voided.
 */
export function checkWarrantySealIntegrity(serial: string): {
  valid: boolean;
  brokenSeals: DeviceSecuritySeal[];
  intactSeals: DeviceSecuritySeal[];
  message: string;
} {
  const seals = listDeviceSecuritySeals(serial);
  if (seals.length === 0) {
    return {
      valid: true,
      brokenSeals: [],
      intactSeals: [],
      message: "No tamper seals registered for this device.",
    };
  }

  const brokenSeals = seals.filter((s) => s.status === "Broken" || s.status === "Tampered");
  const intactSeals = seals.filter((s) => s.status === "Intact" || s.status === "Replaced");

  if (brokenSeals.length > 0) {
    const sealList = brokenSeals.map((s) => `${s.sealNumber} (${s.placementLocation})`).join(", ");
    return {
      valid: false,
      brokenSeals,
      intactSeals,
      message: `Warranty void: Tamper-evident seal(s) ${sealList} have been broken or altered.`,
    };
  }

  return {
    valid: true,
    brokenSeals: [],
    intactSeals,
    message: `All ${seals.length} security seal(s) are verified intact.`,
  };
}
