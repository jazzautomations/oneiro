# Oneiro — Design System: "Oniric Lacquer"

The committed visual world. It is **locked** and is the source of truth for every
screen. Build on it; do not reinvent it. Token and utility **names are stable** —
if you need a new value, add a token, don't rename one.

Oneiro is a **product** (a dream-journal startup), not a demo. The product/
experience is always the first screen. No marketing filler.

---

## The one idea

A cool, deep **lacquer void** at night. The only warmth anywhere on the chrome is
**one divine ember/gold light**. The crystalline **violet→cyan iridescence** is the
color of *dreaming itself* — it appears **only** at the generation/dream moment
(loading, the 3D sky, warps) and **never** on chrome (buttons, borders, focus,
selection, nav). That contrast — cold night, single warm light — is the whole brand.

---

## Palette (OKLCH tokens, defined in `app/globals.css @theme`)

Use via Tailwind utilities (`bg-void`, `text-mist`, `border-hairline`, `bg-neon-gold/10`, …).

### Surfaces — deep mineral lacquer, never pure black (low chroma = refined, not "purple")
| Token | Value | Role |
|---|---|---|
| `--color-void` | `oklch(13% 0.01 296)` | page ground |
| `--color-abyss` | `oklch(16.5% 0.014 296)` | panels / cards |
| `--color-indigo-deep` | `oklch(21% 0.02 294)` | raised chrome |
| `--color-violet-deep` | `oklch(26% 0.028 296)` | inset / active state |

### Text — neutral-warm, bright for crisp reading
| Token | Value | Role |
|---|---|---|
| `--color-haze` | `oklch(96% 0.01 300)` | headlines / strong |
| `--color-mist` | `oklch(78% 0.016 300)` | body / secondary |
| `--color-whisper` | `oklch(62% 0.018 300)` | captions / muted |

### The one warm light — ember / gold (the ONLY accent on chrome)
| Token | Value | Role |
|---|---|---|
| `--color-ember` | `oklch(72% 0.17 52)` | deep warm ember |
| `--color-neon-gold` | `oklch(84% 0.145 82)` | molten gold — **primary accent** |
| `--color-gold-pale` | `oklch(91% 0.07 86)` | hover lift / sheen / highlight |

### Crystalline — the DREAM MOMENT ONLY (loading, generation, 3D sky). Never on chrome.
| Token | Value |
|---|---|
| `--color-neon-violet` | `oklch(68% 0.17 300)` |
| `--color-neon-cyan` | `oklch(83% 0.115 210)` |
| `--color-neon-magenta` | `oklch(70% 0.2 348)` |
| `--color-neon-rose` | `oklch(72% 0.15 22)` — also the **error** voice |

### Hairlines (borders come before shadows)
| Token | Value |
|---|---|
| `--color-hairline` | `oklch(92% 0.02 300 / 0.12)` |
| `--color-hairline-gold` | `oklch(84% 0.13 82 / 0.44)` |

### Semantic aliases
`--color-background` → void · `--color-foreground` → haze · `--color-accent` → neon-gold · `--color-accent-strong` → ember

### Gradients
- `--gradient-dream` — **PRIMARY.** One warm family, `gold-pale → neon-gold → ember` (140°). CTAs, mic, the single warm fill. This is *not* a rainbow and is allowed.
- `--gradient-aurora` — crystalline `violet → magenta → cyan`. **Dream moment only.**

---

## Typography

Wired in `app/layout.tsx` via `next/font` → `--font-display-face` / `--font-sans-face`,
mapped in `@theme` to the stable tokens `--font-display` / `--font-sans`
(utilities `font-display` / `font-sans`).

- **Display — Cormorant** (serif, high-contrast, thin & ethereal). Weights 300/400/500/600 + italic.
- **Body/UI — Hanken Grotesk** (clean warm geometric grotesk). Weights 400/500/600/700.

**Weight-inversion is the signature:** heroes are **huge and hairline** (Cormorant
300), section heads are **smaller and heavier** (Cormorant 600). Body is Hanken 400–500.

