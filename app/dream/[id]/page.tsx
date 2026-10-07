"use client";
// @/app/dream/[id]/page.tsx
// The world viewer. Resolves a World by id — first from the in-memory store
// (the one just built, or a cached current), then by fetching the persisted
// copy from GET /api/share?id= — and renders it full-screen through
// <DreamScene>, under a quiet overlay chrome: the title, a way back to the
// diary, and three deliberate toggles — Leitura, Conversar, Presentear. All
// collapsed by default, so the first screen is the silent, navigable dream.
//
// Client-only: it reads the zustand store and talks to the share route. The
// server-only libs are never imported here.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { deserializeWorld, serializeWorld, type World } from "@/lib/world";
import { useOneiroStore } from "@/lib/store";
import DreamScene from "@/components/DreamScene";
import GiftBar from "@/components/GiftBar";
import DreamReading from "@/components/DreamReading";
import DreamChat from "@/components/DreamChat";
import DreamEditor from "@/components/DreamEditor";
import LoadingDream from "@/components/LoadingDream";
import { Button, IconButton, Panel, cn } from "@/components/ui";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; world: World }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export default function DreamPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let alive = true;

    if (!id) {
      setState({ kind: "missing" });
      return;
    }

    // 1 — the freshly built world (or one already in view) lives in the store.
    const current = useOneiroStore.getState().current;
    if (current && current.id === id) {
      setState({ kind: "ready", world: current });
      return;
    }

    // 2 — fall back to the persisted copy on the server.
    setState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        if (!alive) return;

        if (res.status === 404) {
          setState({ kind: "missing" });
          return;
        }
        if (!res.ok) {
          let message = "Não consegui recuperar este sonho.";
          try {
            const data = (await res.json()) as { error?: string };
            if (data.error) message = data.error;
          } catch {
            /* keep default */
          }
          setState({ kind: "error", message });
          return;
        }

        const raw = (await res.json()) as unknown;
        // Round-trip through the shared validator so a tampered/partial payload
        // can never crash the scene.
        const world = deserializeWorld(serializeWorld(raw as World));
        if (!alive) return;

        // Cache it as the current world so re-navigation is instant.
        useOneiroStore.getState().setCurrent(world);
        setState({ kind: "ready", world });
      } catch (err) {
        if (!alive) return;
        const message =
          err instanceof Error ? err.message : "Não consegui recuperar este sonho.";
        setState({ kind: "error", message });
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  if (state.kind === "loading") {
    return (
      <LoadingDream
        phase="interpreting"
        messages={[
          "reabrindo o sonho…",
          "recompondo as formas…",
          "acendendo as cores…",
        ]}
      />
    );
  }

  if (state.kind === "missing" || state.kind === "error") {
    return (
      <main className="relative z-10 flex min-h-full flex-1 flex-col items-center justify-center px-6 text-center">
        <Panel className="max-w-md px-8 py-10">
          <h1 className="glow-text font-display text-3xl font-light sm:text-4xl">
            {state.kind === "missing" ? "este sonho se dissipou" : "algo se desfez"}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-mist">
            {state.kind === "missing"
              ? "Não encontramos nenhum sonho com este endereço. Talvez ele nunca tenha sido guardado, ou o link esteja incompleto."
              : state.message}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button href="/create">sonhar de novo</Button>
            <Button href="/diary" variant="ghost">
              seu diário
            </Button>
          </div>
        </Panel>
      </main>
    );
  }

  // state.kind === "ready" — hand off to an editable view keyed by id, so each
  // dream mounts fresh and edits never leak between worlds.
  return <ReadyDream key={state.world.id} initialWorld={state.world} />;
}

/* ------------------------------------------------------------------ *
 * ReadyDream — the live world viewer. Holds the editable world so the
 * DreamEditor's changes (title, palette/mood, object position, a
 * regenerated object) re-render <DreamScene> immediately, cache into the
 * store and persist (debounced) to /api/share.
 * ------------------------------------------------------------------ */

