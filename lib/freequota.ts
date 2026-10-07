// @/lib/freequota.ts
// SERVER-ONLY. Caps the "first world free" hook so it can't drain Tripo credits:
// a GLOBAL daily budget of free worlds (ONEIRO_FREE_PER_DAY, default 10) and at
// most one free world per IP per day (a cookie alone is trivially reset).
// Stored as a tiny JSON file next to the ledger; fail-closed (no free) on error.

import fs from "node:fs";
import path from "node:path";

interface Quota {
  day: string;
  count: number;
  ips: Record<string, number>;
}

function filePath(): string {
  const dir = process.env.ONEIRO_DATA_DIR || path.join(process.cwd(), ".data");
  return path.join(dir, "free-quota.json");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function cap(): number {
  const n = Number(process.env.ONEIRO_FREE_PER_DAY);
  return Number.isFinite(n) && n >= 0 ? n : 10;
}

function load(): Quota {
  try {
    const q = JSON.parse(fs.readFileSync(filePath(), "utf8")) as Quota;
    if (q.day === today()) return q;
  } catch {
    /* missing or corrupt → fresh day */
  }
  return { day: today(), count: 0, ips: {} };
}

/** First client IP from the proxy chain (Caddy sets X-Forwarded-For). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  return (xff?.split(",")[0] || request.headers.get("x-real-ip") || "unknown").trim();
}

/** Whether a free world is still available today for this IP. */
export function canUseFree(ip: string): boolean {
  try {
    const q = load();
    return q.count < cap() && !q.ips[ip];
  } catch {
    return false;
  }
}

/** Record that this IP just used today's free world. */
export function recordFree(ip: string): void {
  try {
    const q = load();
    q.count += 1;
    q.ips[ip] = (q.ips[ip] ?? 0) + 1;
    const fp = filePath();
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const tmp = `${fp}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(q));
    fs.renameSync(tmp, fp);
  } catch (err) {
    console.error("[freequota] record failed:", err);
  }
}
