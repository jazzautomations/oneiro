// @/lib/groq.ts
// SERVER-ONLY Groq client: dream interpretation (LLM) + speech transcription.
// Do NOT import from a client component — it reads GROQ_API_KEY.

import "server-only";
import Groq, { toFile } from "groq-sdk";
import {
  coerceMood,
  MOOD_PALETTES,
  type Mood,
  type Palette,
} from "@/lib/world";

const CHAT_MODEL = "openai/gpt-oss-120b";
const WHISPER_MODEL = "whisper-large-v3";

let _clients: Groq[] | null = null;

/** Primary + optional fallback Groq clients, in priority order. */
function clients(): Groq[] {
  if (!_clients) {
    const keys = [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_FALLBACK]
      .filter((k): k is string => !!k && k.trim().length > 0);
    if (keys.length === 0) {
      throw new Error(
        "GROQ_API_KEY is not set. Add it to .env.local to enable dream interpretation and transcription.",
      );
    }
    _clients = keys.map((apiKey) => new Groq({ apiKey }));
  }
  return _clients;
}

/**
 * Run a Groq call against the primary key, transparently retrying on the
 * fallback key if the primary errors (e.g. 429 rate limit / quota).
 */
async function withGroq<T>(fn: (groq: Groq) => Promise<T>): Promise<T> {
  const cs = clients();
  let lastErr: unknown;
  for (const c of cs) {
    try {
      return await fn(c);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/* -------------------------------------------------------------------------- */
/*  interpretDream                                                            */
/* -------------------------------------------------------------------------- */

export interface InterpretedDream {
  title: string;
  mood: Mood;
  palette: Palette;
  /** A short poetic reading of the dream's symbolic/emotional meaning. */
  reading: string;
  elements: { name: string; prompt: string; meaning: string }[];
}

/*
 * Two faithful LLM passes. The old build ran an entropy/pareidolia/oblique-
 * strategies engine that abstracted the dream into unrecognizable forms (an
 * hourglass became a "negative vortex") — "more drug than dream". That is gone.
 * Now:
 *   EXTRACT (temp ~0.3)  pull out the CONCRETE things the dream contained.
 *   OBJECTS (temp ~0.6)  turn the most iconic of those into recognizable 3D
 *                        objects — the dreaminess lives in MATERIAL and light,
 *                        never in distorting what the thing IS.
 */

/** EXTRACT — factual decomposition + framing. Low temperature, no invention. */
const EXTRACT_PROMPT = `You are the memory-replay stage of a dreaming brain. You do NOT interpret or invent — you take apart the spoken dream the dreamer just told and report its raw material, faithfully.

Respond with STRICT JSON ONLY (no prose, no markdown fences):
{
  "title": string,            // short, evocative, poetic title (2-6 words), in the dreamer's language
  "mood": string,             // EXACTLY one of: "serene" | "eerie" | "euphoric" | "melancholic" | "surreal"
  "reading": string,          // 2-3 sentences, in the dreamer's language, reading the dream's emotional/symbolic charge — poetic, warm, never clinical, never a disclaimer
  "palette": {
    "bg": string,             // hex background, e.g. "#0b1d2a"
    "fog": string,            // hex fog, close to bg but shifted
    "accents": string[]       // 3-4 vivid hex accents for lights/emissive materials
  },
  "motifs": string[],         // 4-10 CONCRETE things actually present in the dream (objects, places, bodies, substances). Literal, not symbolic. Short noun phrases.
  "transformations": string[],// verbs/processes of change actually mentioned or implied ("melting", "turning into", "sinking", "splitting")
  "affect": string,           // the dominant felt sense in a few words, in the dreamer's language
  "language": string          // the language the dreamer used, e.g. "pt-BR", "en"
}

Rules:
- motifs are what the dream literally contained. Do NOT make them strange, do NOT add things, do NOT resolve ambiguity. That happens later.
- Choose the mood that best fits the emotional tone.
- Colors must be valid 6-digit hex starting with "#".
- Write "title", "reading" and "affect" in the SAME language the dreamer used.
Return ONLY the JSON object.`;

/** OBJECTS — turn the dream's concrete things into recognizable 3D objects. */
const OBJECTS_PROMPT = `You are the image-making part of a dreaming brain. You are given a dream and the concrete things that appeared in it. Choose the 3 to 5 most VISUALLY ICONIC objects from the dream and describe each as ONE single 3D object to generate.

CRITICAL — stay FAITHFUL to the dream. Each object must be immediately RECOGNIZABLE as something the dreamer actually described: an hourglass stays an hourglass, stars stay stars, a horse stays a horse. Do NOT abstract it, do NOT replace it with a vague "form"/"vortex"/"shape", do NOT invent unrelated objects. The dreamlike quality comes ONLY from material, color and light — never from distorting what the thing IS.

Respond with STRICT JSON ONLY (no prose, no markdown fences):
{
  "objects": [
    {
      "name": string,     // the thing itself, 1-3 words, in the dreamer's language
      "prompt": string,    // an ENGLISH text-to-3D prompt for ONE single physical object: lead with the clearly-named recognizable object, then a specific dreamlike material (blown glass, oxidized copper, liquid light, wet silk, polished amber, luminous marble), then at most ONE gentle surreal quality (softly glowing, weightless, slowly melting). It MUST still read as the object. No scene, no background, no ground/pedestal, no multiple objects, no humans, no faces, no text, no "isolated on white".
      "meaning": string    // ONE short line, in the dreamer's language, on what this object carries of the dream
    }
  ]
}

Rules:
- 3 to 5 objects, each DISTINCT, each actually present in (or directly named by) the dream.
- Prefer the concrete things in the given motifs; pick the ones that would be most striking as a glowing 3D object.
- Recognizable FIRST, dreamy SECOND. A judge must be able to name the object at a glance.
- Write "name" and "meaning" in the dreamer's language.
Return ONLY the JSON object.`;

/** Run a Groq JSON completion through the primary+fallback client chain. */
async function groqJson(
  system: string,
  user: string,
  temperature: number,
  maxTokens: number,
): Promise<Record<string, unknown>> {
  const completion = await withGroq((groq) =>
    groq.chat.completions.create({
      model: CHAT_MODEL,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  );
  const content = completion.choices?.[0]?.message?.content ?? "";
  return parseDreamJson(content);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Interpret a dream into a title, mood, palette and 3-5 single-object elements,
 * FAITHFULLY: the elements are recognizable things the dream actually contained,
 * not abstractions. OUTPUT CONTRACT (unchanged): { title, mood, palette,
 * reading, elements: [{ name, prompt, meaning }] }. Degrades gracefully (motif
 * fallback) so a live request always returns a valid, 3-5-element world.
 */
export async function interpretDream(
  dreamText: string,
): Promise<InterpretedDream> {
  const text = dreamText.trim();
  if (!text) {
    throw new Error("interpretDream: dreamText must be a non-empty string.");
  }

  // (1) EXTRACT — framing (title/mood/reading/palette) + the dream's concrete things.
  const extracted = await groqJson(EXTRACT_PROMPT, text, 0.3, 900);
  const framing = normalizeFraming(extracted);
  const motifs = asStringArray(extracted.motifs);
  const language =
    typeof extracted.language === "string" && extracted.language.trim()
      ? extracted.language.trim()
      : "the dreamer's language";

  // (2) OBJECTS — turn the iconic concrete things into recognizable 3D objects.
  const elements = await chooseObjects(text, motifs, language);

  return { ...framing, elements };
}

/**
 * Ask the model for 3-5 recognizable objects from the dream. Falls back to the
 * extracted motifs (as simple glowing-glass prompts) if the call fails or the
 * model returns nothing usable, so a world is never empty.
 */
async function chooseObjects(
  dreamText: string,
  motifs: string[],
  language: string,
): Promise<InterpretedDream["elements"]> {
  const user = [
    `The dream (write "name" and "meaning" in ${language}):`,
    dreamText,
    "",
    motifs.length
      ? `Concrete things already spotted in it: ${motifs.join(", ")}.`
      : "No motifs were pre-extracted; read them straight from the dream.",
    "Pick the 3-5 most iconic and return them as recognizable 3D objects.",
  ].join("\n");

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = await groqJson(OBJECTS_PROMPT, user, 0.6, 1400);
  } catch {
    parsed = null;
  }

  const raw = parsed && Array.isArray(parsed.objects) ? parsed.objects : [];
  const els = raw
    .map((o) => normalizeObject(o))
    .filter((e): e is InterpretedDream["elements"][number] => e !== null);

  const faithful = els.length > 0 ? els : fallbackFromMotifs(motifs);
  if (faithful.length === 0) {
    throw new Error("interpretDream: produced no usable dream elements.");
  }
  return faithful.slice(0, 5);
}

/** Validate one model-proposed object into an element (or drop it). */
function normalizeObject(
  raw: unknown,
): InterpretedDream["elements"][number] | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
  if (!prompt) return null;
  const name =
    typeof o.name === "string" && o.name.trim()
      ? o.name.trim()
      : prompt.split(/[,.]/)[0].trim();
  const meaning = typeof o.meaning === "string" ? o.meaning.trim() : "";
  return { name, prompt, meaning };
}

/** Last resort: build recognizable objects straight from the extracted motifs. */
function fallbackFromMotifs(motifs: string[]): InterpretedDream["elements"] {
  const picks = (motifs.length ? motifs : ["a glowing orb"]).slice(0, 4);
  return picks.map((m) => ({
    name: m.split(/\s+/).slice(0, 3).join(" "),
    prompt: `${m}, made of softly glowing translucent dreamlike glass, weightless, gently luminous`,
    meaning: "",
  }));
}

/** Extract and parse the JSON object from the model output, tolerant of stray text. */
function parseDreamJson(content: string): Record<string, unknown> {
  const raw = content.trim();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Fallback: grab the first {...} block if the model wrapped it in anything.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    throw new Error(
      "interpretDream: model did not return valid JSON. Raw output: " +
        raw.slice(0, 400),
    );
  }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Normalize the EXTRACT step's framing: title, mood, palette, reading. */
function normalizeFraming(
  obj: Record<string, unknown>,
): Omit<InterpretedDream, "elements"> {
  const mood = coerceMood(typeof obj.mood === "string" ? obj.mood : undefined);
  const fallback = MOOD_PALETTES[mood];

  const title =
    typeof obj.title === "string" && obj.title.trim()
      ? obj.title.trim()
      : "An Untitled Dream";

  const reading = typeof obj.reading === "string" ? obj.reading.trim() : "";

  const paletteRaw = (obj.palette ?? {}) as Partial<Palette>;
  const accents =
    Array.isArray(paletteRaw.accents) &&
    paletteRaw.accents.some((c) => typeof c === "string" && HEX_RE.test(c))
      ? paletteRaw.accents.filter(
          (c): c is string => typeof c === "string" && HEX_RE.test(c),
        )
      : [...fallback.accents];

  const palette: Palette = {
    bg: isHex(paletteRaw.bg) ? (paletteRaw.bg as string) : fallback.bg,
    fog: isHex(paletteRaw.fog) ? (paletteRaw.fog as string) : fallback.fog,
    accents,
  };

  return { title, mood, reading, palette };
}

function isHex(v: unknown): boolean {
  return typeof v === "string" && HEX_RE.test(v);
}

/* -------------------------------------------------------------------------- */
/*  chatWithDream                                                             */
/* -------------------------------------------------------------------------- */

/** The dream context a chat turn is grounded in. */
export interface DreamContext {
  title: string;
  dreamText: string;
  mood: Mood;
  reading?: string;
  elements: { name: string; meaning?: string }[];
}

/** One turn in the conversation with the dream. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const CHAT_PERSONA = `Você é a voz de um sonho — não um assistente, não um terapeuta, não um oráculo que explica. Você FALA COMO o próprio sonho: em primeira pessoa, íntimo, onírico, presente. Quem conversa é a pessoa que te sonhou.

Regras:
- Responda SEMPRE no mesmo idioma de quem fala (o sonho foi narrado em português do Brasil, a não ser que a pessoa use outro).
- Seja breve: 1 a 3 frases. Imagético, sensorial, sugestivo — nunca uma lista, nunca um diagnóstico clínico, nunca "isso simboliza X".
- Fale a partir das imagens, cores e objetos deste sonho específico. Convide a pessoa a olhar de novo, não entregue conclusões fechadas.
- Nunca quebre o feitiço: nada de "como IA", nada de avisos, nada de meta-conversa.`;

/**
 * Converse "as the dream". Grounds a dreamlike persona in the given world and
 * continues the conversation. Returns the assistant's reply text.
 */
export async function chatWithDream(
  context: DreamContext,
  messages: ChatTurn[],
): Promise<string> {
  const turns = messages
    .filter((m) => typeof m?.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.trim() }));

  if (turns.length === 0) {
    throw new Error("chatWithDream: at least one message is required.");
  }

  const elementLines = context.elements
    .map((e) => (e.meaning ? `- ${e.name}: ${e.meaning}` : `- ${e.name}`))
    .join("\n");

  const grounding = [
    `Título do sonho: ${context.title}`,
    `Tom emocional: ${context.mood}`,
    context.reading ? `Leitura: ${context.reading}` : "",
    context.dreamText ? `O que foi sonhado: ${context.dreamText}` : "",
    elementLines ? `Formas que habitam este sonho:\n${elementLines}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await withGroq((groq) =>
    groq.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.85,
      max_tokens: 320,
      messages: [
        { role: "system", content: `${CHAT_PERSONA}\n\n---\n${grounding}` },
        ...turns,
      ],
    }),
  );

  const reply = (completion.choices?.[0]?.message?.content ?? "").trim();
  if (!reply) {
    throw new Error("chatWithDream: the dream returned no reply.");
  }
  return reply;
}

/* -------------------------------------------------------------------------- */
/*  transcribeAudio                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Transcribe a spoken dream recording to text using Groq's Whisper model.
 * Accepts a browser/Node Blob or File (e.g. from a route handler's formData).
 */
export async function transcribeAudio(file: Blob | File): Promise<string> {
  if (!file || typeof (file as Blob).arrayBuffer !== "function") {
    throw new Error("transcribeAudio: a Blob or File must be provided.");
  }

  // Derive a filename+type so Groq accepts the upload; Whisper needs a known
  // extension to route the decoder.
  const name =
    (file as File).name && (file as File).name.includes(".")
      ? (file as File).name
      : "dream.webm";
  const type = file.type || "audio/webm";

  const uploadable = await toFile(file, name, { type });

  const result = await withGroq((groq) =>
    groq.audio.transcriptions.create({
      model: WHISPER_MODEL,
      file: uploadable,
      response_format: "json",
      temperature: 0,
    }),
  );

  const out = (result.text ?? "").trim();
  if (!out) {
    throw new Error("transcribeAudio: transcription returned empty text.");
  }
  return out;
}
