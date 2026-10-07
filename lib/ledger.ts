// @/lib/ledger.ts
// SERVER-ONLY credit ledger, backed by a JSON file on disk.
//
// Runtime-agnostic on purpose: `next start` runs the server workers under NODE
// (even when launched via `bun run start`), where `bun:sqlite` cannot resolve.
// A plain fs/JSON store works identically under Node and Bun, needs no native
// build and no runtime flags. It is single-process read-modify-write — fine for
// launch volume; move to Postgres when concurrency/scale demands it.
//
// Billing model (see lib/pricing.ts): 1 credit = 1 world OR 1 single-object
// edit. The FIRST metered action per visitor is free (the viral hook), tracked
// by the `free_used` flag. Email is linked at Stripe checkout so a webhook can
// grant credits to the buyer by email.
//
// EVERY fs call is wrapped in try/catch. If the store is unavailable we fail
// SAFE: reads return empty, consumption is DENIED (never silently allow a paid
// action), grants report failure. Nothing here throws.

import "server-only";
import fs from "node:fs";
import path from "node:path";

export interface Visitor {
  id: string;
  email: string | null;
  credits: number;
  free_used: number; // 0 | 1
  created_at: number; // ms since epoch
}

export interface ConsumeResult {
  ok: boolean;
  remaining: number;
  /** True when this consume spent the (capped) free world, not credits. */
  usedFree?: boolean;
}

type Store = Record<string, Visitor>;

/* -------------------------------------------------------------------------- */
/*  JSON file store (lazy singleton)                                          */
/* -------------------------------------------------------------------------- */

let _store: Store | null = null;
let _failed = false;

function dataDir(): string {
  return process.env.ONEIRO_DATA_DIR || path.join(process.cwd(), ".data");
}
function filePath(): string {
  return path.join(dataDir(), "ledger.json");
}

/** Load (once) the store from disk. Returns null if unavailable (fail safe). */
function load(): Store | null {
  if (_store) return _store;
  if (_failed) return null;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const p = filePath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      _store = raw.trim() ? (JSON.parse(raw) as Store) : {};
    } else {
      _store = {};
    }
    return _store;
  } catch (err) {
    console.error("[ledger] load failed; failing safe:", err);
    _failed = true;
    return null;
  }
}

/** Persist the store atomically (temp file + rename). Returns false on failure. */
function persist(store: Store): boolean {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const tmp = filePath() + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, filePath());
    return true;
  } catch (err) {
    console.error("[ledger] persist failed:", err);
    _store = null; // force a reload next time rather than trust stale memory
    return false;
  }
}

function freshVisitor(id: string): Visitor {
  return { id, email: null, credits: 0, free_used: 0, created_at: Date.now() };
}

/* -------------------------------------------------------------------------- */
/*  Reads                                                                     */
/* -------------------------------------------------------------------------- */

/** Fetch-or-insert a visitor. Returns a safe default if the store is down. */
export function getOrCreate(id: string): Visitor {
  const store = load();
  if (!store) return freshVisitor(id);
  try {
    const existing = store[id];
    if (existing) return existing;
    const v = freshVisitor(id);
    store[id] = v;
    persist(store);
    return v;
  } catch (err) {
    console.error("[ledger] getOrCreate failed:", err);
    return freshVisitor(id);
  }
}

/** Current credit balance (0 if unknown or store down). */
export function creditsFor(id: string): number {
  const store = load();
  if (!store) return 0;
  return store[id]?.credits ?? 0;
}

/* -------------------------------------------------------------------------- */
/*  Writes                                                                    */
/* -------------------------------------------------------------------------- */

/** Add `n` credits to a visitor id; falls back to treating it as an email. */
export function grantCredits(idOrEmail: string, n: number): boolean {
  if (!Number.isFinite(n) || n <= 0) return false;
  const store = load();
  if (!store) return false;
  try {
    const v = store[idOrEmail];
    if (v) {
      v.credits += n;
      return persist(store);
    }
    return grantByEmail(idOrEmail, n);
  } catch (err) {
    console.error("[ledger] grantCredits failed:", err);
    return false;
  }
}

/**
 * Grant `n` credits to the visitor(s) with this email (Stripe webhook). If no
 * visitor has linked the email yet, credits are parked on a placeholder row
 * `email:<email>` so the purchase is never lost; linkEmail folds it in later.
 */
export function grantByEmail(email: string, n: number): boolean {
  if (!email || !Number.isFinite(n) || n <= 0) return false;
  const store = load();
  if (!store) return false;
  try {
    let matched = false;
    for (const v of Object.values(store)) {
      if (v.email === email) {
        v.credits += n;
        matched = true;
      }
    }
    if (!matched) {
      const placeholderId = `email:${email}`;
      const ph = store[placeholderId] ?? { ...freshVisitor(placeholderId), email };
      ph.credits += n;
      store[placeholderId] = ph;
    }
    return persist(store);
  } catch (err) {
    console.error("[ledger] grantByEmail failed:", err);
    return false;
  }
}

/** Link an email to a visitor id, absorbing any credits parked on its placeholder. */
export function linkEmail(id: string, email: string): boolean {
  if (!id || !email) return false;
  const store = load();
  if (!store) return false;
  try {
    const v = store[id] ?? freshVisitor(id);
    store[id] = v;
    const placeholderId = `email:${email}`;
    const parked = store[placeholderId];
    if (parked) {
      v.credits += parked.credits;
      delete store[placeholderId];
    }
    v.email = email;
    return persist(store);
  } catch (err) {
    console.error("[ledger] linkEmail failed:", err);
    return false;
  }
}

/**
 * Atomically try to consume `n` credits. Allowed when EITHER the free action is
 * unused (first world free — marks free_used=1, consumes no credits) OR the
 * balance covers `n` (decrements). Denied otherwise, and denied (never silently
 * allowed) when the store is unavailable.
 */
export function tryConsume(
  id: string,
  n: number,
  freeAllowed = true,
): ConsumeResult {
  if (!Number.isFinite(n) || n <= 0) return { ok: false, remaining: 0 };
  const store = load();
  if (!store) return { ok: false, remaining: 0 };
  try {
    const v = store[id] ?? freshVisitor(id);
    store[id] = v;

    if (v.free_used === 0 && freeAllowed) {
      v.free_used = 1;
      return persist(store)
        ? { ok: true, remaining: v.credits, usedFree: true }
        : { ok: false, remaining: v.credits };
    }
    if (v.credits >= n) {
      v.credits -= n;
      return persist(store)
        ? { ok: true, remaining: v.credits }
        : { ok: false, remaining: v.credits + n };
    }
    return { ok: false, remaining: v.credits };
  } catch (err) {
    console.error("[ledger] tryConsume failed:", err);
    return { ok: false, remaining: 0 };
  }
}
