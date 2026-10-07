"use client";

// @/app/gift/[id]/page.tsx
// The public, auth-free "gift" view of a shared dream.
//
// Loads the persisted World via GET /api/share?id=<id>, then presents it as a
// finished, navigable experience: the gift OPENS with a reveal (a void veil
// carrying the title lifts to uncover the living world), and over the stage
// float the title, the dream's leitura, a "feito com Oneiro" footer and a CTA.
// No store, no auth, no build flow — a gift link is a standalone window.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { World } from "@/lib/world";
import DreamScene from "@/components/DreamScene";
import DreamReading from "@/components/DreamReading";
import LoadingDream from "@/components/LoadingDream";
import { Button, Panel, cn } from "@/components/ui";

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; world: World };

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function GiftPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!id) {
      setState({ phase: "error", message: "Link de sonho inválido." });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });

        if (!res.ok) {
          let message =
            res.status === 404
              ? "Este sonho não foi encontrado — talvez tenha se dissipado."
              : "Não foi possível abrir este sonho agora.";
          try {
            const body = (await res.json()) as { error?: unknown };
            if (typeof body?.error === "string" && body.error.trim()) {
              message = body.error;
            }
          } catch {
            /* keep default message */
          }
          if (!cancelled) setState({ phase: "error", message });
          return;
        }

        const world = (await res.json()) as World;
        if (!cancelled) setState({ phase: "ready", world });
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Não foi possível abrir este sonho agora.";
        setState({ phase: "error", message });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id]);

  if (state.phase === "loading") {
    return (
      <LoadingDream
        phase="interpreting"
        messages={[
          "Abrindo um sonho que não é seu…",
          "Afinando as cores de outra mente",
          "O sonho está tomando forma",
        ]}
      />
    );
  }

  if (state.phase === "error") {
    return (
      <main className="relative z-10 flex min-h-full flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <Panel className="max-w-md px-8 py-10">
          <h1 className="glow-text font-display text-3xl font-light">
            Sonho perdido no éter
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-mist">
            {state.message}
          </p>
          <Button href="/create" className="mt-8">
            Sonhar o seu próprio
          </Button>
        </Panel>
      </main>
    );
  }

  const { world } = state;

  return (
    <main className="fixed inset-0 overflow-hidden bg-void">
      {/* The navigable 3D stage, presented as a finished gift. */}
      <DreamScene world={world} readOnly />

      {/* Film grain over the live scene (body::before is occluded by bg-void). */}
      <div aria-hidden="true" className="dream-grain pointer-events-none absolute inset-0 z-[5]" />

      {/* Legibility scrim behind the floating title (no blur — glass is banned). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[6] h-32"
        style={{
          background:
            "linear-gradient(to bottom, oklch(13% 0.01 296 / 0.72), transparent)",
        }}
      />

      {/* Title — top, non-interactive so it never steals pointer/orbit. */}
      <header
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center px-6 pt-[calc(env(safe-area-inset-top)+1.25rem)]",
          "transition-opacity duration-700 motion-reduce:transition-none",
          opened ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="pointer-events-auto max-w-[90vw] text-center">
          <h1 className="glow-text font-display text-2xl font-light leading-tight sm:text-3xl">
            {world.title || "Sonho sem título"}
          </h1>
        </div>
      </header>

      {/* Bottom: the leitura + attribution + CTA. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pr-16 sm:px-6 sm:pr-6",
          "transition-opacity duration-700 delay-150 motion-reduce:transition-none",
          opened ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="pointer-events-auto flex max-h-[70vh] w-full max-w-xl flex-col items-center gap-4 overflow-y-auto">
          <DreamReading world={world} defaultOpen />
          <div className="flex flex-col items-center gap-3">
            <Button href="/create">Sonhar o seu próprio</Button>
            <Link
              href="/"
              className="rounded-full px-3 py-1 font-sans text-xs tracking-[0.18em] text-whisper transition-colors hover:text-haze"
              style={{ background: "oklch(13% 0.01 296 / 0.55)" }}
            >
              feito com <span className="text-gold-pale">Oneiro</span>
            </Link>
          </div>
        </div>
      </div>

      {/* The reveal: a void veil carrying the title, lifted by a tap. The gift
          moment may wear the crystalline dream-light; chrome stays gold. */}
      <RevealVeil title={world.title} opened={opened} onOpen={() => setOpened(true)} />
    </main>
  );
}

function RevealVeil({
  title,
  opened,
  onOpen,
}: {
  title: string;
  opened: boolean;
  onOpen: () => void;
}) {
  // Reduced-motion: open instantly with no lingering veil.
  useEffect(() => {
    if (prefersReducedMotion()) onOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      aria-hidden={opened}
      className={cn(
        "absolute inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-void px-6 text-center",
        "transition-[opacity,filter] duration-[900ms] ease-out motion-reduce:transition-none",
        opened
          ? "pointer-events-none opacity-0 [filter:blur(12px)]"
          : "opacity-100",
      )}
    >
      {/* one restrained crystalline wash — the colour of dreaming itself */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(closest-side, oklch(68% 0.17 300 / 0.16), transparent 70%)",
        }}
      />
      <div className="relative">
        <h1 className="glow-text mx-auto max-w-[16ch] font-display text-[clamp(2.25rem,8vw,4.5rem)] font-light leading-[1.05] tracking-tight">
          {title || "Um sonho"}
        </h1>
      </div>
      <Button onClick={onOpen} size="lg" className="relative">
        abrir o sonho
      </Button>
    </div>
  );
}
