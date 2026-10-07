"use client";

// @/components/DreamEditor.tsx
// A light, tasteful editor for the world currently in view. A toggled bottom
// sheet (opened from the dream chrome) that lets the dreamer, WITHOUT a full
// rebuild:
//   • rename the dream (title)
//   • change its mood + palette — re-derives the scene's StateVector look live
//     (fog / bloom / drift / lights), NO regeneration
//   • reposition any object with simple X/Y/Z controls (the scene reflects it
//     immediately — DreamObject reads element.position)
//   • REGENERATE one object ("deixar mais estranho") — the only metered action
//     here: POST /api/regenerate consumes 1 credit, then we poll the existing
//     /api/status and swap in the new GLB when it lands. The debit is shown.
//
// All edits flow up through `onChange(nextWorld)`; the parent owns persistence.
// Doctrine: one gold accent on chrome, hairlines, flat panel, small radii,
// crystalline hues stay in the scene — never here. Mobile-first.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MOODS,
  MOOD_PALETTES,
  type DreamElement,
  type Mood,
  type World,
} from "@/lib/world";
import { CREDITS_PER_OBJECT_EDIT } from "@/lib/pricing";
import { Panel, Button, IconButton, Chip, cn } from "@/components/ui";

export interface DreamEditorProps {
  /** The world being edited (the live copy the scene renders). */
  world: World;
  /** Whether the editor sheet is open. */
  open: boolean;
  /** Close the sheet. */
  onClose: () => void;
  /** Apply an edited world upward (parent re-renders the scene + persists). */
  onChange: (next: World) => void;
}

/* Client mirror of tripo's terminal statuses (that helper is server-only). */
const TERMINAL = new Set(["success", "failed", "banned", "expired", "cancelled"]);
const POLL_INTERVAL_MS = 2500;
const REGEN_TIMEOUT_MS = 180_000; // 3 min ceiling for a single object
const POS_MIN = -8;
const POS_MAX = 8;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

interface StatusResult {
  name: string;
  status: string;
  progress: number;
  modelUrl?: string;
}

type RegenPhase = "starting" | "generating" | "done" | "error" | "nocredits";
interface RegenState {
  id: string;
  phase: RegenPhase;
  progress: number;
  remaining?: number;
  message?: string;
}

const MOOD_LABELS: Record<Mood, string> = {
  serene: "sereno",
  eerie: "inquietante",
  euphoric: "eufórico",
  melancholic: "melancólico",
  surreal: "surreal",
};

