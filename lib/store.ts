"use client";
// @/lib/store.ts
// CLIENT-side zustand store driving the build flow + the persisted diary.
// Every localStorage access is wrapped in try/catch so SSR, private mode and
// blocked storage degrade gracefully (the store still works in-memory).

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { DreamElement, Mood, Palette, World } from "@/lib/world";

/** The pipeline phase the app is currently in. */
export type Phase =
  | "idle"
  | "listening"
  | "interpreting"
  | "generating"
  | "ready";

/** A compact diary entry derived from a full World. */
export interface WorldSummary {
  id: string;
  title: string;
  mood: Mood;
  palette: Palette;
  createdAt: number;
  elementCount: number;
}

/** Per-element generation progress, keyed by element id (0-100). */
export type GenerationProgress = Record<string, number>;

export interface OneiroState {
  /* ---- build flow ---- */
  phase: Phase;
  /** The world currently being built / viewed (null when idle). */
  current: World | null;
  /** Raw transcript before interpretation. */
  transcript: string;
  /** Per-element generation progress (0-100). */
  progress: GenerationProgress;
  /** Last error surfaced to the UI, if any. */
  error: string | null;

  /* ---- diary (persisted) ---- */
  diary: WorldSummary[];

  /* ---- setters ---- */
  setPhase: (phase: Phase) => void;
  setTranscript: (transcript: string) => void;
  setCurrent: (world: World | null) => void;
  patchCurrent: (patch: Partial<World>) => void;
  updateElement: (id: string, patch: Partial<DreamElement>) => void;
  setElementProgress: (id: string, progress: number) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  /* ---- diary ops ---- */
  addToDiary: (world: World) => void;
  removeFromDiary: (id: string) => void;
  clearDiary: () => void;
}

function summarize(world: World): WorldSummary {
  return {
    id: world.id,
    title: world.title,
    mood: world.mood,
    palette: world.palette,
    createdAt: world.createdAt,
    elementCount: world.elements.length,
  };
}

/**
 * A StateStorage backed by localStorage, every operation guarded so it never
 * throws (returns null / no-ops when storage is unavailable).
 */
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(name, value);
    } catch {
      /* storage full / blocked — keep running in-memory */
    }
  },
  removeItem: (name) => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

export const useOneiroStore = create<OneiroState>()(
  persist(
    (set) => ({
      phase: "idle",
      current: null,
      transcript: "",
      progress: {},
      error: null,
      diary: [],

      setPhase: (phase) => set({ phase }),
      setTranscript: (transcript) => set({ transcript }),
      setCurrent: (world) => set({ current: world }),

      patchCurrent: (patch) =>
        set((s) => (s.current ? { current: { ...s.current, ...patch } } : s)),

      updateElement: (id, patch) =>
        set((s) => {
          if (!s.current) return s;
          return {
            current: {
              ...s.current,
              elements: s.current.elements.map((el) =>
                el.id === id ? { ...el, ...patch } : el,
              ),
            },
          };
        }),

      setElementProgress: (id, progress) =>
        set((s) => ({ progress: { ...s.progress, [id]: progress } })),

      setError: (error) => set({ error }),

      reset: () =>
        set({
          phase: "idle",
          current: null,
          transcript: "",
          progress: {},
          error: null,
        }),

      addToDiary: (world) =>
        set((s) => {
          const summary = summarize(world);
          const without = s.diary.filter((d) => d.id !== summary.id);
          // newest first
          return { diary: [summary, ...without] };
        }),

      removeFromDiary: (id) =>
        set((s) => ({ diary: s.diary.filter((d) => d.id !== id) })),

      clearDiary: () => set({ diary: [] }),
    }),
    {
      name: "oneiro-diary",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      // Only the diary is durable; in-flight build state stays in memory.
      partialize: (state) => ({ diary: state.diary }),
    },
  ),
);
