// @/lib/world.ts
// Pure TypeScript types + helpers for the Oneiro dream-world model.
// NO React, NO browser APIs, NO Math.random / Date.now at module scope.
// Everything that needs entropy or time accepts it as an input so this
// module is deterministic and safe to import on both server and client.

/* -------------------------------------------------------------------------- */
/*  Core types                                                                */
/* -------------------------------------------------------------------------- */

/** The emotional register of a dream; drives palette, fog and post-fx. */
export type Mood = "serene" | "eerie" | "euphoric" | "melancholic" | "surreal";

/** All known moods, handy for validation and UI. */
export const MOODS: readonly Mood[] = [
  "serene",
  "eerie",
  "euphoric",
  "melancholic",
  "surreal",
] as const;

/** A color scheme for a world. All values are CSS/hex color strings. */
export interface Palette {
  /** Scene background / clear color. */
  bg: string;
  /** Fog color (usually close to bg, slightly shifted). */
  fog: string;
  /** Accent colors for lights, emissive materials, UI highlights. */
  accents: string[];
}

/** A single generated object that lives inside a dream world. */
export interface DreamElement {
  id: string;
  /** Short human-facing label, e.g. "melting clock". */
  name: string;
  /** The text-to-3D prompt used to generate this element. */
  prompt: string;
  /** One-line symbolic meaning of this element (from interpretation). Optional. */
  meaning?: string;
  /** Local/remote URL of the generated GLB. Absent until generation finishes. */
  modelUrl?: string;
  /** World-space position [x, y, z]. */
  position: [number, number, number];
  /** Uniform scale factor. */
  scale: number;
  /** Euler rotation [x, y, z] in radians. */
  rotation: [number, number, number];
  /**
   * Target world-unit size of the model's largest dimension (its "footprint").
   * Lets a skyscraper dwarf a person instead of every GLB normalizing to the
   * same box. Absent = the neutral default (see DreamObject TARGET).
   */
  footprint?: number;
}

/** Rough size classes → world-unit footprint (largest model dimension). */
export const SIZE_FOOTPRINTS = {
  tiny: 1,
  human: 1.8,
  large: 6,
  huge: 13,
} as const;
export type SizeClass = keyof typeof SIZE_FOOTPRINTS;

/** A fully-formed, navigable dream world. */
export interface World {
  id: string;
  /** Short poetic title. */
  title: string;
  /** The original transcribed dream text. */
  dreamText: string;
  /** A short poetic reading of the dream's symbolic/emotional meaning. Optional. */
  reading?: string;
  /**
   * The dream's taboo, stated in one line at the vignette's start
   * ("ela não gosta de ser olhada"). Breaking it — staring at the presence or
   * stepping too close — triggers the climax. Optional; a default applies.
   */
  rule?: string;
  mood: Mood;
  palette: Palette;
  elements: DreamElement[];
  /** Creation timestamp (ms since epoch). Passed in, never read from clock here. */
  createdAt: number;
  /** Optional URL to a narration / ambient audio track. */
  narrationUrl?: string;
}

/** A shareable public link pointing at a world. */
export interface GiftLink {
  id: string;
  worldId: string;
}

/* -------------------------------------------------------------------------- */
/*  Default palettes per mood                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Sensible fallback palettes keyed by mood. The LLM usually supplies its own
 * palette, but these guarantee a coherent look if it does not.
 */
export const MOOD_PALETTES: Record<Mood, Palette> = {
  serene: {
    bg: "#0e0b08",
    fog: "#191410",
    accents: ["#f6dfac", "#e8a24a"],
  },
  eerie: {
    bg: "#0a0807",
    fog: "#13100c",
    accents: ["#c76a3c", "#5c6b8a"],
  },
  euphoric: {
    bg: "#140d07",
    fog: "#231608",
    accents: ["#f58028", "#f6dfac"],
  },
  melancholic: {
    bg: "#0d0b09",
    fog: "#171310",
    accents: ["#8a93a8", "#5c6b8a"],
  },
  surreal: {
    bg: "#110c08",
    fog: "#201408",
    accents: ["#f58028", "#e8a24a", "#f6b24a"],
  },
};

