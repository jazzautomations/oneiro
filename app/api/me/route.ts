// @/app/api/me/route.ts
// GET -> { credits, freeUsed } for the current visitor.
//
// The visitor is identified by the signed `oneiro_vid` cookie (see
// @/lib/identity). If the caller has no valid cookie yet we mint one here and
// attach it via Set-Cookie, so the id is stable before the first /api/dream
// call. Reads are fail-safe: a down ledger reports 0 credits / freeUsed false.

import { ensureVisitorId } from "@/lib/identity";

export const runtime = "nodejs";
// Per-visitor state read at request time; never cache.
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const { id, isNew, setCookie } = ensureVisitorId(request);
  // Imported at request time, not module load: the ledger pulls in bun:sqlite,
  // which only resolves under Bun (the runtime host) — never in next build's
  // Node page-data workers. A static import would break the build.
  const { getOrCreate } = await import("@/lib/ledger");
  const visitor = getOrCreate(id);

  const res = Response.json(
    { credits: visitor.credits, freeUsed: visitor.free_used === 1 },
    { status: 200 },
  );
  if (isNew) res.headers.set("Set-Cookie", setCookie);
  return res;
}
