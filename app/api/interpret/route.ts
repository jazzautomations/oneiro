// @/app/api/interpret/route.ts
// POST { dreamText } -> interpret the dream into a title, mood, palette, a short
// poetic reading and 3-5 single-object elements (each with a one-line meaning)
// via Groq. The full InterpretedDream is returned as-is, so reading + per-element
// meanings pass straight through. Server-only; never exposes GROQ_API_KEY.

import { interpretDream, type InterpretedDream } from "@/lib/groq";

export const runtime = "nodejs";
// Interpretation calls an LLM at request time; never cache.
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let dreamText: unknown;

  try {
    const body = (await request.json()) as unknown;
    dreamText =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).dreamText
        : undefined;
  } catch {
    return Response.json(
      { error: "Invalid JSON body. Expected { dreamText }." },
      { status: 400 },
    );
  }

  if (typeof dreamText !== "string" || !dreamText.trim()) {
    return Response.json(
      { error: "dreamText is required and must be a non-empty string." },
      { status: 400 },
    );
  }

  try {
    const result: InterpretedDream = await interpretDream(dreamText);
    return Response.json(result, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to interpret dream.";
    return Response.json({ error: message }, { status: 500 });
  }
}
