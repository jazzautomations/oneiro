"use client";

// @/components/DiaryGallery.tsx
// The dream diary, reimagined as a DREAM-GRAPH — a constellation of kept worlds
// plotted the way LSD: Dream Emulator laid out its dream calendar: each night a
// point in an emotional field. Two axes carry the whole map:
//
//     x  →  calmo ....... intenso      (how charged the dream felt)
//     y  ↑  sombrio ..... luminoso     (how dark or radiant it was)
//
// A dream's mood fixes its region; a deterministic per-id jitter scatters
// same-mood nights so they never stack; the node is painted in the world's own
// palette, sized by how many things lived inside it, and faded by age so older
// nights recede like memory. A faint gold thread links them in the order they
// were dreamt. Clicking a node crosses back into that world (/dream/<id>).
//
// The constellation is a 2-D picture, so a plain list is always one tap away as
// the accessible, screen-reader-first reading of the same diary — and it is
// where a night can be forgotten.
//
// Data comes from the persisted zustand store (newest-first). That slice
// rehydrates from localStorage on the client, so first paint must match the
// server's empty render: we gate on `mounted` and show a quiet skeleton until
// the store wakes.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOneiroStore, type WorldSummary } from "@/lib/store";
import type { Mood } from "@/lib/world";
import { Button, Chip, Panel, cn } from "@/components/ui";

/* -------------------------------------------------------------------------- */
/*  Props                                                                      */
/* -------------------------------------------------------------------------- */

export interface DiaryGalleryProps {
  /** Optional heading shown above the diary. Pass null to hide it. */
  title?: string | null;
  /** Extra classes for the outer <section>. */
  className?: string;
}

type View = "graph" | "list";

const VIEW_KEY = "oneiro-diary-view";

const MOOD_LABELS: Record<Mood, string> = {
  serene: "sereno",
  eerie: "inquietante",
  euphoric: "eufórico",
  melancholic: "melancólico",
  surreal: "surreal",
};

/* -------------------------------------------------------------------------- */
/*  Emotional field — where each mood sits, before per-dream jitter.          */
/*  x: 0 calmo → 1 intenso   ·   y: 0 sombrio → 1 luminoso                     */
/* -------------------------------------------------------------------------- */

const MOOD_FIELD: Record<Mood, { x: number; y: number }> = {
  serene: { x: 0.24, y: 0.72 },
  melancholic: { x: 0.28, y: 0.24 },
  eerie: { x: 0.72, y: 0.3 },
  euphoric: { x: 0.8, y: 0.82 },
  surreal: { x: 0.52, y: 0.55 },
};

