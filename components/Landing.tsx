// @/components/Landing.tsx
// The marketing landing — the money surface. Rendered by app/page.tsx at "/".
// The working maker (capture -> interpret -> generate -> scene -> diary -> gift)
// lives at /create; every primary call to action here points there.
//
// Server component (no "use client"): fully static, no state, no browser APIs —
// it only composes tokens + the shared ui.tsx primitives and reads the pure
// pricing data. The ambient treatment (fixed film-grain + one low ember glow)
// comes from body in globals.css; this page adds no blobs of its own.
//
// On-doctrine "Oniric Lacquer": the warm near-black void, ONE gold accent on
// all chrome (wordmark, buttons, borders, the single hero accent word), and the
// crystalline violet->cyan iridescence confined to the dream showcase band —
// where it legitimately IS the dream moment, never on chrome.

import Link from "next/link";
import { Button, Chip, Panel, cn } from "@/components/ui";
import {
  CREDITS_PER_WORLD,
  FIRST_WORLD_FREE,
  ORDER_BUMP,
  PACKAGES,
} from "@/lib/pricing";
import {
  CRYSTAL_VIOLET,
  CRYSTAL_MAGENTA,
  CRYSTAL_CYAN,
} from "@/lib/palette";

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function Landing(): React.JSX.Element {
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <TopBar />
      <main className="flex-1">
        <Hero />
        <Showcase />
        <HowItWorks />
        <Why />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Top bar — wordmark + the one primary action. Quiet hairline row.
 * ------------------------------------------------------------------ */

function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-void/80">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-6">
        <Link
          href="/"
          className="font-display text-xl tracking-[0.02em] text-haze transition-colors hover:text-gold-pale"
        >
          Oneiro
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button href="/diary" variant="ghost" size="sm" className="hidden sm:inline-flex">
            seu diário
          </Button>
          <Button href="/create" size="sm">
            Começar
          </Button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * Hero — huge hairline display, a single gold accent word.
 * ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="relative mx-auto flex w-full max-w-4xl flex-col items-center px-4 pb-10 pt-16 text-center sm:px-6 sm:pb-16 sm:pt-24">
      <h1 className="glow-text font-display font-light leading-[1.04] tracking-tight text-[clamp(2.75rem,9vw,6rem)]">
        Fale um sonho.
        <br />
        Caminhe <span className="accent-word">dentro</span> dele.
      </h1>

      <p className="mt-8 max-w-xl text-pretty text-base leading-relaxed text-mist sm:text-lg">
        Conte em voz alta o que você sonhou. O Oneiro interpreta e ergue um mundo
        navegável em 3D — um que você pode atravessar, guardar no diário e
        presentear.
      </p>

      <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:gap-3">
        <Button href="/create" size="lg" className="w-full sm:w-auto">
          Começar
          <ArrowIcon />
        </Button>
        <Button href="#como-funciona" variant="ghost" size="lg" className="w-full sm:w-auto">
          como funciona
        </Button>
      </div>

      {FIRST_WORLD_FREE && (
        <p className="mt-5 text-xs tracking-wide text-whisper">
          o primeiro mundo é por nossa conta — sem cartão
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Showcase — the dream band. Crystalline iridescence is allowed HERE:
 * each tile is a dream sky, the generation moment, not chrome. No fake
 * screenshots — abstract auroras painted from the sanctioned palette.
 * ------------------------------------------------------------------ */

interface DreamTile {
  mood: string;
  note: string;
  /** One crystalline hue — a whisper of aurora, not a full gradient fill. */
  hue: string;
  /** Radial glow position. */
  at: string;
}

const TILES: DreamTile[] = [
  { mood: "lúcido", note: "um céu que respira devagar", hue: CRYSTAL_CYAN, at: "32% 26%" },
  { mood: "febril", note: "correntes de luz que se dobram", hue: CRYSTAL_MAGENTA, at: "66% 22%" },
  { mood: "profundo", note: "um horizonte sem fim", hue: CRYSTAL_VIOLET, at: "50% 28%" },
];

// A soft, cloud-like turbulence used as a MASK so the hue reads as nebula
// texture, not a smooth gradient blob. Pure CSS/SVG — renders without WebGL.
const NEBULA_MASK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='400'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.015' numOctaves='4' seed='7'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
const STAR_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")";

function Showcase() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
        {TILES.map((tile) => (
          <DreamSkyTile key={tile.mood} tile={tile} />
        ))}
      </div>
      <p className="mt-6 text-center text-xs tracking-wide text-whisper">
        cada mundo nasce só do que você contou — nenhum se repete
      </p>
    </section>
  );
}

function DreamSkyTile({ tile }: { tile: DreamTile }) {
  return (
    <article
      className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-dream)] border border-hairline sm:aspect-[3/4]"
      style={{ backgroundColor: "var(--color-void)" }}
    >
      {/* Textured nebula: the hue broken up by a turbulence mask — reads as
          cloud, not a smooth blob. Drifts slowly (no-ops under reduced motion). */}
      <div
        aria-hidden="true"
        className="animate-dream-drift absolute inset-0"
        style={{
          backgroundColor: tile.hue,
          opacity: 0.5,
          maskImage: NEBULA_MASK,
          WebkitMaskImage: NEBULA_MASK,
          maskSize: "cover",
          WebkitMaskSize: "cover",
          mixBlendMode: "screen",
        }}
      />
      {/* Contained crystalline glow — the dream moment, upper third only. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(55% 42% at ${tile.at}, ${tile.hue}, transparent 72%)`,
          opacity: 0.38,
          mixBlendMode: "screen",
        }}
      />
      {/* Fine star grain. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-30"
        style={{ backgroundImage: STAR_GRAIN, mixBlendMode: "overlay" }}
      />
      {/* Deep vignette — sink the tile into the lacquer, never pure color. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(135% 100% at 50% 18%, transparent 22%, oklch(12% 0.012 296 / 0.82) 100%)",
        }}
      />
      {/* Caption (no blur — glass is banned). */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
        <span className="font-display text-lg font-light text-haze">
          {tile.mood}
        </span>
        <span className="text-right text-[0.7rem] leading-tight text-haze/65">
          {tile.note}
        </span>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * How it works — three beats. A connected row, NOT a grid of identical
 * cards: big hairline numerals, drawn icons, hairline dividers.
 * ------------------------------------------------------------------ */

interface Step {
  n: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    n: "01",
    icon: <MicIcon />,
    title: "Você fala",
    body: "Toque no microfone e conte seu sonho em voz alta, sem pressa. Prefere escrever? Também dá.",
  },
  {
    n: "02",
    icon: <OrbitIcon />,
    title: "A IA sonha em 3D",
    body: "O Oneiro lê o que você contou, interpreta os símbolos e ergue um mundo navegável de verdade.",
  },
  {
    n: "03",
    icon: <GiftIcon />,
    title: "Explore & presenteie",
    body: "Caminhe dentro dele, guarde a noite no seu diário e envie o mundo de presente a quem quiser.",
  },
];

function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 sm:py-20"
    >
      <SectionHead title="Do sussurro ao mundo, em um instante." />
      <div className="mt-12 grid grid-cols-1 gap-y-10 sm:grid-cols-3 sm:gap-x-0">
        {STEPS.map((step, i) => (
          <div
            key={step.n}
            className={cn(
              "flex flex-col gap-4 sm:px-7",
              i > 0 && "sm:border-l sm:border-hairline",
            )}
          >
            <div className="flex items-center gap-4">
              <span className="font-display text-5xl font-light leading-none text-neon-gold/90 tnum">
                {step.n}
              </span>
              <span className="text-gold-pale">{step.icon}</span>
            </div>
            <h3 className="font-display text-2xl font-semibold text-haze">
              {step.title}
            </h3>
            <p className="max-w-xs text-sm leading-relaxed text-mist">
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Why — a quiet conviction band + a hairline row of qualities.
 * No fabricated testimonials or metrics.
 * ------------------------------------------------------------------ */

const QUALITIES = [
  "Voz ou texto",
  "Mundo navegável",
  "Diário privado",
  "Presenteável",
] as const;

function Why() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-14 text-center sm:px-6 sm:py-20">
      <h2 className="glow-text font-display font-light leading-[1.1] tracking-tight text-[clamp(1.9rem,5vw,3.25rem)]">
        Um sonho é cedo demais para esquecer.
      </h2>
      <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-mist sm:text-lg">
        Toda manhã o sonho começa a se dissolver. O Oneiro o guarda inteiro —
        não como texto, mas como um lugar. Um mundo que é só seu, feito do que
        só você viu dormindo.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
        {QUALITIES.map((q) => (
          <Chip key={q}>{q}</Chip>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Pricing — reads lib/pricing (the single source of truth).
 * ------------------------------------------------------------------ */

interface Tier {
  id: string;
  label: string;
  price: string;
  worlds: string;
  tagline: string;
  featured: boolean;
}

// pt-BR copy is ours; the hard numbers (price, credits) come from lib/pricing.
const PT_TAGLINES: Record<string, string> = {
  wanderer: "Alguns mundos para explorar com calma.",
  dreamer: "Para quem sonha sempre. Melhor valor.",
};

const TIERS: Tier[] = [
  {
    id: "free",
    label: "Primeiro mundo",
    price: "Grátis",
    worlds: `${CREDITS_PER_WORLD} mundo`,
    tagline: "Por nossa conta. Sem cartão, sem conta.",
    featured: false,
  },
  ...PACKAGES.map<Tier>((p) => ({
    id: p.id,
    label: p.label,
    price: `$${p.priceUsd}`,
    worlds: `${p.credits} mundos`,
    tagline: PT_TAGLINES[p.id] ?? p.tagline,
    featured: p.id === "dreamer",
  })),
];

function Pricing() {
  return (
    <section
      id="precos"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 sm:py-20"
    >
      <SectionHead title="Comece grátis. Sonhe quanto quiser." />
      <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
        {TIERS.map((tier) => (
          <PriceCard key={tier.id} tier={tier} />
        ))}
      </div>
      <p className="mt-7 text-center text-sm text-whisper">
        No checkout, adicione{" "}
        <span className="text-gold-pale">
          +{ORDER_BUMP.credits} créditos por ${ORDER_BUMP.priceUsd}
        </span>{" "}
        em um toque. 1 crédito = 1 mundo. Compra única, sem assinatura.
      </p>
    </section>
  );
}

function PriceCard({ tier }: { tier: Tier }) {
  return (
    <Panel
      as="article"
      className={cn(
        "relative flex flex-col gap-5 p-7",
        tier.featured && "border-hairline-gold",
      )}
    >
      {tier.featured && (
        <Chip gold className="absolute right-5 top-5">
          melhor valor
        </Chip>
      )}

      <div>
        <h3 className="font-display text-2xl font-semibold text-haze">
          {tier.label}
        </h3>
        <p className="mt-2 min-h-[2.5rem] text-sm leading-relaxed text-mist">
          {tier.tagline}
        </p>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-display text-5xl font-light leading-none text-haze tnum">
          {tier.price}
        </span>
        <span className="text-sm text-whisper">{tier.worlds}</span>
      </div>

      <Button
        href="/create"
        variant={tier.featured ? "primary" : "ghost"}
        className="mt-auto w-full"
      >
        {tier.id === "free" ? "Começar" : `Escolher ${tier.label}`}
      </Button>
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Final CTA
 * ------------------------------------------------------------------ */

function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
      <h2 className="glow-text font-display font-light leading-[1.06] tracking-tight text-[clamp(2.25rem,7vw,4.5rem)]">
        O seu sonho está <span className="accent-word">esperando</span>.
      </h2>
      <div className="mt-10 flex justify-center">
        <Button href="/create" size="lg">
          Começar
          <ArrowIcon />
        </Button>
      </div>
      {FIRST_WORLD_FREE && (
        <p className="mt-5 text-xs tracking-wide text-whisper">
          primeiro mundo grátis · leva menos de um minuto
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Footer
 * ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="font-display text-lg tracking-[0.02em] text-haze">
            Oneiro
          </p>
          <p className="mt-1 text-xs text-whisper">
            Fale um sonho, caminhe dentro dele.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-mist">
          <Link href="/create" className="transition-colors hover:text-haze">
            começar
          </Link>
          <Link href="/diary" className="transition-colors hover:text-haze">
            diário
          </Link>
          <Link href="#como-funciona" className="transition-colors hover:text-haze">
            como funciona
          </Link>
          <Link href="#precos" className="transition-colors hover:text-haze">
            preços
          </Link>
        </nav>
        <p className="text-xs text-whisper">© {new Date().getFullYear()} Oneiro</p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ *
 * Bits — section head + drawn icons (consistent 1.6 stroke, gold via
 * currentColor). No emoji as icons.
 * ------------------------------------------------------------------ */

function SectionHead({ title }: { title: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-[clamp(1.75rem,4.5vw,2.5rem)] font-semibold leading-[1.1] text-haze">
        {title}
      </h2>
    </div>
  );
}

function SparkIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v4M12 17v4M5 12H1M23 12h-4M6.3 6.3 3.5 3.5M20.5 20.5l-2.8-2.8M17.7 6.3l2.8-2.8M3.5 20.5l2.8-2.8" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" />
    </svg>
  );
}

function OrbitIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5c.5 4 1.5 5 5.5 5.5-4 .5-5 1.5-5.5 5.5-.5-4-1.5-5-5.5-5.5 4-.5 5-1.5 5.5-5.5Z" opacity="0.9" />
      <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-28 12 12)" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" />
      <path d="M2.5 8.5h19V12h-19zM12 8.5V21" />
      <path d="M12 8.5S10.5 4 8 4a2.2 2.2 0 0 0 0 4.5ZM12 8.5S13.5 4 16 4a2.2 2.2 0 0 1 0 4.5Z" />
    </svg>
  );
}
