import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "devicepassport_session";

type SessionPayload = {
  email: string;
  expiresAt: number;
};

function configuredEmail() {
  return process.env.DEVICEPASSPORT_ADMIN_EMAIL ?? (process.env.NODE_ENV === "production" ? "" : "owner@lapmart.lk");
}

function configuredPassword() {
  return process.env.DEVICEPASSPORT_ADMIN_PASSWORD ?? (process.env.NODE_ENV === "production" ? "" : "devicepass");
}

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
  const expectedEmail = configuredEmail();
  const expectedPassword = configuredPassword();
  if (!expectedEmail || !expectedPassword) return false;
  return safeEqual(email.trim().toLowerCase(), expectedEmail.trim().toLowerCase()) && safeEqual(password, expectedPassword);
}

export function createSessionToken(email: string) {
  const payload: SessionPayload = {
    email: email.trim().toLowerCase(),
    expiresAt: Date.now() + 12 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token?: string | null): SessionPayload | null {
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

export async function getSession() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}
