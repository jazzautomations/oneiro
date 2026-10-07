"use client";
// @/app/create/page.tsx
// The maker surface: a dreamy capture hero + <VoiceCapture>, and the full
// capture -> interpret -> generate -> persist -> navigate orchestration.
//
// Flow on submit:
//   1. phase "interpreting"  -> POST /api/interpret  -> InterpretedDream
//   2. build a World (deterministic ids + golden-angle layout from @/lib/world)
//   3. phase "generating"    -> POST /api/dream      -> one Tripo task/element
//   4. poll POST /api/status every ~2.5s, attaching modelUrls as they arrive
//      and feeding per-element progress into the store (drives <LoadingDream>)
//   5. on completion/timeout: persist (diary + /api/share) and route to the world
//
// Only `@/lib/world` (pure) is imported here — the server-only libs are reached
// exclusively through the API routes, so no keys ever touch the client bundle.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  layoutElements,
  newId,
  type DreamElement,
  type Mood,
  type Palette,
  type World,
} from "@/lib/world";
import { useOneiroStore } from "@/lib/store";
import VoiceCapture from "@/components/VoiceCapture";
import LoadingDream from "@/components/LoadingDream";
import DiaryGallery from "@/components/DiaryGallery";
import Onboarding from "@/components/Onboarding";
import Paywall from "@/components/Paywall";
import Shell from "@/components/Shell";

/* ------------------------------------------------------------------ *
 * API payload shapes (mirror the route contracts in app/api/*).
 * ------------------------------------------------------------------ */

interface InterpretResponse {
  title: string;
  mood: Mood;
  palette: Palette;
  reading?: string;
  elements: { name: string; prompt: string; meaning?: string }[];
}
interface DreamTask {
  name: string;
  taskId: string;
  error?: string;
}
interface DreamResponse {
  tasks: DreamTask[];
}
interface StatusResult {
  name: string;
  status: string;
  progress: number;
  modelUrl?: string;
}

/** Client mirror of tripo's isTerminalStatus (that helper is server-only). */
const TERMINAL = new Set([
  "success",
  "failed",
  "banned",
  "expired",
  "cancelled",
]);

const POLL_INTERVAL_MS = 2500;
// Tripo often sits at 99% for 20-30s before flipping to success; a tight ceiling
// cut models off there and left the dreamer with placeholder spheres. Give the
// slowest model room to land.
const GENERATION_TIMEOUT_MS = 240_000; // ~4 min safety ceiling

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function HomePage(): React.JSX.Element {
  const router = useRouter();
  const phase = useOneiroStore((s) => s.phase);
  const current = useOneiroStore((s) => s.current);
  const progress = useOneiroStore((s) => s.progress);

  // Opened when the metering gate denies a build (HTTP 402 from /api/dream).
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Guards against a double submit / overlapping build.
  const buildingRef = useRef(false);
  // Lets an unmount abort the in-flight poll loop.
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    // Returning to the landing clears any stale build state (keeps the diary).
    useOneiroStore.getState().reset();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const build = useCallback(
    async (dreamText: string) => {
      if (buildingRef.current) return;
      buildingRef.current = true;

      const store = useOneiroStore.getState();
      store.setError(null);
      store.setTranscript(dreamText);
      store.setPhase("interpreting");

      try {
        /* 1 — interpret ------------------------------------------------- */
        // Any failure here (network or server) collapses to one calm, on-voice
        // line. The typed dream is never lost — it lives in <VoiceCapture>'s own
        // state, so the dreamer can just tap again.
        let interpretRes: Response;
        try {
          interpretRes = await fetch("/api/interpret", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dreamText }),
          });
        } catch {
          throw new Error(
            "O sonho escapou por um instante. Seu texto continua aqui — toque de novo em “dar vida ao sonho”.",
          );
        }
        if (!interpretRes.ok) {
          throw new Error(
            "Não consegui ler seu sonho agora. Seu texto continua aqui — tente mais uma vez.",
          );
        }
        const interpreted = (await interpretRes.json()) as InterpretResponse;
        if (!aliveRef.current) return;

        /* 2 — build the World ------------------------------------------- */
        const createdAt = Date.now();
        const worldId = newId(`${dreamText}:${createdAt}`);

        const rawElements: DreamElement[] = interpreted.elements.map((e, i) => ({
          id: newId(`${worldId}:el:${i}:${e.name}`),
          name: e.name,
          prompt: e.prompt,
          meaning: e.meaning,
          position: [0, 0, 0],
          scale: 1,
          rotation: [0, 0, 0],
        }));
        const elements = layoutElements(rawElements, rawElements.length);

        const world: World = {
          id: worldId,
          title: interpreted.title,
          dreamText,
          mood: interpreted.mood,
          palette: interpreted.palette,
          reading: interpreted.reading,
          elements,
          createdAt,
        };

        store.setCurrent(world);
        // Seed every element at 0% so the loader shows the right denominator.
        for (const el of elements) store.setElementProgress(el.id, 0);
        store.setPhase("generating");

        /* 3 — kick off generation --------------------------------------- */
        let dreamRes: Response;
        try {
          dreamRes = await fetch("/api/dream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              elements: elements.map((el) => ({ name: el.name, prompt: el.prompt })),
            }),
          });
        } catch {
          throw new Error(
            "Não consegui dar forma ao sonho agora. Tente de novo em instantes.",
          );
        }
        // Out of credits: the server created NO Tripo tasks. Open the paywall
        // and bow out calmly — the dream text survives in <VoiceCapture>, so the
        // dreamer can build again right after buying credits.
        if (dreamRes.status === 402) {
          if (!aliveRef.current) return;
          store.setPhase("idle");
          setPaywallOpen(true);
          return;
        }
        if (!dreamRes.ok) {
          throw new Error(
            "Não consegui dar forma ao sonho agora. Tente de novo em instantes.",
          );
        }
        const { tasks } = (await dreamRes.json()) as DreamResponse;
        if (!aliveRef.current) return;

        // Zip tasks back onto their elements (same order as sent).
        const pollable = tasks
          .map((t, i) => ({
            elementId: elements[i]?.id ?? "",
            taskId: t.taskId,
            name: t.name,
          }))
          .filter((t) => t.elementId && t.taskId);

        // Elements whose creation failed will just stay as glowing placeholders.
        const done = new Set<string>();

        /* 4 — poll until terminal / timeout ----------------------------- */
        const startedAt = Date.now();
        while (
          aliveRef.current &&
          pollable.some((t) => !done.has(t.elementId)) &&
          Date.now() - startedAt < GENERATION_TIMEOUT_MS
        ) {
          const pending = pollable.filter((t) => !done.has(t.elementId));
          let results: StatusResult[] = [];
          try {
            const statusRes = await fetch("/api/status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tasks: pending.map((t) => ({ taskId: t.taskId, name: t.name })),
              }),
            });
            if (statusRes.ok) {
              results = (await statusRes.json()) as StatusResult[];
            }
          } catch {
            // A transient network blip must not abort the whole build.
            results = [];
          }
          if (!aliveRef.current) return;

          results.forEach((res, i) => {
            const target = pending[i];
            if (!target) return;
            const live = useOneiroStore.getState();
            live.setElementProgress(
              target.elementId,
              clamp(res.progress, 0, 100),
            );
            if (res.status === "success" && res.modelUrl) {
              live.updateElement(target.elementId, { modelUrl: res.modelUrl });
              live.setElementProgress(target.elementId, 100);
              done.add(target.elementId);
            } else if (TERMINAL.has(res.status)) {
              done.add(target.elementId);
            }
          });

          if (pollable.every((t) => done.has(t.elementId))) break;
          await sleep(POLL_INTERVAL_MS);
        }

        if (!aliveRef.current) return;

        /* 5 — persist + navigate ---------------------------------------- */
        const finalWorld = useOneiroStore.getState().current ?? world;
        store.addToDiary(finalWorld);
        store.setPhase("ready");

        // Persist server-side so the world survives reloads, direct links and
        // the gift flow. Non-fatal if it fails — the in-memory world still
        // powers the immediate navigation.
        try {
          await fetch("/api/share", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ world: finalWorld }),
          });
        } catch {
          /* ignore — GiftBar can retry the share on demand */
        }

        router.push(`/dream/${finalWorld.id}`);
      } catch (err) {
        if (!aliveRef.current) return;
        const message =
          err instanceof Error ? err.message : "Algo se desfez no caminho.";
        const live = useOneiroStore.getState();
        live.setError(message);
        live.setPhase("idle");
      } finally {
        buildingRef.current = false;
      }
    },
    [router],
  );

  const building = phase === "interpreting" || phase === "generating";

  // Aggregate per-element progress into one number for the loader.
  const aggregate = computeAggregate(current?.elements, progress);

  return (
    <main className="relative flex min-h-full flex-1 flex-col">
      {/* First-run intro — overlays the hero once, then persists a skip flag. */}
      <Onboarding />

      <Hero disabled={building} onSubmit={build} />

      {building && (
        <LoadingDream
          phase={phase}
          progress={phase === "generating" ? aggregate : undefined}
        />
      )}

      <Paywall open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </main>
  );
}

