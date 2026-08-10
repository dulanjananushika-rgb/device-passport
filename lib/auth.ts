import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { authenticateStaff, findActiveStaffByEmail, findStaffById } from "./database";
import type { StaffAccount, StaffRole } from "./operations";

export const SESSION_COOKIE = "devicepassport_session";

type SessionPayload = {
  staffId?: string;
  email: string;
  expiresAt: number;
};

export type StaffSession = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  expiresAt: number;
};

function sessionSecret() {
  return process.env.DEVICEPASSPORT_SESSION_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "devicepassport-local-development-secret");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(value: string) {
  const secret = sessionSecret();
  if (!secret) throw new Error("DEVICEPASSPORT_SESSION_SECRET is required in production.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function validateCredentials(email: string, password: string) {
  return authenticateStaff(email, password);
}

export function createSessionToken(staff: StaffAccount) {
  const payload: SessionPayload = {
    staffId: staff.id,
    email: staff.email,
    expiresAt: Date.now() + 12 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.email || payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<StaffSession | null> {
  const cookieStore = await cookies();
  const payload = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const staff = payload.staffId ? findStaffById(payload.staffId) : findActiveStaffByEmail(payload.email);
  if (!staff?.active || staff.email !== payload.email) return null;
  return { id: staff.id, name: staff.name, email: staff.email, role: staff.role, expiresAt: payload.expiresAt };
}
