// @/lib/entropy.ts
// The brainstem: seeded, deterministic entropy for the imagination pipeline.
//
// Imagination here is NOT asked of the LLM ("be creative" -> cliché). It is
// manufactured: this module emits seeded noise + forced collisions (the random
// PGO-like activation / exogenous entropy), and the LLM later completes form
// over it. Pure, like lib/world.ts — seed is an INPUT, never Date.now /
// Math.random at module scope, so a given dream always yields the same world
// (gift links / dream journal reproduce exactly).

import { fnv1a32 } from "@/lib/world";

/* -------------------------------------------------------------------------- */
/*  Seeded PRNG                                                               */
/* -------------------------------------------------------------------------- */

/** A seeded pseudo-random generator: each call returns a float in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32 — tiny, fast, well-distributed 32-bit PRNG. Deterministic for a
 * given numeric seed.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a numeric PRNG seed from any string, via the shared FNV-1a hash. */
export function seedFromText(text: string): number {
  return fnv1a32(text);
}

/** Convenience: a seeded Rng straight from a string (e.g. the dream text). */
export function rngFromText(text: string): Rng {
  return mulberry32(seedFromText(text));
}

/* -------------------------------------------------------------------------- */
/*  Concept bank — rare physical materials / processes / transformations      */
/* -------------------------------------------------------------------------- */

/**
 * ~120 specific, rare physical modifiers. These are the exogenous "noise" the
 * LLM completes form over: concrete materials, states of matter, and
 * transformations — never emotions or abstractions. Each is phrased to attach
 * to an object ("<object>, <concept>"). Specific beats surreal: "made of
 * oxidized mercury" collides harder than "weird" ever will.
 */
export const CONCEPT_BANK: readonly string[] = [
  // --- materials: metals & minerals ---
  "made of liquid mercury",
  "cast in oxidized bronze flecked with verdigris",
  "forged from brushed titanium",
  "made of cooling molten glass",
  "carved from a single block of rose quartz",
  "sheathed in hammered copper gone green",
  "formed of black obsidian with conchoidal fractures",
  "grown as a single salt crystal",
  "plated in tarnished silver leaf",
  "made of pitted meteoric iron",
  "cast in lead, dull and soft",
  "set with raw uncut garnets",
  "coated in a thin film of gold leaf, peeling",
  "made of pale translucent alabaster",
  "built from fused volcanic basalt",
  // --- materials: organic & soft ---
  "made of translucent resin with things suspended inside",
  "wrapped in wet silk clinging to its form",
  "grown over with velvet moss",
  "furred like the underside of a moth's wing",
  "made of overlapping fish scales",
  "formed of translucent jellyfish tissue",
  "knitted from coarse grey wool",
  "made of beeswax beginning to slump",
  "skinned in cracked leather",
  "woven from dry grass and spiderweb",
  "made of layered mother-of-pearl",
  "grown from coral, bleached white",
  "made of bruised, overripe fruit flesh",
  "sheathed in snake skin mid-shed",
  "formed of compacted ash holding its shape",
  // --- materials: glass / crystal / light ---
  "hollow and revealing stained glass within",
  "made of smoked quartz glass",
  "faceted like a cut gemstone",
  "made of frosted sea glass",
  "formed of clear ice with trapped bubbles",
  "made of thin blown glass, almost breath",
  "shot through with fiber-optic threads of light",
  "glazed in iridescent lacquer",
  "made of layered laminated glass, slightly misaligned",
  "formed of crystallized honey, amber and slow",
  // --- materials: industrial / uncanny ---
  "bronze fused with liquid glass",
  "circuitry grown like lichen across its surface",
  "cast in concrete with rebar showing through",
  "made of folded tin, sharp at the seams",
  "surfaced in cracked porcelain, gold-filled seams",
  "stitched together from mismatched materials",
  "made of wax paper lit from inside",
  "coated in chalkboard matte black",
  "built from stacked, worn playing cards",
  "wrapped in copper wire under tension",
  // --- processes: transformation ---
  "mid-dissolve into fine sand",
  "frozen in the act of shattering",
  "slowly turning to smoke at the edges",
  "half-petrified, half still soft",
  "rusting visibly, in real time",
  "crystallizing outward from a single point",
  "unravelling into loose thread",
  "melting upward against gravity",
  "folding into itself like wet paper",
  "evaporating from the top down",
  "calcifying like a cave formation",
  "blooming open like time-lapse decay",
  "fossilizing while still warm",
  "sublimating directly into vapor",
  "caught mid-collapse, held suspended",
  "weathering to driftwood as you watch",
  "fermenting, swelling and souring",
  "oxidizing into bright flaking color",
  "liquefying from the inside out",
  "re-forming from scattered pieces",
  // --- processes: motion / behavior ---
  "breathing slowly like a sleeping lung",
  "pulsing with a heartbeat you can feel",
  "trembling as if about to speak",
  "rotating against its own shadow",
  "casting a shadow that does not match it",
  "leaking a slow thread of light",
  "humming at a frequency just below hearing",
  "shedding a fine dust that never lands",
  "drinking in the light around it",
  "flickering between two positions",
  // --- transformations: scale & structure ---
  "scaled wrong — vast where it should be small",
  "scaled wrong — tiny where it should be huge",
  "turned inside out, interior facing out",
  "hollow where it should be solid",
  "solid where it should be hollow",
  "mirrored and fused with its own reflection",
  "repeated in receding nested copies",
  "cross-sectioned, showing impossible interior",
  "stretched along one axis past reason",
  "compressed as if seen edge-on",
  "unfolded flat like a dissection diagram",
  "doubled, the second lagging behind the first",
  "seen simultaneously from several angles",
  "built at the wrong scale for its own weight",
  "fractured and reassembled slightly off",
  // --- surface / optical ---
  "surfaced in anti-reflective velvet black",
  "coated so it reads as both bark and circuitry",
  "patterned with the grain of old oak",
  "etched with lines like a topographic map",
  "textured like elephant hide, deeply creased",
  "surfaced in dew that never evaporates",
  "mottled with the pattern of oil on water",
  "scorched and charred on one face only",
  "polished to a blinding mirror on one side",
  "crazed all over with fine hairline cracks",
  // --- liminal / dream-specific ---
  "lit as if from an interior sun",
  "half-submerged in still black water",
  "casting no reflection at all",
  "warm to look at, the way skin is",
  "too detailed to be real, every pore visible",
  "soft at the edges, refusing to hold an outline",
  "present and absent at once, like a held breath",
  "familiar in a way you cannot place",
  "left behind by something that just left",
  "waiting, the way a room waits",
  "wet with a light that drips",
  "quiet in a way that has weight",
  "older than it has any right to be",
  "made of the color you see with eyes shut",
] as const;

