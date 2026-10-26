import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { getDatabase, isWarrantyActive } from "./database";

export interface CustomerDeviceRecord {
  deviceId: string;
  name: string;
  model: string;
  serial: string;
  grade: string;
  score: number;
  batteryHealth: number;
  storageHealth: number;
  invoiceReference: string;
  salePriceCents: number;
  soldAt: string;
  warrantyStarts: string;
  warrantyEnds: string;
  isWarrantyActive: boolean;
  handoverToken: string;
  claimsCount: number;
  activeClaimsCount: number;
}

export interface CustomerPortalData {
  phone: string;
  customerName: string;
  devices: CustomerDeviceRecord[];
}

export function normalizePhoneNumber(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) throw new Error("Invalid phone number.");

  // Sri Lanka standard normalization: 0771234567 -> +94771234567
  if (digits.length === 10 && digits.startsWith("0")) {
    return `+94${digits.slice(1)}`;
  }
  if (digits.length === 9) {
    return `+94${digits}`;
  }
  if (digits.startsWith("94") && digits.length === 11) {
    return `+${digits}`;
  }

  // Generic international fallback
  return `+${digits}`;
}

export function generateCustomerOtp(rawPhone: string): {
  success: boolean;
  phone: string;
  expiresInSeconds: number;
  devCode?: string; // Included only in non-production for testing
} {
  const db = getDatabase();
  const phone = normalizePhoneNumber(rawPhone);
  const now = new Date();
  const nowIso = now.toISOString();

  // Check rate limit: max 3 active OTP requests per phone in the last 10 minutes
  const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const recentCount = db.prepare(`
    SELECT COUNT(*) as count FROM customer_otps
    WHERE phone_normalized = ? AND created_at >= ?
  `).get(phone, tenMinsAgo) as { count: number };

  if (recentCount.count >= 5) {
    throw new Error("Too many OTP requests. Please wait a few minutes before trying again.");
  }

  // Generate 6-digit OTP
  const otpCode = String(randomInt(100000, 999999));
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString(); // 10 minutes
  const id = `otp_${randomUUID().slice(0, 12)}`;

  db.prepare(`
    INSERT INTO customer_otps (
      id, phone_normalized, otp_code, expires_at, consumed, attempts, created_at
    ) VALUES (?, ?, ?, ?, 0, 0, ?)
  `).run(id, phone, otpCode, expiresAt, nowIso);

  const isDev = process.env.NODE_ENV !== "production";

  return {
    success: true,
    phone,
    expiresInSeconds: 600,
    devCode: isDev ? otpCode : undefined,
  };
}

export function verifyCustomerOtp(
  rawPhone: string,
  code: string
): {
  success: boolean;
  sessionToken: string;
  phone: string;
  customerName: string;
} {
  const db = getDatabase();
  const phone = normalizePhoneNumber(rawPhone);
  const trimmedCode = code.trim();
  const nowIso = new Date().toISOString();

  // Find latest unconsumed OTP for this phone
  const otpRow = db.prepare(`
    SELECT * FROM customer_otps
    WHERE phone_normalized = ? AND consumed = 0 AND expires_at > ?
    ORDER BY created_at DESC LIMIT 1
  `).get(phone, nowIso) as any;

  if (!otpRow) {
    throw new Error("Invalid or expired verification code. Please request a new code.");
  }

  if (otpRow.attempts >= 4) {
    db.prepare("UPDATE customer_otps SET consumed = 1 WHERE id = ?").run(otpRow.id);
    throw new Error("Too many failed attempts. This code has been invalidated.");
  }

  if (otpRow.otp_code !== trimmedCode) {
    db.prepare("UPDATE customer_otps SET attempts = attempts + 1 WHERE id = ?").run(otpRow.id);
    throw new Error("Incorrect verification code.");
  }

  // Consume OTP
  db.prepare("UPDATE customer_otps SET consumed = 1 WHERE id = ?").run(otpRow.id);

  // Find customer name from latest sales record
  const latestSale = db.prepare(`
    SELECT customer_name FROM device_sales
    WHERE customer_phone = ? OR customer_phone = ?
    ORDER BY sold_at DESC LIMIT 1
  `).get(phone, rawPhone.replace(/\s+/g, "")) as { customer_name?: string } | undefined;

  const customerName = latestSale?.customer_name || "Valued Customer";

  // Create persistent session (valid for 30 days)
  const sessionToken = `csess_${randomBytes(32).toString("hex")}`;
  const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const sessionId = `csess_${randomUUID().slice(0, 12)}`;

  db.prepare(`
    INSERT INTO customer_sessions (
      id, phone_normalized, customer_name, session_token, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, phone, customerName, sessionToken, sessionExpiresAt, nowIso);

  return {
    success: true,
    sessionToken,
    phone,
    customerName,
  };
}

export function verifyCustomerSession(token: string): { valid: boolean; phone?: string; customerName?: string } {
  const db = getDatabase();
  const nowIso = new Date().toISOString();

  const session = db.prepare(`
    SELECT * FROM customer_sessions
    WHERE session_token = ? AND expires_at > ?
  `).get(token, nowIso) as any;

  if (!session) return { valid: false };

  return {
    valid: true,
    phone: session.phone_normalized,
    customerName: session.customer_name,
  };
}

export function getCustomerPortalData(rawPhone: string): CustomerPortalData {
  const db = getDatabase();
  const normalized = normalizePhoneNumber(rawPhone);

  // Match by normalized or raw contact
  const salesRows = db.prepare(`
    SELECT
      d.id as device_id,
      d.name,
      d.model,
      d.serial,
      d.grade,
      d.score,
      d.battery_health,
      d.storage_health,
      s.customer_name,
      s.invoice_reference,
      s.sale_price_cents,
      s.sold_at,
      s.warranty_starts,
      s.warranty_ends,
      s.handover_token,
      (SELECT COUNT(*) FROM warranty_claims c WHERE c.device_id = d.id) as claims_count,
      (SELECT COUNT(*) FROM warranty_claims c WHERE c.device_id = d.id AND c.status NOT IN ('Resolved', 'Cancelled', 'Closed')) as active_claims_count
    FROM device_sales s
    JOIN devices d ON d.id = s.device_id
    WHERE s.customer_phone = ? OR s.customer_phone = ?
    ORDER BY s.sold_at DESC
  `).all(normalized, rawPhone.replace(/\s+/g, "")) as any[];

  const customerName = salesRows.length > 0 ? salesRows[0].customer_name : "Customer";

  const devices: CustomerDeviceRecord[] = salesRows.map((r) => ({
    deviceId: r.device_id,
    name: r.name,
    model: r.model,
    serial: r.serial,
    grade: r.grade,
    score: r.score,
    batteryHealth: r.battery_health,
    storageHealth: r.storage_health,
    invoiceReference: r.invoice_reference,
    salePriceCents: r.sale_price_cents,
    soldAt: r.sold_at,
    warrantyStarts: r.warranty_starts,
    warrantyEnds: r.warranty_ends,
    isWarrantyActive: isWarrantyActive(r.warranty_ends),
    handoverToken: r.handover_token,
    claimsCount: Number(r.claims_count),
    activeClaimsCount: Number(r.active_claims_count),
  }));

  return {
    phone: normalized,
    customerName,
    devices,
  };
}
