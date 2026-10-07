// @/app/api/chat/route.ts
// POST { context, messages } -> { reply } — "conversar com o sonho".
// The dream speaks in first person, grounded in its own title/text/mood/reading
// and the forms that inhabit it. Server-only; never exposes GROQ_API_KEY.

import {
  chatWithDream,
  type ChatTurn,
  type DreamContext,
} from "@/lib/groq";
import { coerceMood } from "@/lib/world";

export const runtime = "nodejs";
// Calls an LLM at request time; never cache.
export const dynamic = "force-dynamic";

function normalizeContext(value: unknown): DreamContext | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  const elements = Array.isArray(c.elements)
    ? c.elements
        .map((e) => {
          const el = (e ?? {}) as Record<string, unknown>;
          const name = typeof el.name === "string" ? el.name : "";
          const meaning = typeof el.meaning === "string" ? el.meaning : undefined;
          return { name, meaning };
        })
        .filter((e) => e.name)
    : [];
  return {
    title: typeof c.title === "string" ? c.title : "um sonho",
    dreamText: typeof c.dreamText === "string" ? c.dreamText : "",
    mood: coerceMood(typeof c.mood === "string" ? c.mood : undefined),
    reading: typeof c.reading === "string" ? c.reading : undefined,
    elements,
  };
}

function normalizeMessages(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((m) => {
      const t = (m ?? {}) as Record<string, unknown>;
      const role = t.role === "assistant" ? "assistant" : "user";
      const content = typeof t.content === "string" ? t.content : "";
      return { role, content } as ChatTurn;
    })
    .filter((m) => m.content.trim());
}

export async function POST(request: Request): Promise<Response> {
  let context: DreamContext | null;
  let messages: ChatTurn[];

  try {
    const body = (await request.json()) as Record<string, unknown>;
    context = normalizeContext(body?.context);
    messages = normalizeMessages(body?.messages);
  } catch {
    return Response.json(
      { error: "Corpo inválido. Esperado { context, messages }." },
      { status: 400 },
    );
  }

  if (!context) {
    return Response.json(
      { error: "context é obrigatório." },
      { status: 400 },
    );
  }
  if (messages.length === 0) {
    return Response.json(
      { error: "messages precisa conter ao menos uma fala." },
      { status: 400 },
    );
  }

  try {
    const reply = await chatWithDream(context, messages);
    return Response.json({ reply }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "O sonho ficou em silêncio.";
    return Response.json({ error: message }, { status: 500 });
  }
}