/** Coerce an arbitrary string into a valid Mood, defaulting to "surreal". */
export function coerceMood(value: string | undefined | null): Mood {
  if (value && (MOODS as readonly string[]).includes(value)) {
    return value as Mood;
  }
  return "surreal";
}

/* -------------------------------------------------------------------------- */
/*  StateVector — the continuous successor to Mood                            */
/* -------------------------------------------------------------------------- */

/**
 * A continuous coordinate for "what kind of altered state this is". Mood stays
 * the public enum; StateVector is the richer, orthogonal basis the renderer and
 * the imagination pipeline read. Dream mode keeps every axis disciplined; the
 * same six dials can be pushed far harder by a future trip product without
 * changing this contract.
 *
 * Axes map onto the empirically factor-analysed 5D-ASC:
 *   intensity      imagery richness / event rate / prior-violation budget
 *   formDensity    formless field (0) -> dense resolved form (1)
 *   curvature      Euclidean (0) -> hyperbolic / log-polar (1)
 *   egoDissolution embodied first-person (0) -> detached / dissolved camera (1)
 *   coherence      fragmented, discontinuous (0) -> stable, mandala-like (1)
 *   warmth         cold/dissociative (-1) -> warm/empathic (+1)
 */
export interface StateVector {
  /** 0..1 */
  intensity: number;
  /** 0..1 */
  formDensity: number;
  /** 0..1 */
  curvature: number;
  /** 0..1 */
  egoDissolution: number;
  /** 0..1 */
  coherence: number;
  /** -1..1 */
  warmth: number;
}

/**
 * Default StateVector per mood, so every existing Mood resolves to a point in
 * the space. Values stay inside the disciplined "dream" region of each axis.
 */
export const MOOD_STATES: Record<Mood, StateVector> = {
  serene: {
    intensity: 0.35,
    formDensity: 0.6,
    curvature: 0.05,
    egoDissolution: 0.15,
    coherence: 0.78,
    warmth: 0.55,
  },
  eerie: {
    intensity: 0.5,
    formDensity: 0.5,
    curvature: 0.22,
    egoDissolution: 0.32,
    coherence: 0.32,
    warmth: -0.45,
  },
  euphoric: {
    intensity: 0.82,
    formDensity: 0.8,
    curvature: 0.3,
    egoDissolution: 0.3,
    coherence: 0.62,
    warmth: 0.7,
  },
  melancholic: {
    intensity: 0.3,
    formDensity: 0.42,
    curvature: 0.1,
    egoDissolution: 0.25,
    coherence: 0.45,
    warmth: -0.2,
  },
  surreal: {
    intensity: 0.72,
    formDensity: 0.85,
    curvature: 0.52,
    egoDissolution: 0.42,
    coherence: 0.38,
    warmth: 0.1,
  },
};

/** Map a Mood to its default StateVector. Returns a fresh, mutable copy. */
export function moodToState(mood: Mood): StateVector {
  return { ...MOOD_STATES[mood] };
}

/**
 * Concrete render knobs derived from a StateVector. These are the values the
 * r3f scene / shaders / postfx read directly; nothing downstream needs to know
 * the axes. All outputs are clamped to safe ranges.
 */