// Inner padding of the plot (percent) so edge nodes and the axis labels breathe.
// Kept wide enough that a boundary node's ~22px crystalline glow stays inside
// the panel's overflow-hidden clip instead of being hard-cut at the border.
const PAD = 14;

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function DiaryGallery({
  title = "Seu diário de sonhos",
  className = "",
}: DiaryGalleryProps) {
  const diary = useOneiroStore((s) => s.diary);
  const removeFromDiary = useOneiroStore((s) => s.removeFromDiary);

  // Guard against SSR/hydration mismatch of the persisted slice.
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<View>("graph");

  useEffect(() => {
    setMounted(true);
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "graph" || saved === "list") setView(saved);
    } catch {
      /* no stored preference — keep the default */
    }
  }, []);

  function chooseView(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* per-viewer convenience only; fine to lose */
    }
  }

  const hasDreams = mounted && diary.length > 0;

  return (
    <section className={cn("w-full", className)}>
      {/* Heading + view switch */}
      <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex items-end gap-3">
          {title ? (
            <h2 className="font-display text-2xl font-semibold text-haze sm:text-3xl">
              {title}
            </h2>
          ) : null}
          {hasDreams ? (
            <span className="tnum pb-1 text-sm text-whisper">
              {diary.length} {diary.length === 1 ? "noite" : "noites"}
            </span>
          ) : null}
        </div>

        {hasDreams ? (
          <ViewSwitch view={view} onChange={chooseView} />
        ) : null}
      </header>

      {!mounted ? (
        <Skeleton />
      ) : diary.length === 0 ? (
        <EmptyState />
      ) : view === "graph" ? (
        <DreamGraph entries={diary} />
      ) : (
        <DreamList entries={diary} onForget={removeFromDiary} />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  View switch — hairline segmented control, gold marks the active reading.  */
/* -------------------------------------------------------------------------- */

function ViewSwitch({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Modo de leitura do diário"
      className="inline-flex items-center gap-1 rounded-control border border-hairline p-1"
    >
      <SwitchButton
        active={view === "graph"}
        onClick={() => onChange("graph")}
        label="Ver como constelação"
      >
        <ConstellationIcon />
        Constelação
      </SwitchButton>
      <SwitchButton
        active={view === "list"}
        onClick={() => onChange("list")}
        label="Ver como lista"
      >
        <ListIcon />
        Lista
      </SwitchButton>
    </div>
  );
}

function SwitchButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-sm font-medium transition-colors duration-150",
        active
          ? "bg-neon-gold/10 text-gold-pale"
          : "text-whisper hover:text-mist",
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  The dream-graph                                                            */
/* -------------------------------------------------------------------------- */

interface Placed extends WorldSummary {
  /** screen position inside the plot, in percent */
  left: number;
  top: number;
  /** disc diameter, px */
  size: number;
  /** recency fade, 1 (newest) → ~0.58 (oldest) */
  fade: number;
  color: string;
}

function DreamGraph({ entries }: { entries: WorldSummary[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const placed = useMemo<Placed[]>(() => {
    const n = entries.length;
    return entries.map((e, i) => {
      const base = MOOD_FIELD[e.mood] ?? MOOD_FIELD.surreal;
      const [jx, jy] = jitter(e.id);
      const x = clamp01(base.x + jx * 0.1);
      const y = clamp01(base.y + jy * 0.1);
      const span = 100 - PAD * 2;
      return {
        ...e,
        left: PAD + x * span,
        top: PAD + (1 - y) * span, // y up = luminoso = top
        size: 16 + Math.min(10, e.elementCount) * 1.7,
        fade: n <= 1 ? 1 : 1 - (i / (n - 1)) * 0.42,
        color: nodeColor(e),
      };
    });
  }, [entries]);

  // The thread of nights, oldest → newest (entries are newest-first).
  const thread = useMemo(
    () =>
      [...placed]
        .reverse()
        .map((p) => `${p.left.toFixed(2)},${p.top.toFixed(2)}`)
        .join(" "),
    [placed],
  );

  const active = placed.find((p) => p.id === activeId) ?? null;

  return (
    <figure className="m-0">
      <Panel className="relative overflow-hidden p-0">
        {/* The field */}
        <div className="relative aspect-[4/5] w-full sm:aspect-[16/9]">
          {/* Axes + thread (geometry only, never catches the pointer) */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
          >
            {/* centre cross */}
            <line
              x1="50" y1={PAD} x2="50" y2={100 - PAD}
              stroke="var(--color-hairline)" strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={PAD} y1="50" x2={100 - PAD} y2="50"
              stroke="var(--color-hairline)" strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            {/* the thread of nights */}
            {placed.length > 1 ? (
              <polyline
                points={thread}
                fill="none"
                stroke="var(--color-hairline-gold)"
                strokeWidth="1"
                strokeDasharray="2 4"
                strokeLinecap="round"
                opacity="0.5"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>

          {/* Axis legends */}
          <AxisLabel className="left-1/2 top-2 -translate-x-1/2">luminoso</AxisLabel>
          <AxisLabel className="bottom-2 left-1/2 -translate-x-1/2">sombrio</AxisLabel>
          <AxisLabel className="left-3 top-1/2 -translate-y-1/2">calmo</AxisLabel>
          <AxisLabel className="right-3 top-1/2 -translate-y-1/2">intenso</AxisLabel>

          {/* Nodes */}
          {placed.map((p) => (
            <GraphNode
              key={p.id}
              node={p}
              active={p.id === activeId}
              dimmed={activeId !== null && p.id !== activeId}
              onEnter={() => setActiveId(p.id)}
              onLeave={() => setActiveId((cur) => (cur === p.id ? null : cur))}
            />
          ))}
        </div>

        {/* Readout — stable height so hovering never shifts the layout */}
        <figcaption className="flex min-h-[3.25rem] items-center gap-3 border-t border-hairline px-4 py-3 sm:px-5">
          {active ? (
            <>
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: active.color,
                  boxShadow: `0 0 10px ${hexA(active.color, 0.7)}`,
                }}
              />
              <span className="min-w-0 flex-1 truncate font-display text-base text-haze">
                {active.title || "Sonho sem título"}
              </span>
              <Chip className="shrink-0">{MOOD_LABELS[active.mood]}</Chip>
              <span className="tnum hidden shrink-0 text-xs text-whisper sm:inline">
                {formatDate(active.createdAt)}
              </span>
            </>
          ) : (
            <span className="text-sm text-whisper">
              Cada ponto é uma noite. Percorra a constelação — toque para
              atravessá-la.
            </span>
          )}
        </figcaption>
      </Panel>
    </figure>
  );
}

function GraphNode({
  node,
  active,
  dimmed,
  onEnter,
  onLeave,
}: {
  node: Placed;
  active: boolean;
  dimmed: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const label = `${node.title || "Sonho sem título"} — ${MOOD_LABELS[node.mood]}, ${formatDate(node.createdAt)}`;

  return (
    <Link
      href={`/dream/${node.id}`}
      aria-label={label}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      style={{ left: `${node.left}%`, top: `${node.top}%` }}
      className={cn(
        "group absolute block -translate-x-1/2 -translate-y-1/2 rounded-full outline-none transition-opacity duration-300 motion-reduce:transition-none",
        dimmed ? "opacity-40" : null,
      )}
    >
      {/* the dream itself */}
      <span
        aria-hidden="true"
        className={cn(
          "block rounded-full transition-transform duration-200 ease-out motion-reduce:transition-none",
          active ? "scale-125" : "group-hover:scale-110",
        )}
        style={{
          width: node.size,
          height: node.size,
          opacity: node.fade,
          backgroundColor: node.color,
          boxShadow: active
            ? `0 0 0 3px var(--color-void), 0 0 0 4px ${hexA(node.color, 0.9)}, 0 0 22px ${hexA(node.color, 0.85)}`
            : `0 0 14px ${hexA(node.color, 0.6)}`,
        }}
      />
    </Link>
  );
}

function AxisLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute text-[0.625rem] font-semibold uppercase tracking-[0.3em] text-whisper",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  The list — the accessible reading, and where a night is forgotten.        */
/* -------------------------------------------------------------------------- */

function DreamList({
  entries,
  onForget,
}: {
  entries: WorldSummary[];
  onForget: (id: string) => void;
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => (
        <li key={entry.id} className="group relative">
          <Link
            href={`/dream/${entry.id}`}
            className="panel block h-full overflow-hidden p-5 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-hairline-gold motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            {/* a whisper of the world's own palette, low in the card */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-20 opacity-60 transition-opacity duration-300 group-hover:opacity-90 motion-reduce:transition-none"
              style={{
                backgroundImage: `radial-gradient(90% 140% at 50% 160%, ${hexA(
                  nodeColor(entry),
                  0.3,
                )}, transparent 70%)`,
              }}
            />
            <div className="relative flex h-full flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <Chip>{MOOD_LABELS[entry.mood]}</Chip>
                <span className="tnum pt-0.5 text-xs text-whisper">
                  {formatDate(entry.createdAt)}
                </span>
              </div>

              <h3 className="line-clamp-2 font-display text-xl leading-snug text-haze">
                {entry.title || "Sonho sem título"}
              </h3>

              <div className="mt-auto flex items-center justify-between gap-3">
                <PaletteSwatch
                  accents={
                    entry.palette.accents.length
                      ? entry.palette.accents
                      : [entry.palette.fog, entry.palette.bg]
                  }
                />
                <span className="tnum text-xs text-whisper">
                  {entry.elementCount}{" "}
                  {entry.elementCount === 1 ? "elemento" : "elementos"}
                </span>
              </div>
            </div>
          </Link>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onForget(entry.id);
            }}
            aria-label={`Esquecer "${entry.title || "sonho"}"`}
            className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-chip border border-hairline bg-void/80 text-whisper opacity-0 transition-colors duration-150 hover:border-neon-rose/60 hover:text-neon-rose focus-visible:opacity-100 group-hover:opacity-100"
          >
            <ForgetIcon />
          </button>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*  Palette swatch (world content colors — not chrome)                         */
/* -------------------------------------------------------------------------- */

function PaletteSwatch({ accents }: { accents: string[] }) {
  const colors = accents.slice(0, 5);
  return (
    <div className="flex items-center" aria-hidden="true">
      {colors.map((c, i) => (
        <span
          key={`${c}-${i}`}
          className="-ml-1.5 h-5 w-5 rounded-full ring-2 ring-abyss first:ml-0"
          style={{
            backgroundColor: c,
            boxShadow: `0 0 10px ${hexA(c, 0.55)}`,
            zIndex: colors.length - i,
          }}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty / loading                                                            */
/* -------------------------------------------------------------------------- */

function EmptyState() {
  return (
    <Panel className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <MoonIcon />
      <p className="font-display text-xl text-haze">
        Nenhuma noite mapeada ainda
      </p>
      <p className="max-w-sm text-sm leading-relaxed text-mist">
        Conte um sonho em voz alta e ele nascerá aqui como um ponto na
        constelação — um mundo que você pode atravessar.
      </p>
      <Button href="/create" size="sm" className="mt-2">
        Sonhar o primeiro
      </Button>
    </Panel>
  );
}

function Skeleton() {
  return (
    <Panel
      className="aspect-[4/5] w-full animate-dream-pulse sm:aspect-[16/9]"
      aria-hidden="true"
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** The dream's own leading palette color — content, so crystalline is fine. */
function nodeColor(e: WorldSummary): string {
  return (
    e.palette.accents[0] ||
    e.palette.fog ||
    e.palette.bg ||
    "var(--color-neon-gold)"
  );
}

/**
 * Deterministic per-id scatter in [-1, 1]² (FNV-1a over the id, no entropy) so
 * same-mood dreams never stack but reproduce exactly on every render.
 */
function jitter(id: string): [number, number] {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const a = ((h >>> 0) % 2000) / 1000 - 1;
  const b = (((Math.imul(h, 0x01000193) ^ 0x9e3779b9) >>> 0) % 2000) / 1000 - 1;
  return [a, b];
}

function formatDate(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleDateString();
  }
}

/** Expand a #rgb/#rrggbb hex into an rgba() string; pass through anything else. */
function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const int = Number.parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(int)) return hex;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* -------------------------------------------------------------------------- */
/*  Inline icons                                                               */
/* -------------------------------------------------------------------------- */

function ConstellationIcon() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="m5 7 6 4 8-5" opacity="0.5" />
      <path d="m11 11 3 7" opacity="0.5" />
      <circle cx="5" cy="7" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="11" cy="11" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="14" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  );
}

function ForgetIcon() {
  return (
    <svg
      width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="38" height="38" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className="text-neon-gold"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