/* ------------------------------------------------------------------ *
 * Landing hero
 * ------------------------------------------------------------------ */

function Hero({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (dreamText: string) => void;
}) {
  const error = useOneiroStore((s) => s.error);

  return (
    <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-24 pt-[calc(env(safe-area-inset-top)+2rem)] sm:px-6 sm:pt-[calc(env(safe-area-inset-top)+3rem)]">
      {/* No ambient blob: the void's film-grain + single ember glow (body) is
          the entire atmosphere. The mic is the only warm light on the page. */}
      <Shell />

      <section className="flex flex-1 flex-col items-center justify-center py-12 text-center sm:py-16">
        <h1 className="glow-text font-display font-light leading-[1.05] tracking-tight text-[clamp(2.75rem,8vw,5.5rem)]">
          Conte um sonho.
          <br />
          Caminhe <span className="accent-word">dentro</span> dele.
        </h1>

        <div className="mt-14 w-full max-w-xl">
          <VoiceCapture onSubmit={onSubmit} disabled={disabled} />
          {error && (
            <p
              role="alert"
              className="mt-5 rounded-[var(--radius-control)] border border-neon-rose/40 bg-neon-rose/10 px-4 py-3 text-sm text-neon-rose"
            >
              {error}
            </p>
          )}
        </div>
      </section>

      <DiaryPreview />
    </div>
  );
}

/** A quiet glimpse of the collected dreams, below the fold. */
function DiaryPreview() {
  const diaryCount = useOneiroStore((s) => s.diary.length);
  if (diaryCount === 0) return null;

  return (
    <section className="mt-10">
      <div className="mb-5 flex items-end justify-between">
        <h2 className="font-display text-2xl font-semibold text-haze">
          sonhos guardados
        </h2>
        <Link
          href="/diary"
          className="group inline-flex items-center gap-1.5 text-sm text-mist transition-colors hover:text-haze"
        >
          ver todos
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
      </div>
      <DiaryGallery />
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function computeAggregate(
  elements: DreamElement[] | undefined,
  progress: Record<string, number>,
): number {
  if (!elements || elements.length === 0) return 0;
  const total = elements.reduce(
    (sum, el) => sum + clamp(progress[el.id] ?? 0, 0, 100),
    0,
  );
  return Math.round(total / elements.length);
}
