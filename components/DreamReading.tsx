"use client";

// @/components/DreamReading.tsx
// The dream's "leitura" — a short poetic reading of its symbolic/emotional
// meaning, plus one line per form that inhabits it. A flat, hairline panel with
// a single gold accent; collapsible so it never crowds the silent wander.
//
// The reading usually rides on the World (world.reading / element.meaning). When
// a world was persisted before readings existed, this resolves one on demand via
// POST /api/interpret (which now also returns reading + per-element meaning) and
// best-effort caches it back through /api/share so gift links inherit it.

import { useEffect, useMemo, useRef, useState } from "react";
import type { World } from "@/lib/world";
import { Panel, cn } from "@/components/ui";

export interface DreamReadingProps {
  world: World;
  /** Start expanded (the gift view opens it; the dream view toggles it in). */
  defaultOpen?: boolean;
  className?: string;
}

interface InterpretElement {
  name: string;
  meaning?: string;
}
interface InterpretResponse {
  reading?: string;
  elements?: InterpretElement[];
}

export default function DreamReading({
  world,
  defaultOpen = true,
  className,
}: DreamReadingProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [reading, setReading] = useState(world.reading ?? "");
  const [meanings, setMeanings] = useState<Record<string, string>>(() =>
    seedMeanings(world),
  );
  const [resolving, setResolving] = useState(false);
  const resolvedForRef = useRef<string | null>(null);

  // Resolve a reading on demand for legacy worlds that never stored one.
  useEffect(() => {
    const hasReading = (world.reading ?? "").trim().length > 0;
    if (hasReading || !world.dreamText.trim()) return;
    if (resolvedForRef.current === world.id) return;
    resolvedForRef.current = world.id;

    let alive = true;
    const controller = new AbortController();
    setResolving(true);

    (async () => {
      try {
        const res = await fetch("/api/interpret", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dreamText: world.dreamText }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as InterpretResponse;
        if (!alive) return;

        const nextReading = (data.reading ?? "").trim();
        const nextMeanings = { ...seedMeanings(world) };
        for (const el of data.elements ?? []) {
          if (el?.name && el.meaning) {
            nextMeanings[el.name.toLowerCase()] = el.meaning;
          }
        }
        if (nextReading) setReading(nextReading);
        setMeanings(nextMeanings);

        // Best-effort cache so reloads + gift links carry the reading.
        if (nextReading) {
          const enriched: World = {
            ...world,
            reading: nextReading,
            elements: world.elements.map((e) => ({
              ...e,
              meaning: nextMeanings[e.name.toLowerCase()] ?? e.meaning,
            })),
          };
          fetch("/api/share", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ world: enriched }),
          }).catch(() => {});
        }
      } catch {
        /* silent — the panel simply shows what it has */
      } finally {
        if (alive) setResolving(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [world]);

  const elementRows = useMemo(
    () =>
      world.elements
        .map((e) => ({
          name: e.name,
          meaning: meanings[e.name.toLowerCase()] ?? e.meaning ?? "",
        }))
        .filter((e) => e.meaning),
    [world.elements, meanings],
  );

  const hasBody = reading.trim().length > 0 || elementRows.length > 0;

  return (
    <Panel
      as="section"
      aria-label="Leitura do sonho"
      className={cn("w-full overflow-hidden", className)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-3">
          <span
            aria-hidden
            className="h-5 w-px bg-neon-gold"
            style={{ boxShadow: "0 0 10px oklch(84% 0.13 82 / 0.5)" }}
          />
          <span className="font-display text-xl font-light text-haze">
            Leitura do sonho
          </span>
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="px-5 pb-5">
          {reading.trim() ? (
            <p className="font-display text-lg font-light leading-relaxed text-haze sm:text-xl">
              {reading}
            </p>
          ) : resolving ? (
            <p className="text-sm text-whisper">decifrando o sonho…</p>
          ) : (
            <p className="text-sm text-whisper">
              Este sonho ainda não revelou sua leitura.
            </p>
          )}

          {elementRows.length > 0 && (
            <ul className="mt-5 flex flex-col gap-3 border-t border-hairline pt-5">
              {elementRows.map((e) => (
                <li key={e.name} className="flex flex-col gap-0.5">
                  <span className="font-display text-base text-gold-pale">
                    {e.name}
                  </span>
                  <span className="text-sm leading-snug text-mist">
                    {e.meaning}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!hasBody && resolving && (
            <p className="mt-4 text-sm text-whisper">decifrando o sonho…</p>
          )}
        </div>
      )}
    </Panel>
  );
}

/** Seed element meanings already carried on the world. */
function seedMeanings(world: World): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of world.elements) {
    if (e.meaning) out[e.name.toLowerCase()] = e.meaning;
  }
  return out;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn(
        "shrink-0 text-whisper transition-transform duration-200",
        open && "rotate-180",
      )}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