/* -------------------------------------------------------------------------- */
/*  Oblique strategies — lateral constraints (after Eno & Schmidt)            */
/* -------------------------------------------------------------------------- */

/**
 * ~30 lateral constraints. One is drawn per object to force a sideways move the
 * median completion would never make. A constraint, not a description — it
 * reshapes how the LLM completes the collided seed.
 */
export const OBLIQUE_STRATEGIES: readonly string[] = [
  "use the wrong material",
  "invert the scale",
  "make it translucent",
  "show it from the inside",
  "let gravity point the wrong way",
  "remove its most defining feature",
  "give it the texture of something soft",
  "freeze it one instant before it breaks",
  "let it be two things at once, resolving neither",
  "keep only the shadow of the idea",
  "make the surface contradict the shape",
  "let decay be the subject, not damage",
  "age it a thousand years",
  "make it the negative space, not the object",
  "let it be caught mid-transformation",
  "give it an interior it should not have",
  "make it smaller than a thumb",
  "make it larger than a room",
  "let light come from inside it",
  "repeat it until the repetition is the thing",
  "let it be unfinished, abandoned",
  "make the familiar unrecognizably close up",
  "give it the logic of water",
  "let it belong to no scale at all",
  "make it mundane in an impossible way",
  "let the material remember being something else",
  "fuse it with its opposite",
  "let it be described the way a room is described",
  "subtract until only the essential strangeness is left",
  "make it look at you back",
  "let it be warm where it should be cold",
] as const;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Pick one element of an array using the seeded Rng. */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Lowercase word tokens of a phrase, for cheap lexical similarity. */
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Jaccard similarity over word sets. 0 = no shared words, 1 = identical set. */
function similarity(a: string, b: string): number {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** A forced collision: two things the LLM must read as one coherent object. */
export interface Bisociation {
  a: string;
  b: string;
  kind: "motif×motif" | "motif×concept";
}

/**
 * Force `count` bisociations: Koestler's collision of two matrices that should
 * not meet. Each is either two low-similarity motifs from the dream (automated
 * exquisite corpse) or a motif crossed with a rare CONCEPT_BANK entry. We bias
 * motif×motif pairs toward LOW lexical similarity so the pairing is a genuine
 * jump, not two near-synonyms. Deterministic for a given Rng.
 */
export function bisociate(
  motifs: string[],
  rng: Rng,
  count = 3,
): Bisociation[] {
  const clean = motifs.map((m) => m.trim()).filter(Boolean);
  const out: Bisociation[] = [];

  for (let k = 0; k < count; k++) {
    const canPair = clean.length >= 2;
    const useConcept = !canPair || rng() < 0.5;

    if (useConcept && clean.length > 0) {
      out.push({
        a: pick(rng, clean),
        b: pick(rng, CONCEPT_BANK),
        kind: "motif×concept",
      });
    } else if (canPair) {
      // Sample a few candidate pairs, keep the least similar one.
      let best: [string, string] = [clean[0], clean[1]];
      let bestSim = Infinity;
      for (let t = 0; t < 4; t++) {
        const i = Math.floor(rng() * clean.length);
        let j = Math.floor(rng() * clean.length);
        if (j === i) j = (j + 1) % clean.length;
        const sim = similarity(clean[i], clean[j]);
        if (sim < bestSim) {
          bestSim = sim;
          best = [clean[i], clean[j]];
        }
      }
      out.push({ a: best[0], b: best[1], kind: "motif×motif" });
    } else {
      // No motifs at all: pure concept seed.
      out.push({ a: "", b: pick(rng, CONCEPT_BANK), kind: "motif×concept" });
    }
  }

  return out;
}

/**
 * How far to push the collision, from an intensity (0..1). Keeps a floor so even
 * calm dreams get a nudge, and never exceeds 1. Feeds how aggressively the
 * synthesis step samples from the improbable tail.
 */
export function entropyDegree(intensity: number): number {
  const i = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
  return 0.2 + 0.8 * i;
}
