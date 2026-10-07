"use client";
// @/components/Onboarding.tsx
// A three-beat first-run intro, shown once per visitor: what Oneiro is, how to
// speak a dream, and the mic permission to expect. It is a self-contained
// overlay — the landing hero renders underneath — so it owns its own show/hide
// and persists a localStorage flag when finished or skipped. Fully skippable
// (Esc, a "pular" link, or just the CTA on the last beat).
//
// On-doctrine: a flat lacquer panel on the warm void, one gold accent, no glass
// and no blur. Mobile-first and reduced-motion aware. Nothing here touches the
// capture flow — it only decides whether to render.

import { useEffect, useState } from "react";
import { Button, Chip, Panel, cn } from "@/components/ui";
import { FIRST_WORLD_FREE } from "@/lib/pricing";

const ONBOARD_KEY = "oneiro:onboarded";

function hasOnboarded(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(ONBOARD_KEY) === "1";
  } catch {
    return false;
  }
}

function markOnboarded(): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ONBOARD_KEY, "1");
  } catch {
    /* blocked storage — the intro just shows again next time, no harm */
  }
}

interface Beat {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const BEATS: Beat[] = [
  {
    icon: <SparkGlyph />,
    title: "Conte um sonho.",
    body: "O Oneiro transforma o que você sonhou num mundo em 3D — e deixa você caminhar dentro dele.",
  },
  {
    icon: <MicGlyph />,
    title: "Fale em voz alta.",
    body: "Toque no microfone e descreva seu sonho, sem pressa. Dá pra editar o texto depois, do seu jeito.",
  },
  {
    icon: <ShieldGlyph />,
    title: "Libere o microfone.",
    body: "Quando o navegador pedir, permita o acesso ao microfone. Prefere escrever? Também dá — é só digitar.",
  },
];

export default function Onboarding() {
  // `ready` gates the first paint so server + client agree (no hydration flash);
  // `show` is decided from storage only after mount. `entered` drives a one-shot
  // fade-in once the overlay is on screen.
  const [ready, setReady] = useState(false);
  const [show, setShow] = useState(false);
  const [entered, setEntered] = useState(false);
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    setShow(!hasOnboarded());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!show) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [show]);

  // Move focus to the primary action as beats advance — keyboard users land on
  // the CTA (so Enter advances) and Esc is caught by the dialog. Focused by id
  // because the shared Button isn't a ref-forwarding component.
  useEffect(() => {
    if (show && entered) document.getElementById("onboarding-cta")?.focus();
  }, [show, entered, beat]);

  if (!ready || !show) return null;

  const finish = () => {
    markOnboarded();
    setShow(false);
  };

  const next = () => {
    if (beat < BEATS.length - 1) setBeat((b) => b + 1);
    else finish();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") finish();
  };

  const current = BEATS[beat];
  const isLast = beat === BEATS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-void px-5 py-[max(1.5rem,env(safe-area-inset-top))]"
      style={{
        backgroundImage:
          "radial-gradient(48rem 40rem at 50% 118%, oklch(72% 0.17 52 / 0.16), transparent 60%)",
      }}
    >
      <Panel
        className={cn(
          "relative w-full max-w-md p-8 text-center transition-all duration-500 ease-out sm:p-10",
          "motion-reduce:transition-none",
          entered
            ? "translate-y-0 opacity-100"
            : "translate-y-3 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
        )}
      >
        <button
          type="button"
          onClick={finish}
          className="absolute right-4 top-4 text-xs text-whisper transition-colors hover:text-mist"
        >
          pular
        </button>

        {/* The single warm light: the beat glyph in a hairline ring. */}
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-hairline-gold text-gold-pale [background:oklch(from_var(--color-neon-gold)_l_c_h_/_0.06)]">
          {current.icon}
        </div>

        <h2
          id="onboarding-title"
          className="glow-text mt-7 font-display text-3xl font-light leading-[1.1] sm:text-4xl"
        >
          {current.title}
        </h2>

        <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-mist">
          {current.body}
        </p>

        {beat === 0 && FIRST_WORLD_FREE && (
          <Chip gold className="mt-5">
            o primeiro mundo é por nossa conta
          </Chip>
        )}

        {/* Progress dots */}
        <div
          className="mt-8 flex items-center justify-center gap-2"
          aria-hidden="true"
        >
          {BEATS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none",
                i === beat ? "w-6 bg-neon-gold" : "w-1.5 bg-hairline",
              )}
            />
          ))}
        </div>

        <Button
          id="onboarding-cta"
          onClick={next}
          size="lg"
          className="mt-7 w-full"
        >
          {isLast ? "começar a sonhar" : "continuar"}
        </Button>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Beat glyphs — single-line icons, gold via currentColor.
 * ------------------------------------------------------------------ */

function SparkGlyph() {
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
      <path d="M12 2.5c.6 4.8 1.7 5.9 6.5 6.5-4.8.6-5.9 1.7-6.5 6.5-.6-4.8-1.7-5.9-6.5-6.5 4.8-.6 5.9-1.7 6.5-6.5Z" />
      <path d="M18.5 14.5c.3 2 .7 2.4 2.7 2.7-2 .3-2.4.7-2.7 2.7-.3-2-.7-2.4-2.7-2.7 2-.3 2.4-.7 2.7-2.7Z" />
    </svg>
  );
}

function MicGlyph() {
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

function ShieldGlyph() {
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
      <path d="M12 3 5 6v6c0 4.2 3 7.4 7 8.5 4-1.1 7-4.3 7-8.5V6l-7-3Z" />
      <path d="m9 11.5 2 2 4-4" />
    </svg>
  );
}