export interface SceneParams {
  /** FogExp2 density. */
  fogDensity: number;
  /** Bloom intensity. */
  bloom: number;
  /** Chromatic-aberration offset (r3f postprocessing units). */
  chromaticAberration: number;
  /** Camera idle-drift speed multiplier. */
  cameraDrift: number;
  /** Vertex-warp / mesh-distort amplitude on dream objects. */
  objectWarp: number;
  /** Saturation multiplier (1 = unchanged; disciplined in dream, high in trip). */
  saturation: number;
  /** Log-polar form-constant layer strength (0 = off). */
  formConstant: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Derive concrete render knobs from a StateVector. Pure and deterministic. */
export function deriveSceneParams(state: StateVector): SceneParams {
  const i = clamp(state.intensity, 0, 1);
  const f = clamp(state.formDensity, 0, 1);
  const c = clamp(state.curvature, 0, 1);
  const e = clamp(state.egoDissolution, 0, 1);
  const co = clamp(state.coherence, 0, 1);

  // Form constants only emerge once intensity passes ~0.55, scaled by curvature.
  const formGate = clamp((i - 0.55) / 0.45, 0, 1);

  return {
    // Less coherence + more dissolution -> thicker fog hiding boundaries.
    fogDensity: clamp(0.006 + 0.016 * (1 - co) + 0.006 * e, 0.004, 0.03),
    bloom: clamp(0.2 + 0.5 * i + 0.15 * f, 0, 0.9),
    chromaticAberration: clamp(0.0002 + 0.0012 * i + 0.0006 * c, 0, 0.0025),
    cameraDrift: clamp(0.4 + 1.0 * i + 0.6 * e, 0.2, 2.2),
    objectWarp: clamp(0.06 + 0.5 * i * (0.4 + 0.6 * f), 0, 0.8),
    // Disciplined in dream (low intensity -> ~1); headroom to 1.5 for a trip.
    saturation: clamp(0.9 + 0.5 * i, 0.8, 1.5),
    formConstant: clamp(formGate * (0.3 + 0.7 * c), 0, 1),
  };
}

/* -------------------------------------------------------------------------- */
/*  ID generation (deterministic-ish, no module-scope entropy)                */
/* -------------------------------------------------------------------------- */

// Internal monotonic counter so repeated newId(seed) calls differ even with
// the same seed. This is instance state, not entropy, and is reset-safe.
let _idCounter = 0;

/**
 * FNV-1a 32-bit hash -> unsigned 32-bit integer. Deterministic for a given
 * input. Exported so seedable PRNGs (see lib/entropy.ts) can derive a numeric
 * seed from any string without duplicating the hash.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply via Math.imul to stay in int range.
    hash = Math.imul(hash, 0x01000193);
  }
  // Force unsigned.
  return hash >>> 0;
}

/**
 * FNV-1a 32-bit hash -> base36 string. Deterministic for a given input.
 */
function fnv1a(input: string): string {
  return fnv1a32(input).toString(36);
}

/**
 * Produce a short, URL-safe, deterministic-ish id from a seed.
 * Combines the seed hash with a monotonic counter so successive calls with the
 * same seed never collide within a process. Does NOT use Math.random or
 * Date.now, so it is pure w.r.t. its inputs (modulo the counter).
 */
export function newId(seed: string): string {
  _idCounter = (_idCounter + 1) >>> 0;
  const base = fnv1a(seed);
  const salt = fnv1a(`${seed}:${_idCounter}`);
  return `${base}${salt}`.slice(0, 12);
}

/* -------------------------------------------------------------------------- */
/*  (De)serialization                                                         */
/* -------------------------------------------------------------------------- */

/** Serialize a world to a compact JSON string. */
export function serializeWorld(w: World): string {
  return JSON.stringify(w);
}

/**
 * Parse a serialized world back into a typed World, normalizing/validating
 * the shape so a malformed payload cannot crash consumers.
 */
export function deserializeWorld(s: string): World {
  const raw = JSON.parse(s) as Partial<World> & Record<string, unknown>;

  const mood = coerceMood(raw.mood as string | undefined);
  const fallback = MOOD_PALETTES[mood];

  const paletteRaw = (raw.palette ?? {}) as Partial<Palette>;
  const palette: Palette = {
    bg: typeof paletteRaw.bg === "string" ? paletteRaw.bg : fallback.bg,
    fog: typeof paletteRaw.fog === "string" ? paletteRaw.fog : fallback.fog,
    accents:
      Array.isArray(paletteRaw.accents) && paletteRaw.accents.length > 0
        ? paletteRaw.accents.filter((c): c is string => typeof c === "string")
        : [...fallback.accents],
  };

  const elements: DreamElement[] = Array.isArray(raw.elements)
    ? raw.elements.map((e, i) => normalizeElement(e, i))
    : [];

  return {
    id: typeof raw.id === "string" ? raw.id : newId(String(raw.title ?? "world")),
    title: typeof raw.title === "string" ? raw.title : "Untitled Dream",
    dreamText: typeof raw.dreamText === "string" ? raw.dreamText : "",
    reading: typeof raw.reading === "string" ? raw.reading : undefined,
    rule: typeof raw.rule === "string" ? raw.rule : undefined,
    mood,
    palette,
    elements,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    narrationUrl:
      typeof raw.narrationUrl === "string" ? raw.narrationUrl : undefined,
  };
}

function normalizeElement(e: unknown, index: number): DreamElement {
  const el = (e ?? {}) as Partial<DreamElement> & Record<string, unknown>;
  const pos = el.position;
  const rot = el.rotation;
  return {
    id: typeof el.id === "string" ? el.id : newId(`element:${index}`),
    name: typeof el.name === "string" ? el.name : `element ${index + 1}`,
    prompt: typeof el.prompt === "string" ? el.prompt : "",
    meaning: typeof el.meaning === "string" ? el.meaning : undefined,
    modelUrl: typeof el.modelUrl === "string" ? el.modelUrl : undefined,
    position: isVec3(pos) ? pos : [0, 0, 0],
    scale: typeof el.scale === "number" && isFinite(el.scale) ? el.scale : 1,
    rotation: isVec3(rot) ? rot : [0, 0, 0],
    footprint:
      typeof el.footprint === "number" && isFinite(el.footprint)
        ? el.footprint
        : undefined,
  };
}

function isVec3(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => typeof n === "number" && isFinite(n))
  );
}

