import { createHmac, timingSafeEqual } from "node:crypto";
import { parse } from "cookie";
import type { Request } from "express";
import { ADMIN_UNLOCK_COOKIE } from "@shared/const";
import { ENV } from "./env";

export const ADMIN_UNLOCK_TTL_MS = 8 * 60 * 60 * 1000;

function signature(payload: string) {
  return createHmac("sha256", `${ENV.cookieSecret}:${ENV.adminPassword}`).update(payload).digest("base64url");
}

export function verifyAdminPassword(password: string) {
  if (!ENV.adminPassword || password.length !== ENV.adminPassword.length) return false;
  const supplied = Buffer.from(password);
  const expected = Buffer.from(ENV.adminPassword);
  return timingSafeEqual(supplied, expected);
}

export function createAdminUnlockToken(userId: number) {
  const expiresAt = Date.now() + ADMIN_UNLOCK_TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${signature(payload)}`;
}

export function isAdminUnlocked(req: Request, userId: number) {
  if (!ENV.adminPassword || !ENV.cookieSecret) return false;
  const token = parse(req.headers.cookie ?? "")[ADMIN_UNLOCK_COOKIE];
  if (!token) return false;

  const [tokenUserId, tokenExpiresAt, tokenSignature] = token.split(".");
  if (!tokenUserId || !tokenExpiresAt || !tokenSignature) return false;
  if (Number(tokenUserId) !== userId || Number(tokenExpiresAt) <= Date.now()) return false;

  const expected = Buffer.from(signature(`${tokenUserId}.${tokenExpiresAt}`));
  const received = Buffer.from(tokenSignature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
