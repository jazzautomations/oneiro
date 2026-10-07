// @/lib/paddle.ts
// SERVER-ONLY Paddle Billing client. Sandbox vs live is picked by the API key's
// environment (PADDLE_ENV=sandbox|production, default sandbox). Keys are read
// at request time and never logged.

import "server-only";
import crypto from "node:crypto";

export function paddleBase(): string {
  return process.env.PADDLE_ENV === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
}

export async function paddle<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<T> {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error("PADDLE_API_KEY not set");
  const res = await fetch(`${paddleBase()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string; detail?: string } };
  if (!res.ok || !json.data) {
    throw new Error(`Paddle ${method} ${path} -> ${res.status} ${json.error?.code ?? ""} ${json.error?.detail ?? ""}`);
  }
  return json.data;
}

/**
 * Verify a Paddle webhook: header `Paddle-Signature: ts=..;h1=..` where
 * h1 = HMAC-SHA256(secret, `${ts}:${rawBody}`). Rejects stale (>5 min) events.
 */
export function verifyPaddleSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(";").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(h1, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