function ReadyDream({ initialWorld }: { initialWorld: World }): React.JSX.Element {
  const [world, setWorld] = useState<World>(initialWorld);
  const [showReading, setShowReading] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Apply an edit: update the scene now, cache in the store, and persist the
  // world (debounced) so a reload / direct link / gift carries the changes.
  const applyEdit = useCallback((next: World) => {
    setWorld(next);
    try {
      useOneiroStore.getState().setCurrent(next);
    } catch {
      /* store is best-effort */
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        useOneiroStore.getState().addToDiary(next);
      } catch {
        /* ignore */
      }
      void fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ world: next }),
      }).catch(() => {
        /* non-fatal — the in-memory world still drives the view */
      });
    }, 900);
  }, []);

  return (
    <main className="fixed inset-0 h-full w-full overflow-hidden bg-void">
      {/* The navigable world fills the viewport. */}
      <DreamScene world={world} readOnly />

      {/* Film grain — the oniric texture, carried onto the live scene (the
          body::before grain is occluded by the opaque bg-void above it). */}
      <div aria-hidden="true" className="dream-grain pointer-events-none absolute inset-0 z-[5]" />

      {/* Legibility scrim: a soft void fade so the top chrome stays readable
          over a bright/crystalline frame of the sky (no blur — glass is banned). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32"
        style={{
          background:
            "linear-gradient(to bottom, oklch(13% 0.01 296 / 0.72), transparent)",
        }}
      />

      {/* Top overlay: identity + title (left) and the control cluster (right). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 pb-4 pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] sm:gap-4 sm:pl-[calc(env(safe-area-inset-left)+1.25rem)] sm:pr-[calc(env(safe-area-inset-right)+1.25rem)] sm:pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <div className="pointer-events-auto min-w-0">
          <Link
            href="/"
            className="font-display text-base text-haze/90 transition hover:text-haze"
          >
            Oneiro
          </Link>
          <h1 className="glow-text max-w-[60vw] truncate font-display text-xl font-light leading-tight sm:text-2xl">
            {world.title}
          </h1>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <Toggle
            label="Editar sonho"
            active={showEdit}
            onClick={() => setShowEdit((v) => !v)}
          >
            <EditIcon />
          </Toggle>
          <Toggle
            label="Leitura do sonho"
            active={showReading}
            onClick={() => setShowReading((v) => !v)}
          >
            <BookIcon />
          </Toggle>
          <Toggle
            label="Conversar com o sonho"
            active={showChat}
            onClick={() => setShowChat((v) => !v)}
          >
            <ChatIcon />
          </Toggle>
          <Toggle
            label="Presentear este sonho"
            active={showGift}
            onClick={() => setShowGift((v) => !v)}
          >
            <GiftIcon />
          </Toggle>
          <Link href="/diary" aria-label="Voltar ao diário" className="icon-btn">
            <DiaryIcon />
          </Link>
        </div>
      </div>

      {/* Bottom sheet: Leitura and/or Presentear, stacked and centered. The
          sides stay click-through so the wander never gets boxed in. */}
      {(showReading || showGift) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 sm:pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <div className="pointer-events-auto flex max-h-[72vh] w-full max-w-xl flex-col gap-3 overflow-y-auto">
            {showReading && <DreamReading world={world} defaultOpen />}
            {showGift && <GiftBar world={world} />}
          </div>
        </div>
      )}

      {/* Right dock: conversar com o sonho. No scrim — silence persists behind. */}
      <DreamChat world={world} open={showChat} onClose={() => setShowChat(false)} />

      {/* Bottom-left sheet: the light editor. Molds the live world in place. */}
      <DreamEditor
        world={world}
        open={showEdit}
        onClose={() => setShowEdit(false)}
        onChange={applyEdit}
      />
    </main>
  );
}

/* A square chrome toggle: gold when active, hairline otherwise. */
function Toggle({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <IconButton
      label={label}
      onClick={onClick}
      aria-pressed={active}
      className={cn(active && "border-hairline-gold text-neon-gold")}
    >
      {children}
    </IconButton>
  );
}

/* ------------------------------------------------------------------ *
 * Inline icons (2px stroke; gold carried by currentColor).
 * ------------------------------------------------------------------ */

function EditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5Z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.9 8.9 0 0 1-3.8-.8L3 20.5l1.3-4.3A8.3 8.3 0 0 1 3.5 11.5 8.4 8.4 0 0 1 12 3.2a8.4 8.4 0 0 1 9 8.3Z" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

function DiaryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h11a2 2 0 0 1 2 2v16l-7-3-7 3V5a2 2 0 0 1 1-1.7Z" />
    </svg>
  );
}
