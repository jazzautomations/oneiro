// @/app/api/dream/route.ts
// POST { elements: [{ name, prompt }] } -> kick off one Tripo text-to-3D task
// per element and return { tasks: [{ name, taskId }] }. The actual generation
// is async on Tripo's side; the client polls /api/status with these task ids.
//
// Server-only: createTextTo3D reads TRIPO_API_KEY. Partial failures (one bad
// element) must not sink the whole batch — failed elements come back with an
// error and an empty taskId so the client can surface them individually.

import { createTextTo3D } from "@/lib/tripo";
import { ensureVisitorId } from "@/lib/identity";
import { CREDITS_PER_WORLD } from "@/lib/pricing";

export const runtime = "nodejs";
// Kicks off remote generation at request time; never cache.
export const dynamic = "force-dynamic";

// Pushes Tripo away from the generic "showroom product" attractor that cleans
// our deliberately-strange prompts back into a tidy pedestal object. (No seed
// param — the Tripo v2.5 text_to_model seed field is unconfirmed.)
const NEGATIVE_PROMPT =
  "generic, boring, plain, smooth, pedestal, showroom, product render, low-detail, symmetrical";

interface ElementInput {
  name: string;
  prompt: string;
}

interface TaskResult {
  name: string;
  taskId: string;
  error?: string;
}

function parseElements(value: unknown): ElementInput[] | null {
  if (!Array.isArray(value)) return null;
  const out: ElementInput[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const { name, prompt } = raw as Record<string, unknown>;
    if (typeof name !== "string" || typeof prompt !== "string") return null;
    if (!prompt.trim()) return null;
    out.push({ name: name.trim() || prompt.trim(), prompt: prompt.trim() });
  }
  return out;
}

export async function POST(request: Request): Promise<Response> {
  let elements: ElementInput[] | null;

  try {
    const body = (await request.json()) as unknown;
    const raw =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).elements
        : undefined;
    elements = parseElements(raw);
  } catch {
    return Response.json(
      { error: "Invalid JSON body. Expected { elements: [{ name, prompt }] }." },
      { status: 400 },
    );
  }

  if (!elements) {
    return Response.json(
      {
        error:
          "elements is required and must be an array of { name, prompt } with non-empty prompts.",
      },
      { status: 400 },
    );
  }

  if (elements.length === 0) {
    return Response.json({ tasks: [] as TaskResult[] }, { status: 200 });
  }

  // Meter BEFORE kicking off any Tripo task — each task is real money (COGS).
  // One world costs one credit; the first world per visitor is free (the viral
  // hook, tracked in the ledger). A denied visitor gets 402 and we create NO
  // tasks. Minting the cookie here means a brand-new visitor's first world is
  // free even without a prior /api/me call.
  const { id: visitorId, isNew, setCookie } = ensureVisitorId(request);
  // Imported at request time, not module load: the ledger pulls in bun:sqlite,
  // which only resolves under Bun (the runtime host) — never in next build's
  // Node page-data workers. A static import would break the build.
  const { tryConsume } = await import("@/lib/ledger");
  const consumed = tryConsume(visitorId, CREDITS_PER_WORLD);
  if (!consumed.ok) {
    const denied = Response.json({ error: "out_of_credits" }, { status: 402 });
    if (isNew) denied.headers.set("Set-Cookie", setCookie);
    return denied;
  }

  // Fire all creations in parallel; a single failure never fails the batch.
  const settled = await Promise.allSettled(
    elements.map((el) =>
      createTextTo3D(el.prompt, { negativePrompt: NEGATIVE_PROMPT }),
    ),
  );

  const tasks: TaskResult[] = settled.map((result, i) => {
    const name = elements![i].name;
    if (result.status === "fulfilled") {
      return { name, taskId: result.value };
    }
    const reason = result.reason;
    const message =
      reason instanceof Error ? reason.message : "Failed to start generation.";
    return { name, taskId: "", error: message };
  });

  const res = Response.json({ tasks }, { status: 200 });
  if (isNew) res.headers.set("Set-Cookie", setCookie);
  return res;
}
