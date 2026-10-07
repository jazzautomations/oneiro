// @/app/api/regenerate/route.ts
// POST { elementPrompt? | dreamContext?, elementId?, name?, stranger? }
//   -> METER one object edit (1 credit) via lib/ledger + lib/identity, 402 when
//      the visitor has neither their free action nor a credit left
//   -> kick off ONE Tripo text_to_model task (reuse lib/tripo)
//   -> return { taskId, name, remaining } — the client polls existing /api/status
//
// This is the single-object sibling of /api/dream: same Tripo contract, same
// negative prompt, but gated by the credit ledger so each regeneration is
// metered (COGS ~$0.30-0.50/object). Server-only — tripo reads TRIPO_API_KEY,
// identity signs the cookie, ledger touches sqlite.

import { createTextTo3D } from "@/lib/tripo";
import { ensureVisitorId } from "@/lib/identity";
import { CREDITS_PER_OBJECT_EDIT } from "@/lib/pricing";

export const runtime = "nodejs";
// Kicks off remote generation + mutates the ledger at request time; never cache.
export const dynamic = "force-dynamic";

// Same anti-"showroom product" nudge the batch route uses, so a regenerated
// object matches the rest of the dream's deliberately-strange grammar.
const NEGATIVE_PROMPT =
  "generic, boring, plain, smooth, pedestal, showroom, product render, low-detail, symmetrical";

// "make it stranger" — push the same object further into dream logic without
// losing what it is. Client-driven via the `stranger` flag.
function strangen(prompt: string): string {
  return `${prompt}, but stranger and more dreamlike — impossible geometry, uncanny proportions, melting and recombined forms, liminal and unsettling`;
}

export async function POST(request: Request): Promise<Response> {
  let elementPrompt = "";
  let dreamContext = "";
  let name = "";
  let stranger = false;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body && typeof body === "object") {
      if (typeof body.elementPrompt === "string") elementPrompt = body.elementPrompt.trim();
      if (typeof body.dreamContext === "string") dreamContext = body.dreamContext.trim();
      if (typeof body.name === "string") name = body.name.trim();
      stranger = body.stranger === true;
    }
  } catch {
    return Response.json(
      { error: "Invalid JSON body. Expected { elementPrompt | dreamContext }." },
      { status: 400 },
    );
  }

  // elementId alone is not resolvable server-side (no world store keyed by it) —
  // the client always carries the prompt (or the surrounding dream context).
  let prompt = elementPrompt || dreamContext;
  if (!prompt) {
    return Response.json(
      { error: "elementPrompt (or dreamContext) is required and must be a non-empty string." },
      { status: 400 },
    );
  }
  if (stranger) prompt = strangen(prompt);

  // ---- Metering gate ------------------------------------------------------
  // Imported at request time, not module load: the ledger pulls in bun:sqlite,
  // which only resolves under Bun (the runtime host) — never in next build's
  // Node page-data workers. A static import would break the build.
  const { tryConsume, creditsFor, grantCredits } = await import("@/lib/ledger");
  const visitor = ensureVisitorId(request);
  const withCookie = (res: Response): Response => {
    if (visitor.isNew) res.headers.set("Set-Cookie", visitor.setCookie);
    return res;
  };

  const before = creditsFor(visitor.id);
  const consume = tryConsume(visitor.id, CREDITS_PER_OBJECT_EDIT);
  if (!consume.ok) {
    return withCookie(
      Response.json(
        { error: "payment required", remaining: consume.remaining },
        { status: 402 },
      ),
    );
  }
  // A real credit was spent only if the balance dropped (the free action, when
  // it is still available, consumes 0 credits). We refund only what we charged.
  const spentCredit = consume.remaining < before;

  // ---- Generation ---------------------------------------------------------
  let taskId: string;
  try {
    taskId = await createTextTo3D(prompt, { negativePrompt: NEGATIVE_PROMPT });
  } catch (err) {
    // The remote start failed — give the credit back so a failed regeneration
    // is never charged. (Nothing to undo when the free action was used.)
    if (spentCredit) grantCredits(visitor.id, CREDITS_PER_OBJECT_EDIT);
    const message =
      err instanceof Error ? err.message : "Failed to start regeneration.";
    return withCookie(Response.json({ error: message }, { status: 502 }));
  }

  return withCookie(
    Response.json(
      { taskId, name: name || prompt, remaining: consume.remaining },
      { status: 200 },
    ),
  );
}