/* -------------------------------------------------------------------------- */
/*  Layout                                                                    */
/* -------------------------------------------------------------------------- */

export interface LayoutOptions {
  /** Base radius of the ring the elements sit on. */
  radius?: number;
  /** Vertical jitter amplitude (deterministic, derived from index). */
  heightVariation?: number;
  /** Y of the ring center. */
  centerY?: number;
}

/**
 * Assign pleasing positions, scales and rotations to dream elements.
 *
 * Elements are placed on a ring around the viewer with a golden-angle offset
 * and a gentle, deterministic vertical scatter so the world feels organic but
 * reproduces exactly on every render (no randomness). Returns NEW element
 * objects; inputs are not mutated.
 *
 * @param elements the elements to lay out
 * @param count    expected total count (used to size the ring); defaults to
 *                 elements.length
 */
export function layoutElements(
  elements: DreamElement[],
  count?: number,
  opts: LayoutOptions = {},
): DreamElement[] {
  void count; // legacy arg — depth now comes from rank, not a ring radius.
  const centerY = opts.centerY ?? 0;

  // Golden angle gives an even, non-repeating lateral spread.
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

  // Frontal composition with a landmark: the LARGEST element (by footprint)
  // becomes the hero dead ahead; the rest fan out with golden-angle lateral
  // offsets at increasing depth. Everything sits on the floor (y = 0) and
  // strictly in FRONT of the camera (z < 0), so you walk toward the hero
  // instead of being dropped inside a symmetric ring.
  const ranked = elements
    .map((el, i) => ({ el, i }))
    .sort((a, b) => (b.el.footprint ?? 2.6) - (a.el.footprint ?? 2.6));

  const byId = new Map<
    string,
    { position: [number, number, number]; rotation: [number, number, number] }
  >();

  ranked.forEach(({ el }, rank) => {
    const a = rank === 0 ? 0 : ((rank * GOLDEN_ANGLE) % 3.0) - 1.5;
    // Depth grows with SIZE: the big hero sits far back as a landmark you walk
    // toward; small things sit close so they read small. (Big-and-in-your-face
    // was what made the scene a claustrophobic corridor.)
    const depth = 5 + (el.footprint ?? 2.6) * 0.85 + rank * 0.6;
    const x = Math.sin(a) * depth * 0.5;
    const z = -Math.cos(a) * depth;
    const y = centerY;

    const faceCenter = Math.atan2(x, z) + Math.PI;
    // Only small things get a surreal tilt — a huge landmark stays upright.
    const tilt = (el.footprint ?? 2.6) < 4 ? Math.sin(rank * 0.9) * 0.18 : 0;

    byId.set(el.id, {
      position: [round(x), round(y), round(z)],
      rotation: [round(tilt), round(faceCenter), round(tilt * 0.5)],
    });
  });

  // Footprint governs size now, so scale is a flat 1 (no distance-shrink).
  return elements.map((el) => {
    const p = byId.get(el.id)!;
    return { ...el, position: p.position, scale: 1, rotation: p.rotation };
  });
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