Scale & roles (fluid; cap display at ~6rem):
| Role | Face / weight | Size |
|---|---|---|
| Hero | display 300 | `clamp(2.75rem, 8vw, 5.5rem)`, `leading-[1.05]`, `tracking-tight` |
| Section head | display 600 | `1.75–2.5rem` |
| Title / card | display 500 | `1.25–1.75rem` |
| Body | sans 400/500 | `0.9375–1.125rem`, measure 65–75ch |
| Caption | sans 500 | `0.8125rem`, `text-whisper` |
| Eyebrow | sans 600 | `0.6875rem`, `0.3em` tracking, uppercase |

`h1/h2/h3` default to the display face, `-0.02em` tracking, balanced wrap. Use
`tnum` for counts/progress/timestamps.

---

## Spacing, radius, texture

- **Radii (small, deliberate):** `--radius-dream` `0.75rem` (panels) · `--radius-control` `0.5rem` (buttons/inputs) · `--radius-chip` `0.4rem`. No bubbly/pill geometry as a default.
- **Rhythm:** tight within a group, generous between groups; more space above a heading than below it. `section` utility = `clamp(3rem,7vw,5.5rem)` vertical.
- **Gutter:** 16px minimum side gutter on mobile; no horizontal page scroll; stable layouts (no shift on hover/label change).
- **Texture:** fixed film-grain (`body::before`, opacity 0.04) + one low ember radial glow bottom-center. That is the entire ambient treatment — do not add more.

---

## Motion

One authored, high-signal moment per view — never scattered decorative jitter.
Ease-out from an already-visible default. Honor `prefers-reduced-motion` (the
system keyframes already no-op under it). Keyframe utilities: `animate-float`,
`animate-dream-pulse`, `animate-dream-drift`. Reach past opacity/transform (blur,
mask, shadow) for the dream moment, kept smooth.

---

## Component vocabulary

Component classes live in `@layer components` (so Tailwind utilities still override).
React wrappers in `components/ui.tsx`.

- `.btn` + `.btn-primary` (gold lacquer, dark void ink) / `.btn-ghost` (hairline, warms to gold). Sizes `.btn-sm` / `.btn-lg`.
- `.icon-btn` — square hairline control for one drawn icon.
- `.panel` — flat lacquer surface (hairline + soft deep drop, faint top sheen). `.panel-inset` for nested regions. `.glass-panel` kept as a back-compat alias (flat, **not** glass).
- `.eyebrow` · `.chip` / `.chip-gold` · `.input` (gold focus ring).
- Browser surfaces are themed from the palette: selection (gold), scrollbar (gold), and a system-wide **gold** `:focus-visible` ring.

### `components/ui.tsx` APIs
- `Button({ variant?: "primary"|"ghost" = "primary", size?: "sm"|"md"|"lg" = "md", href?, className?, ...native })` — renders `<button>`, or a Next `<Link>` when `href` is set.
- `IconButton({ label: string /* required aria-label */, children: ReactNode /* drawn SVG */, ...native })`.
- `Panel({ as?: "div"|"section"|"article"|"aside" = "div", inset?: boolean, className?, ...native })`.
- `Eyebrow({ className?, ...native })` · `Chip({ gold?: boolean, className?, ...native })`.
- `cn(...)` — class joiner.

---

## Do / Do-not

**Do**
- One accent per surface. Gold is the single chrome light; crystalline is dreaming only.
- Hairlines before shadows; shadows carry a real offset + soft blur.
- Flat, compact, sharply-bounded panels. Small radii. Weight-inversion type.
- Icons drawn (SVG, consistent stroke). Theme every browser surface.
- Ship real states: hover, focus, disabled, loading, error, empty. Mobile first-class.

**Do-not (reads as AI slop)**
- Rainbow-gradient text or buttons; gradient text for emphasis (use weight/size).
- Glassmorphism / backdrop-blur panels. Generic purple→magenta→cyan glow on everything.
- Decorative floating blobs. Crystalline/violet on chrome (incl. focus, selection).
- Cards nested in cards; same-size icon-heading-text card grids as page structure.
- Pure black or pure white. Oversized vague hero copy. Bubbly huge radii.
- Colored `border-left/right` > 1px; hard zero-blur block shadows; emoji as icons.
- System display faces. Monospace as a "technical" costume.
