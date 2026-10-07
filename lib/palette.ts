// @/lib/palette.ts
// Single source of truth for the DREAM-MOMENT colors, as sRGB hex computed to
// match the OKLCH tokens in app/globals.css. Pure constants — no React, no
// browser APIs — so the 3D sky shader, the DreamObject glow fallback and the
// DreamScene warp veil all read ONE set of values and never drift apart.
//
// Keep these in lockstep with globals.css @theme:
//   --color-neon-violet : oklch(68% 0.17 300)
//   --color-neon-magenta: oklch(70% 0.2 348)
//   --color-neon-cyan   : oklch(83% 0.115 210)
//   --color-ember       : oklch(72% 0.17 52)

/** Crystalline iridescence — the dream/generation moment ONLY. */
export const CRYSTAL_VIOLET = "#a97cf0"; // oklch(68% 0.17 300)
export const CRYSTAL_MAGENTA = "#f360b4"; // oklch(70% 0.2 348)
export const CRYSTAL_CYAN = "#5cdcf0"; // oklch(83% 0.115 210)

/** The one warm light — ember fallback for scene glow when a palette is sparse. */
export const EMBER = "#f58028"; // oklch(72% 0.17 52)

/** Pale gold sheen — the warm hover/sheen stop. Matches --color-gold-pale. */
export const GOLD_PALE = "#f6dfac"; // oklch(91% 0.07 86)

// Warm ember-family fallbacks for scene LIGHTS / FOG when a palette field is
// missing. NEVER crystalline: the "no violet in scene light" invariant must
// hold even on a sparse palette. sRGB hex computed from the OKLCH tokens.
export const EMBER_GOLD = "#e8a24a"; // oklch(76% 0.12 70) — warm amber fill
export const EMBER_DEEP = "#c76a3c"; // oklch(61% 0.13 45) — warm terracotta rim
export const SCENE_FOG = "#1a1310"; // oklch(18% 0.02 50) — warm low-chroma fog/ground
export const SCENE_GROUND = "#140f0b"; // oklch(15% 0.02 50) — warm near-black (reseed fallback)