export default function DreamEditor({
  world,
  open,
  onClose,
  onChange,
}: DreamEditorProps) {
  const [selId, setSelId] = useState<string | null>(null);
  const [regen, setRegen] = useState<RegenState | null>(null);

  // Latest world for the async poll loop (avoids a stale closure when a
  // regeneration finishes long after it started).
  const worldRef = useRef(world);
  worldRef.current = world;
  const busyRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /* ---- edit helpers -------------------------------------------------- */

  const setTitle = useCallback(
    (title: string) => onChange({ ...worldRef.current, title }),
    [onChange],
  );

  const setMood = useCallback(
    (mood: Mood) =>
      // Mood drives the StateVector; reset to its canonical palette so the look
      // re-derives coherently. Fine-tune the colors afterward if desired.
      onChange({ ...worldRef.current, mood, palette: { ...MOOD_PALETTES[mood] } }),
    [onChange],
  );

  const setBg = useCallback(
    (bg: string) =>
      onChange({
        ...worldRef.current,
        palette: { ...worldRef.current.palette, bg },
      }),
    [onChange],
  );

  const setAccent = useCallback(
    (index: number, color: string) => {
      const w = worldRef.current;
      const accents = [...w.palette.accents];
      accents[index] = color;
      onChange({ ...w, palette: { ...w.palette, accents } });
    },
    [onChange],
  );

  const setAxis = useCallback(
    (id: string, axis: 0 | 1 | 2, value: number) => {
      const w = worldRef.current;
      onChange({
        ...w,
        elements: w.elements.map((e) => {
          if (e.id !== id) return e;
          const position = [...e.position] as [number, number, number];
          position[axis] = clamp(value, POS_MIN, POS_MAX);
          return { ...e, position };
        }),
      });
    },
    [onChange],
  );

  /* ---- regenerate one object ("deixar mais estranho") ---------------- */

  const regenerate = useCallback(
    async (el: DreamElement) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setRegen({ id: el.id, phase: "starting", progress: 0 });

      try {
        let startRes: Response;
        try {
          startRes = await fetch("/api/regenerate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              elementId: el.id,
              elementPrompt: el.prompt || el.name,
              name: el.name,
              stranger: true,
            }),
          });
        } catch {
          setRegen({
            id: el.id,
            phase: "error",
            progress: 0,
            message: "Não consegui refazer agora. Tente de novo em instantes.",
          });
          return;
        }
        if (!aliveRef.current) return;

        if (startRes.status === 402) {
          const data = (await startRes.json().catch(() => null)) as
            | { remaining?: number }
            | null;
          setRegen({
            id: el.id,
            phase: "nocredits",
            progress: 0,
            remaining: data?.remaining ?? 0,
          });
          return;
        }
        if (!startRes.ok) {
          const data = (await startRes.json().catch(() => null)) as
            | { error?: string }
            | null;
          setRegen({
            id: el.id,
            phase: "error",
            progress: 0,
            message: data?.error ?? "Falha ao refazer o objeto.",
          });
          return;
        }

        const { taskId, remaining } = (await startRes.json()) as {
          taskId: string;
          name: string;
          remaining: number;
        };
        setRegen({ id: el.id, phase: "generating", progress: 0, remaining });

        /* poll the existing status route until the GLB lands or we time out */
        const startedAt = Date.now();
        while (aliveRef.current && Date.now() - startedAt < REGEN_TIMEOUT_MS) {
          let results: StatusResult[] = [];
          try {
            const res = await fetch("/api/status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tasks: [{ taskId, name: el.name }] }),
            });
            if (res.ok) results = (await res.json()) as StatusResult[];
          } catch {
            results = []; // a transient blip must not abort the whole poll
          }
          if (!aliveRef.current) return;

          const r = results[0];
          if (r) {
            setRegen((cur) =>
              cur && cur.id === el.id
                ? { ...cur, progress: clamp(r.progress, 0, 100) }
                : cur,
            );
            if (r.status === "success" && r.modelUrl) {
              const w = worldRef.current;
              onChange({
                ...w,
                elements: w.elements.map((e) =>
                  e.id === el.id ? { ...e, modelUrl: r.modelUrl } : e,
                ),
              });
              setRegen({ id: el.id, phase: "done", progress: 100, remaining });
              return;
            }
            if (TERMINAL.has(r.status)) {
              setRegen({
                id: el.id,
                phase: "error",
                progress: 0,
                remaining,
                message: "O objeto não quis renascer. Tente de novo.",
              });
              return;
            }
          }
          await sleep(POLL_INTERVAL_MS);
        }

        if (aliveRef.current) {
          setRegen((cur) =>
            cur && cur.id === el.id
              ? {
                  ...cur,
                  phase: "error",
                  message: "Demorou demais. Tente de novo.",
                }
              : cur,
          );
        }
      } finally {
        busyRef.current = false;
      }
    },
    [onChange],
  );

  if (!open) return null;

  const busy = regen?.phase === "starting" || regen?.phase === "generating";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:justify-start sm:px-6">
      <Panel className="pointer-events-auto flex max-h-[78vh] w-full max-w-md flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold text-haze">
              Editar sonho
            </h2>
            <p className="mt-0.5 text-xs text-whisper">
              molde sem refazer tudo — só o que você tocar muda
            </p>
          </div>
          <IconButton label="Fechar editor" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>

        {/* body */}
        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
          {/* Título */}
          <section className="flex flex-col gap-2">
            <Label>Título</Label>
            <input
              className="input"
              value={world.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome deste sonho"
              maxLength={80}
            />
          </section>

          {/* Clima & paleta */}
          <section className="flex flex-col gap-3">
            <Label>Clima</Label>
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMood(m)}
                  aria-pressed={world.mood === m}
                  className={cn(
                    "chip transition-colors",
                    world.mood === m
                      ? "chip-gold"
                      : "hover:border-hairline-gold hover:text-haze",
                  )}
                >
                  {MOOD_LABELS[m]}
                </button>
              ))}
            </div>

            <Label className="mt-1">Paleta</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Swatch label="Fundo" value={world.palette.bg} onChange={setBg} />
              {world.palette.accents.slice(0, 3).map((a, i) => (
                <Swatch
                  key={i}
                  label={`Acento ${i + 1}`}
                  value={a}
                  onChange={(c) => setAccent(i, c)}
                />
              ))}
            </div>
          </section>

          {/* Objetos */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Objetos</Label>
              <Chip gold title="Cada objeto refeito custa 1 crédito">
                {CREDITS_PER_OBJECT_EDIT} crédito / objeto
              </Chip>
            </div>

            {world.elements.length === 0 ? (
              <p className="text-sm text-whisper">Este sonho não tem objetos.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {world.elements.map((el) => {
                  const selected = selId === el.id;
                  const r = regen?.id === el.id ? regen : null;
                  return (
                    <li key={el.id} className="panel-inset overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setSelId(selected ? null : el.id)}
                        aria-expanded={selected}
                        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:text-haze"
                      >
                        <span className="min-w-0 truncate text-sm text-mist">
                          {el.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {r?.phase === "done" ? (
                            <span className="text-xs text-neon-gold">refeito</span>
                          ) : null}
                          <Chevron open={selected} />
                        </span>
                      </button>

                      {selected ? (
                        <div className="flex flex-col gap-4 border-t border-hairline px-3.5 py-3.5">
                          {/* reposition */}
                          <div className="flex flex-col gap-2.5">
                            <span className="text-xs text-whisper">Posição</span>
                            {(["X", "Y", "Z"] as const).map((axisLabel, axis) => (
                              <AxisSlider
                                key={axisLabel}
                                label={axisLabel}
                                value={el.position[axis]}
                                onChange={(v) =>
                                  setAxis(el.id, axis as 0 | 1 | 2, v)
                                }
                              />
                            ))}
                          </div>

                          {/* regenerate */}
                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              onClick={() => regenerate(el)}
                              disabled={busy}
                              className="self-start"
                            >
                              {r && (r.phase === "starting" || r.phase === "generating") ? (
                                <>
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-void/40 border-t-void" />
                                  refazendo
                                  {r.phase === "generating" ? ` · ${Math.round(r.progress)}%` : "…"}
                                </>
                              ) : (
                                <>
                                  <WandIcon />
                                  deixar mais estranho
                                </>
                              )}
                            </Button>

                            {r?.phase === "done" ? (
                              <p className="text-xs text-neon-gold">
                                ✓ renasceu
                                {typeof r.remaining === "number"
                                  ? ` · ${r.remaining} crédito${r.remaining === 1 ? "" : "s"} restante${r.remaining === 1 ? "" : "s"}`
                                  : ""}
                              </p>
                            ) : null}

                            {r?.phase === "nocredits" ? (
                              <div className="flex flex-col gap-1.5">
                                <p className="text-xs text-neon-rose">
                                  Sem créditos para refazer este objeto.
                                </p>
                                <Button href="/create" variant="ghost" size="sm" className="self-start">
                                  obter créditos
                                </Button>
                              </div>
                            ) : null}

                            {r?.phase === "error" ? (
                              <p className="text-xs text-neon-rose">
                                {r.message ?? "Falha ao refazer."}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Small local pieces
 * ------------------------------------------------------------------ */

function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-xs font-medium uppercase tracking-[0.12em] text-whisper",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Swatch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  // Native color input is only valid for #rrggbb; fall back gracefully so a
  // palette carrying a non-hex color never blanks the control.
  const hex = /^#([0-9a-f]{6})$/i.test(value) ? value : "#808080";
  return (
    <label className="flex cursor-pointer flex-col items-center gap-1" title={label}>
      <span
        className="relative block h-9 w-9 overflow-hidden rounded-[var(--radius-chip)] border border-hairline"
        style={{ background: value }}
      >
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
      <span className="text-[0.625rem] text-whisper">{label}</span>
    </label>
  );
}

function AxisSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-4 text-xs text-whisper">{label}</span>
      <input
        type="range"
        min={POS_MIN}
        max={POS_MAX}
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer"
        style={{ accentColor: "var(--color-neon-gold)" }}
        aria-label={`Posição ${label}`}
      />
      <span className="tnum w-10 text-right text-xs text-mist">
        {value.toFixed(1)}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * Inline icons (2px stroke; gold carried by currentColor).
 * ------------------------------------------------------------------ */

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function WandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 4V2M15 10V8M12.5 5.5h-2M19.5 5.5h-2M5 20l9-9M17 7l1.8-1.8" />
      <path d="M14 8l2 2" />
    </svg>
  );
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
      className="text-whisper transition-transform"
      style={{ transform: open ? "rotate(180deg)" : "none" }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
