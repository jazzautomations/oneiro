// @/lib/identity.ts
// SERVER-ONLY lightweight visitor identity. No password auth in v1: every
// visitor carries a signed, httpOnly cookie "oneiro_vid" holding an anonymous
// id. The signature (HMAC-SHA256, node:crypto) makes the id unforgeable so a
// client cannot mint credits onto someone else's ledger. Email is captured
// later at Stripe checkout and linked in the ledger — this stays swappable for
// real auth without changing the cookie contract.

import "server-only";
import crypto from "node:crypto";

export const COOKIE_NAME = "oneiro_vid";

// One year. Long enough that credits persist for a returning visitor.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * HMAC secret. In production ONEIRO_SECRET MUST be set; the dev fallback only
 * keeps local builds working and gives no real security there.
 */
function secret(): string {
  return process.env.ONEIRO_SECRET || "oneiro-dev-insecure-secret-change-me";
}

/** Base64url without padding — safe inside a cookie value. */
function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(id: string): string {
  return b64url(crypto.createHmac("sha256", secret()).update(id).digest());
}

/** Mint a fresh anonymous visitor id (opaque, URL/cookie-safe). */
export function mintVisitorId(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** Encode an id into the signed cookie value `<id>.<sig>`. */
export function encodeVisitorToken(id: string): string {
  return `${id}.${sign(id)}`;
}

/**
 * Verify a signed cookie value and return the id, or null if the value is
 * missing, malformed or the signature does not match. Uses a timing-safe
 * comparison.
 */
export function decodeVisitorToken(value: string | undefined | null): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(id);
  if (sig.length !== expected.length) return null;
  try {
    const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    return ok ? id : null;
  } catch {
    return null;
  }
}

/** Anything we can read a cookie header out of. */
type CookieSource =
  | string // a raw Cookie header
  | { headers: { get(name: string): string | null } } // Request / NextRequest
  | { get(name: string): { value: string } | undefined } // next/headers cookies()
  | null
  | undefined;

/** Pull the raw oneiro_vid cookie value out of any supported source. */
function readRawCookie(source: CookieSource): string | null {
  if (!source) return null;

  // next/headers cookie store: has .get(name) -> { value }
  if (typeof source === "object" && "get" in source && typeof source.get === "function") {
    try {
      const entry = (source as { get(name: string): { value: string } | undefined }).get(
        COOKIE_NAME,
      );
      if (entry && typeof entry.value === "string") return entry.value;
    } catch {
      /* fall through to header parsing */
    }
  }

  let header: string | null = null;
  if (typeof source === "string") {
    header = source;
  } else if (
    typeof source === "object" &&
    "headers" in source &&
    source.headers &&
    typeof source.headers.get === "function"
  ) {
    header = source.headers.get("cookie");
  }
  if (!header) return null;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === COOKIE_NAME) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/**
 * Read and verify the visitor id from a Request, a raw Cookie header string or
 * a next/headers cookie store. Returns null when there is no valid cookie.
 */
export function getVisitorId(source: CookieSource): string | null {
  return decodeVisitorToken(readRawCookie(source));
}

/**
 * Serialize the Set-Cookie header value for a visitor id. httpOnly + SameSite
 * so it rides along with navigations and same-site fetches; Secure only in
 * production (Secure cookies are dropped over plain-http dev).
 */
export function serializeVisitorCookie(id: string): string {
  const parts = [
    `${COOKIE_NAME}=${encodeVisitorToken(id)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/**
 * Resolve the visitor for a request: reuse a valid cookie, or mint a new id.
 * When `isNew` (or the caller always wants it), attach `setCookie` to the
 * response via `headers.set("Set-Cookie", result.setCookie)`.
 */
export function ensureVisitorId(source: CookieSource): {
  id: string;
  isNew: boolean;
  setCookie: string;
} {
  const existing = getVisitorId(source);
  const id = existing ?? mintVisitorId();
  return { id, isNew: existing === null, setCookie: serializeVisitorCookie(id) };
}

/* -------------------------------------------------------------------------- *
 *  Auth.js bridge (ADDITIVE — the anon-cookie contract above is unchanged).   *
 *  When a signed-in Auth.js session exists we prefer the account as identity  *
 *  and fold the anon cookie's credits into it. With no session (or no auth    *
 *  configured) every function above keeps its exact guest behavior.           *
 * -------------------------------------------------------------------------- */

/** Resolved identity for the current request — account when signed in, else guest. */
export interface ResolvedIdentity {
  /** The ledger key for this request. For a signed-in account it is the anon
   *  cookie id now linked to the email (or `user:<email>` when there was no
   *  cookie); for a guest it is the anon cookie id, or null if none yet. */
  id: string | null;
  /** The account email when signed in, else null. */
  email: string | null;
  /** True only when an Auth.js session identifies this request. */
  authed: boolean;
}

/**
 * Link an email (from an Auth.js sign-in) to a ledger id so the account keeps
 * the anon cookie's credits plus any purchases parked on its email placeholder.
 * Uses the anon cookie id as the stable key when present (so GET /api/me, which
 * reads the same cookie, immediately reflects the linked balance); otherwise a
 * deterministic `user:<email>` key keeps credits across sessions without a
 * cookie. Best-effort: returns the chosen id, and never throws.
 */
export async function linkAccount(
  source: CookieSource,
  email: string,
): Promise<string> {
  const id = getVisitorId(source) ?? `user:${email}`;
  try {
    const { linkEmail } = await import("@/lib/ledger");
    linkEmail(id, email);
  } catch (err) {
    console.error("[identity] linkAccount failed (non-fatal):", err);
  }
  return id;
}

/** Read the current Auth.js session email, or null (unconfigured / guest / error). */
async function sessionEmail(): Promise<string | null> {
  try {
    const { auth } = await import("@/auth");
    const session = await auth();
    return session?.user?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the identity for a request, PREFERRING an Auth.js account over the
 * anon cookie. When signed in it links (idempotently) and returns the account;
 * otherwise it returns the guest's anon cookie id unchanged. Callers that must
 * guarantee a cookie for a brand-new guest still use ensureVisitorId.
 */
export async function getIdentity(source: CookieSource): Promise<ResolvedIdentity> {
  const email = await sessionEmail();
  if (email) {
    const id = await linkAccount(source, email);
    return { id, email, authed: true };
  }
  return { id: getVisitorId(source), email: null, authed: false };
}
