"use client";

// @/components/DreamScene.tsx
// The navigable 3D dreamscape — a DREAM EMULATOR, not a demo.
//
// No goals, no fail state: you drift, weightless and first-person, through a
// world of soft glowing objects under a crystalline aurora. The collection of
// saved dreams becomes ONE endless, interlinked dreamscape:
//
//   • DRIFT camera (default) — a slow floating wander; ORBIT is a toggle.
//   • WARP BETWEEN DREAMS — approaching or clicking an object triggers a
//     crystalline bloom / white-flash that morphs the whole world into another
//     saved dream from the diary (palette + mood + fog). With a single dream
//     saved, the warp re-seeds mood/palette so there is always somewhere to go.
//   • SURREAL SHIFTS — on a slow timer the palette/fog/aurora pulse and breathe.
//   • WHISPERS — nearing or looking at an object reveals its name + a one-line
//     poetic meaning as floating subtitle text that fades.
//
// The crystalline aurora + bloom / vignette / chromatic-aberration / grain
// post-fx all live here (this is the dream moment). Server-only libs are never
// imported; the diary is read from the client zustand store.

import {
  useRef,
  useMemo,
  useState,
  useEffect,
  useCallback,
  Suspense,
} from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, Lightformer } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
  Noise,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import type { BloomEffect } from "postprocessing";
import * as THREE from "three";
import type { Mood, Palette, SceneParams, StateVector, World } from "@/lib/world";
import { MOODS, MOOD_PALETTES, moodToState, deriveSceneParams } from "@/lib/world";
import {
  CRYSTAL_VIOLET,
  CRYSTAL_CYAN,
  EMBER,
  GOLD_PALE,
  SCENE_FOG,
  SCENE_GROUND,
} from "@/lib/palette";
import { useOneiroStore } from "@/lib/store";
import DreamSky, { type SceneFx } from "@/components/DreamSky";
import DreamObject from "@/components/DreamObject";

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

export interface DreamSceneProps {
  /** The dream world to render. Elements are expected to carry their layout. */
  world: World;
  /**
   * When true the stage is a finished, shareable experience: the ambient drone
   * starts on first gesture. Navigation + warps work the same either way.
   * Defaults to false (authoring view).
   */
  readOnly?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Small helpers                                                             */
/* -------------------------------------------------------------------------- */

function safeColor(value: string | undefined, fallback: string): THREE.Color {
  const c = new THREE.Color();
  try {
    c.set(value && value.trim() ? value : fallback);
  } catch {
    c.set(fallback);
  }
  return c;
}

/** #rrggbb → "r, g, b"; used to build the warp veil from the shared palette. */
function rgbTriplet(hex: string): string {
  const h = hex.replace("#", "");
  const int = Number.parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

// The DOM warp veil — ONE crystalline bloom shared with the in-shader flash
// (DreamSky mixes toward crystal-cyan, never a clinical white). Built from the
// single source of truth in @/lib/palette so the DOM + shader agree.
const WARP_VEIL = `radial-gradient(60% 60% at 50% 45%, rgba(204, 241, 252, 0.92), rgba(${rgbTriplet(
  CRYSTAL_VIOLET,
)}, 0.45) 45%, rgba(${rgbTriplet(CRYSTAL_CYAN)}, 0.12) 70%, transparent 85%)`;

function hash32(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Poetic one-line whispers (pt-BR). Deterministic per element so the same
// object always murmurs the same line. One line doubles as the warp cue.
const WHISPER_LINES: ((name: string) => string)[] = [
  (n) => `${n} — o que ficou quando você acordou`,
  (n) => `${n} respira devagar, à sua espera`,
  (n) => `toque ${n} e caia no próximo sonho`,
  (n) => `${n} lembra de algo que você esqueceu`,
  (n) => `${n} não existe quando é dia`,
  (n) => `siga ${n} até a borda do sono`,
  (n) => `${n} guarda um fim que nunca chega`,
  (n) => `${n} é o formato de uma saudade`,
];

function whisperLine(id: string, name: string): string {
  return WHISPER_LINES[hash32(id) % WHISPER_LINES.length](name);
}

/** Hue-rotate a palette into a believable "other dream" (warp re-seed). */
function reseedPalette(base: Palette, mood: Mood): Palette {
  const shift = (hex: string, dh: number, dl: number) => {
    const c = safeColor(hex, SCENE_GROUND);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL((hsl.h + dh + 1) % 1, Math.min(1, hsl.s * 0.9 + 0.08), THREE.MathUtils.clamp(hsl.l + dl, 0.02, 0.95));
    return `#${c.getHexString()}`;
  };
  const moodPal = MOOD_PALETTES[mood];
  return {
    bg: shift(base.bg, 0.12, -0.01),
    fog: shift(base.fog, 0.12, 0.0),
    accents: (base.accents.length ? base.accents : moodPal.accents).map((a, i) =>
      shift(a, 0.18 + i * 0.07, 0.03),
    ),
  };
}

/** A warp destination: just enough of a dream to repaint the world. */
interface DreamStop {
  id: string;
  title: string;
  mood: Mood;
  palette: Palette;
}

/* -------------------------------------------------------------------------- */
/*  Vignette direction — the dream as a staged vignette, not a diorama        */
/* -------------------------------------------------------------------------- */
//
// A dream is an event that happens TO you, not a place you inspect. The scene
// runs as a fixed sequence (Kurosawa's episode grammar):
//
//   cartela — black title card: "Tive um sonho assim." + the title.
//   live    — the presence arrives from the fog to a procession cadence; you
//             wander as witness; the rule is stated once.
//   climax  — the rule is broken (you stared, or came too close, or the dream
//             simply ended): everything freezes and the presence turns to you.
//   cut     — a hard cut to black. The awakening IS the cut — never a menu.
//   note    — the morning annotation: the original account + night number.
//
// The director below mutates per-element "live channels" inside useFrame; the
// DreamObjects read them every frame, so none of this re-renders React.

type VignettePhase = "cartela" | "live" | "climax" | "cut" | "note";

/** Per-element live direction channel, read by DreamObject each frame. */
interface LiveChannel {
  offset: THREE.Vector3;
  face: number;
  freeze: number;
  stepPhase: number;
}

interface VignetteState {
  phase: VignettePhase;
  /** id of the presence — the largest element, the shite of this vignette. */
  presenceId: string | null;
  channels: Map<string, LiveChannel>;
  /** Live world-space position of the presence (gaze/proximity + debug). */
  presencePos: THREE.Vector3;
  /** Distance camera→presence, updated per frame (drives the step audio). */
  presenceDist: number;
  /** Accumulated seconds of sustained direct gaze on the presence. */
  gaze: number;
  /** clock time when the live phase began — dreams have a finite length. */
  liveAt: number;
  /** Called ONCE when the rule is broken or the dream's time runs out. */
  onBreak: () => void;
}

const DEFAULT_RULE = "ela sabe quando você olha";
/** The dream ends on its own after this long if you never break the rule. */
// Free exploration: the dream only ends when you choose to wake (button) —
// this is just a safety net so a forgotten tab still resolves.
const DREAM_LEN_S = 900;
/** Procession step period (s): 4 beats marching, 2 held still. */
const STEP_S = 1.15;

/** The presence of a world: the FIRST element of the account — the subject of
 * the dream (interpretation lists elements in salience order). Not the biggest
 * thing: a skyscraper is scenery, the ant is who walks it. */
function presenceIdOf(world: World): string | null {
  return world.elements[0]?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Lighting (morphs smoothly toward the active palette)                      */
/* -------------------------------------------------------------------------- */

function DreamLights({ palette }: { palette: Palette }) {
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  // Only the hemisphere's ground tint follows the world's (warm) fog; every
  // other light is a FIXED warm hue so no violet/cyan ever leaks into the scene
  // lighting (the crystalline hues are the sky shader's alone).
  const fogTarget = useMemo(
    () => safeColor(palette?.fog, SCENE_FOG),
    [palette?.fog],
  );

  useFrame((_state, delta) => {
    const k = 1 - Math.pow(0.02, Math.min(delta, 0.05));
    if (hemiRef.current) hemiRef.current.groundColor.lerp(fogTarget, k);
  });

  return (
    <>
      {/* Low ambient floor — the scene is carried by the key + IBL, not a wash. */}
      <ambientLight intensity={0.2} />
      {/* Desaturated-cool sky over warm-fog ground: cinematic fill, no rainbow. */}
      <hemisphereLight
        ref={hemiRef}
        intensity={0.5}
        color="#8a93a8"
        groundColor={SCENE_FOG}
      />
      {/* The one divine ember key light — steady, never pulsing. */}
      <directionalLight position={[5, 8, 3]} intensity={1.4} color={EMBER} />
      {/* Pale-gold rim from behind-high to carve silhouettes out of the void. */}
      <pointLight
        position={[-6, 4, -6]}
        intensity={0.8}
        color={GOLD_PALE}
        distance={55}
        decay={1.4}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  FirstPersonRig — you DRIVE the dream: drag to look, drift forward, WASD.   */
/*  A first-person wander in the spirit of LSD Dream Emulator — not a passive  */
/*  auto-orbit. Touch: drag to look around; it eases forward on its own.       */
/*  Desktop: mouse-drag to look, WASD / arrows to move. Bounded + proximity    */
/*  whisper/warp preserved.                                                    */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Ground — a warm floor that dissolves into the fog at the horizon          */
/* -------------------------------------------------------------------------- */
//
// Anti floating-blob: a large disc on y=0 gives every object a floor to stand
// on and a horizon to walk toward. A radial alpha fade (injected via
// onBeforeCompile) melts the disc's edge into the scene fog so there is no hard
// circular rim. The fade is derived from the local vertex radius rather than a
// uv varying, because a MeshStandardMaterial with no map does not declare vUv
// under WebGL2 — the normalized radius length(position.xy)/70 is the exact
// equivalent of the plan's distance(vUv, vec2(0.5)) term.
function DreamGround() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0} renderOrder={-500}>
      <circleGeometry args={[70, 96]} />
      <meshStandardMaterial
        color={SCENE_GROUND}
        roughness={0.9}
        metalness={0}
        transparent
        fog
        onBeforeCompile={(shader) => {
          shader.vertexShader =
            "varying vec2 vDwGround;\n" +
            shader.vertexShader.replace(
              "#include <begin_vertex>",
              "#include <begin_vertex>\n  vDwGround = position.xy / 70.0;",
            );
          shader.fragmentShader =
            "varying vec2 vDwGround;\n" +
            shader.fragmentShader.replace(
              "#include <dithering_fragment>",
              "gl_FragColor.a *= smoothstep(1.0, 0.32, length(vDwGround));\n  #include <dithering_fragment>",
            );
        }}
      />
    </mesh>
  );
}

const _ZERO = new THREE.Vector3();

function FirstPersonRig({
  world,
  calm,
  moveRef,
  onWhisper,
  frozen,
}: {
  world: World;
  calm: boolean;
  /** Mobile hold-to-walk: forward 0..1, driven by the ember orb button. */
  moveRef: React.RefObject<{ forward: number }>;
  onWhisper: (id: string | null) => void;
  /**
   * Dream paralysis — during cartela/climax/cut the body does not answer.
   * Movement input is swallowed and we glide to a stop.
   */
  frozen: boolean;
}) {
  const gl = useThree((s) => s.gl);

  // First-person look angles. Start looking toward the dream's center (-z).
  const yaw = useRef(0);
  const pitch = useRef(-0.04);
  // drag carries gesture discrimination: pointer id, accumulated travel, start
  // time — so we can tell a short TAP (→ warp) from a DRAG (→ look) or a HOLD.
  const drag = useRef<{
    active: boolean;
    id: number;
    x: number;
    y: number;
    moved: number;
    t0: number;
  }>({ active: false, id: -1, x: 0, y: 0, moved: 0, t0: 0 });
  const keys = useRef<Set<string>>(new Set());
  const lastWhisperId = useRef<string | null>(null);
  // Last time the wanderer gave ANY input; gates the gentle ambient drift.
  const lastInputRef = useRef(performance.now());
  const vel = useRef(new THREE.Vector3());
  const lastBob = useRef(0);

  // Radius of the object cloud, so the wander stays inside the dream.
  const bound = useMemo(() => {
    let max = 4;
    for (const e of world.elements) {
      const d = Math.hypot(e.position[0], e.position[1], e.position[2]);
      if (d > max) max = d;
    }
    return Math.min(max, 24);
  }, [world.elements]);

  // Drag-to-look (pointer = touch + mouse) and WASD/arrows, on the canvas.
  useEffect(() => {
    const el = gl.domElement;
    const SENS = 0.0035;
    const onDown = (e: PointerEvent) => {
      drag.current = {
        active: true,
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        moved: 0,
        t0: performance.now(),
      };
      lastInputRef.current = performance.now();
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.current.active || e.pointerId !== drag.current.id) return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      drag.current.moved += Math.abs(dx) + Math.abs(dy);
      // Only rotate once travel passes the tap threshold, so a still tap never
      // nudges the view.
      if (drag.current.moved > 6) {
        yaw.current -= dx * SENS;
        pitch.current = THREE.MathUtils.clamp(
          pitch.current - dy * SENS,
          -1.2,
          1.2,
        );
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === drag.current.id) drag.current.active = false;
    };
    // CAPTURE-phase click suppressor: swallow r3f's synthetic click (which would
    // warp) when the gesture was a drag or a hold — only a short, still tap warps.
    const onClickCapture = (e: MouseEvent) => {
      if (drag.current.moved > 6 || performance.now() - drag.current.t0 > 250) {
        e.stopImmediatePropagation();
      }
    };
    const MOVE_KEYS = new Set([
      "w", "a", "s", "d",
      "arrowup", "arrowdown", "arrowleft", "arrowright",
    ]);
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (MOVE_KEYS.has(k)) {
        keys.current.add(k);
        lastInputRef.current = performance.now();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase());
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClickCapture, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      keys.current.clear();
    };
  }, [gl]);

  const _fwd = useRef(new THREE.Vector3());
  const _right = useRef(new THREE.Vector3());
  const _move = useRef(new THREE.Vector3());
  const _euler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));

  useFrame((state, delta) => {
    const cam = state.camera;
    const dt = Math.min(delta, 0.05);
    const elapsed = state.clock.elapsedTime;

    // Orientation straight from the look angles (true first-person).
    _euler.current.set(pitch.current, yaw.current, 0, "YXZ");
    cam.quaternion.setFromEuler(_euler.current);

    _fwd.current.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _right.current.set(1, 0, 0).applyQuaternion(cam.quaternion);

    // Movement is INTENT only — no constant creep. WASD / arrows + mobile orb.
    const m = _move.current.set(0, 0, 0);
    if (!frozen) {
      const k = keys.current;
      if (k.has("w") || k.has("arrowup")) m.addScaledVector(_fwd.current, 1);
      if (k.has("s") || k.has("arrowdown")) m.addScaledVector(_fwd.current, -1);
      if (k.has("a") || k.has("arrowleft")) m.addScaledVector(_right.current, -1);
      if (k.has("d") || k.has("arrowright")) m.addScaledVector(_right.current, 1);
      const fwdHold = moveRef.current?.forward ?? 0;
      if (fwdHold > 0) {
        m.addScaledVector(_fwd.current, fwdHold);
        lastInputRef.current = performance.now();
      }
    }

    // Velocity inertia: deliberate input (WASD / orb) eases toward full walking
    // speed; with no input we glide to a stop. Movement is PURELY intentional —
    // no ambient creep, so the dream never moves you without your hand (that was
    // the "being dragged" feel we killed).
    if (m.lengthSq() > 1e-6) {
      m.normalize().multiplyScalar(calm ? 1.4 : 2.2);
      vel.current.lerp(m, 1 - Math.pow(0.0015, dt));
    } else {
      vel.current.lerp(_ZERO, 1 - Math.pow(0.0015, dt));
    }
    cam.position.addScaledVector(vel.current, dt);

    // Human eye-level band + head-bob that scales with speed. Remove last
    // frame's bob first so it never accumulates into the base height.
    cam.position.y -= lastBob.current;
    const clampedBaseY = THREE.MathUtils.clamp(cam.position.y, 1.35, 2.1);
    const spd = vel.current.length();
    const bob = Math.sin(elapsed * 9) * 0.035 * Math.min(1, spd / 2.2);
    cam.position.y = clampedBaseY + bob;
    lastBob.current = bob;

    const maxR = bound + 3.5;
    const horiz = Math.hypot(cam.position.x, cam.position.z);
    if (horiz > maxR) {
      const s = maxR / horiz;
      cam.position.x *= s;
      cam.position.z *= s;
    }

    // Nearest object → proximity WHISPER only. Warp is now a deliberate tap.
    let nearest: { id: string; d: number } | null = null;
    for (const e of world.elements) {
      const dx = e.position[0] - cam.position.x;
      const dy = e.position[1] - cam.position.y;
      const dz = e.position[2] - cam.position.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!nearest || d < nearest.d) nearest = { id: e.id, d };
    }

    const WHISPER_R = 5.5;
    if (nearest && nearest.d < WHISPER_R) {
      if (lastWhisperId.current !== nearest.id) {
        lastWhisperId.current = nearest.id;
        onWhisper(nearest.id);
      }
    } else if (lastWhisperId.current !== null) {
      lastWhisperId.current = null;
      onWhisper(null);
    }
  });

  return null;
}

/* -------------------------------------------------------------------------- */
/*  FX runner — eases the warp/aurora channel + surreal shift + bloom spike   */
/* -------------------------------------------------------------------------- */

function FxRunner({
  fx,
  target,
  bloomRef,
  calm,
  mobile,
  bloom,
}: {
  fx: React.RefObject<SceneFx>;
  target: React.RefObject<{ warp: number; aurora: number }>;
  bloomRef: React.RefObject<BloomEffect | null>;
  calm: boolean;
  mobile: boolean;
  /** Steady-state bloom from the StateVector (SceneParams.bloom, ~0.25..1.6). */
  bloom: number;
}) {
  useFrame((state, delta) => {
    const d = Math.min(delta, 0.05);
    const f = fx.current;
    if (!f) return;

    // Warp eases fast (punchy flash); aurora settles a touch slower.
    f.warp += (target.current.warp - f.warp) * (1 - Math.pow(0.0006, d));
    f.aurora += (target.current.aurora - f.aurora) * (1 - Math.pow(0.03, d));

    // Surreal shift: a slow raised-cosine pulse every ~24s (off when calm).
    if (calm) {
      f.shift = 0;
    } else {
      const PERIOD = 24;
      const DUR = 6;
      const ph = state.clock.elapsedTime % PERIOD;
      f.shift = ph < DUR ? 0.5 - 0.5 * Math.cos((ph / DUR) * Math.PI * 2) : 0;
    }

    if (bloomRef.current) {
      // Steady bloom is the state's bloom (mobile softens it); warp + surreal
      // shift spike on top as before.
      const base = bloom * (mobile ? 0.3 : 0.5);
      bloomRef.current.intensity =
        base + f.warp * (mobile ? 2.4 : 3.4) + f.shift * 0.45;
    }
  });
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Post-processing (bloom / vignette / chromatic aberration / grain)         */
/* -------------------------------------------------------------------------- */

function DreamEffects({
  mobile,
  bloomRef,
  chromaticAberration,
}: {
  mobile: boolean;
  bloomRef: React.RefObject<BloomEffect | null>;
  /** CA offset magnitude from the StateVector (SceneParams.chromaticAberration). */
  chromaticAberration: number;
}) {
  // Keep the subtle x:y asymmetry the scene shipped with (~1 : 1.83), scaled by
  // the state's chromatic-aberration knob.
  const caOffset = useMemo<[number, number]>(
    () => [chromaticAberration, chromaticAberration * 1.83],
    [chromaticAberration],
  );

  if (mobile) {
    return (
      <EffectComposer multisampling={0}>
        <Bloom ref={bloomRef} intensity={0.6} luminanceThreshold={0.85} luminanceSmoothing={0.3} mipmapBlur radius={0.6} />
        <Vignette eskil={false} offset={0.28} darkness={0.55} />
        <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.018} />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer multisampling={4}>
      <Bloom ref={bloomRef} intensity={1.25} luminanceThreshold={0.82} luminanceSmoothing={0.3} mipmapBlur radius={0.6} />
      <ChromaticAberration offset={caOffset} radialModulation modulationOffset={0.3} />
      <Vignette eskil={false} offset={0.3} darkness={0.62} />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.022} />
    </EffectComposer>
  );
}

/* -------------------------------------------------------------------------- */
/*  Ambient audio drone (WebAudio, synthesized, gesture-gated)                */
/* -------------------------------------------------------------------------- */

interface DroneHandle {
  start(): void;
  stop(): void;
  dispose(): void;
}

function createDrone(seed: number): DroneHandle | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  let ctx: AudioContext | null = null;
  const oscillators: OscillatorNode[] = [];
  let master: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  let started = false;

  const root = 70 + (seed % 7) * 6;
  const partials = [
    { f: root, detune: -4, gain: 0.9 },
    { f: root * 1.5, detune: +3, gain: 0.55 },
    { f: root * 2, detune: -2, gain: 0.35 },
    { f: root * 2.997, detune: +5, gain: 0.18 },
  ];

  function build() {
    const c = new Ctor();
    ctx = c;
    master = c.createGain();
    master.gain.setValueAtTime(0.0001, c.currentTime);
    filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600, c.currentTime);
    filter.Q.setValueAtTime(0.7, c.currentTime);
    filter.connect(master);
    master.connect(c.destination);
    for (const p of partials) {
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(p.f, c.currentTime);
      osc.detune.setValueAtTime(p.detune, c.currentTime);
      const g = c.createGain();
      g.gain.setValueAtTime(p.gain, c.currentTime);
      osc.connect(g);
      g.connect(filter);
      osc.start();
      oscillators.push(osc);
    }
    lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(0.08, c.currentTime);
    lfoGain = c.createGain();
    lfoGain.gain.setValueAtTime(0.02, c.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);
    lfo.start();
  }

  return {
    start() {
      try {
        if (!ctx) build();
        if (!ctx || !master) return;
        if (ctx.state === "suspended") void ctx.resume();
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
        master.gain.exponentialRampToValueAtTime(0.06, now + 2.5);
        started = true;
      } catch {
        /* audio is a nicety; never throw */
      }
    },
    stop() {
      try {
        if (!ctx || !master || !started) return;
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
        started = false;
      } catch {
        /* ignore */
      }
    },
    dispose() {
      try {
        for (const o of oscillators) {
          try {
            o.stop();
          } catch {
            /* already stopped */
          }
        }
        try {
          lfo?.stop();
        } catch {
          /* ignore */
        }
        void ctx?.close();
      } catch {
        /* ignore */
      } finally {
        ctx = null;
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Presence steps — a slow drum/footfall that announces the presence before  */
/*  it leaves the fog. Volume follows distance; it cuts dead at the climax.   */
/* -------------------------------------------------------------------------- */

interface StepsHandle {
  start(): void;
  stop(): void;
  dispose(): void;
  /** 0..1 — beat loudness, written per frame from presence distance. */
  level: { v: number };
}

function createSteps(seed: number): StepsHandle | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let cycleStart = 0;
  let beatIdx = 0;
  const level = { v: 0 };

  // Six-footed gait: a slow irregular pattern — two triplets held apart.
  const GAIT = [0, 0.16, 0.32, 0.78, 0.94, 1.1]; // offsets inside one step cycle
  const CYCLE = STEP_S * 2.3;
  const baseFreq = 52 + (seed % 5) * 5;

  const schedule = () => {
    if (!ctx) return;
    const now = ctx.currentTime;
    while (cycleStart + GAIT[beatIdx] < now + 0.35) {
      const t = cycleStart + GAIT[beatIdx];
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.3);
      const peak = Math.max(0.0005, level.v * 0.4);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.42);
      beatIdx++;
      if (beatIdx >= GAIT.length) {
        beatIdx = 0;
        cycleStart += CYCLE;
      }
    }
  };

  return {
    level,
    start() {
      try {
        if (!ctx) {
          ctx = new Ctor();
          cycleStart = ctx.currentTime + 0.15;
          beatIdx = 0;
        }
        if (ctx.state === "suspended") void ctx.resume();
        if (!timer) timer = setInterval(schedule, 120);
      } catch {
        /* audio is a nicety */
      }
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    dispose() {
      try {
        if (timer) clearInterval(timer);
        timer = null;
        void ctx?.close();
      } catch {
        /* ignore */
      } finally {
        ctx = null;
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  VignetteDriver — inside <Canvas>: moves the presence, watches your gaze,  */
/*  freezes the chorus at the climax. Pure useFrame; never re-renders.        */
/* -------------------------------------------------------------------------- */

const _auth = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _away = new THREE.Vector3();

function VignetteDriver({
  world,
  vig,
  stepsLevel,
}: {
  world: World;
  vig: React.RefObject<VignetteState | null>;
  stepsLevel: React.RefObject<{ v: number }>;
}) {
  // The presence = the first element of the account — the dream's subject.
  const presence = useMemo(() => world.elements[0] ?? null, [world.elements]);

  useFrame((state, delta) => {
    const v = vig.current;
    if (!v || !presence) return;
    const ch = v.channels.get(presence.id);
    if (!ch) return;

    const d = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const cam = state.camera;
    const phase = v.phase;
    const footprint = presence.footprint ?? 2.6;

    // Shared procession cadence for the whole world (chorus reads stepPhase).
    const stepPhase = (t / STEP_S) * Math.PI;
    const marching = t % (STEP_S * 6) < STEP_S * 4;
    for (const c of v.channels.values()) c.stepPhase = stepPhase;

    _auth.set(presence.position[0], presence.position[1], presence.position[2]);
    // The presence always enters along the axis that points AWAY from the
    // viewer — it comes at you out of the fog, never slides in from the side.
    _away.copy(_auth).sub(cam.position);
    _away.y = 0;
    if (_away.lengthSq() < 1e-4) _away.set(0, 0, -1);
    else _away.normalize();

    if (phase === "cartela") {
      // Deep in the fog beyond its mark — heard before it is seen.
      ch.offset.copy(_away).multiplyScalar(9.5);
      ch.face = 0;
    } else if (phase === "live") {
      if (v.liveAt === 0) v.liveAt = t;
      // The approach: it closes from ~9.5u beyond its mark over ~28s.
      const march = Math.min(1, (t - v.liveAt) / 28);
      const eased = march * march * (3 - 2 * march);
      const back = (1 - eased) * 9.5;
      // Small held procession drift around the mark once arrived.
      const px = Math.sin(t * 0.09) * 1.1 * eased;
      const pz = Math.cos(t * 0.07) * 0.8 * eased;
      ch.offset.set(_away.x * back + px, 0, _away.z * back + pz);
      ch.face = 0;

      // Live position + distance feed the gaze rule and the step loudness.
      v.presencePos.copy(_auth).add(ch.offset);
      v.presenceDist = v.presencePos.distanceTo(cam.position);
      if (stepsLevel.current) {
        stepsLevel.current.v = marching
          ? THREE.MathUtils.clamp(1.4 - v.presenceDist / 34, 0.06, 0.9)
          : 0;
      }

      // THE RULE: sustained gaze (~3.2s inside a tight cone) or stepping into
      // its space breaks the taboo. So does the dream simply running out.
      _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
      _toCam.copy(v.presencePos).sub(cam.position).normalize();
      if (_fwd.dot(_toCam) > 0.9 && v.presenceDist < footprint * 6 + 20) {
        v.gaze += d;
      }
      // The dream never ends on its own while you explore; waking is YOUR act
      // (the "acordar" button → onBreak). Safety timeout only.
      if (t - v.liveAt > DREAM_LEN_S) {
        v.onBreak();
      }
    } else if (phase === "climax") {
      // It stops mid-step and closes on you — the shite turns to the waki.
      v.presencePos.copy(_auth).add(ch.offset);
      _toCam.copy(cam.position).sub(v.presencePos);
      _toCam.y = 0;
      // Converge to a stop just outside its body — near enough to loom.
      const gap = footprint * 0.9 + 1.2;
      const close = Math.max(0, _toCam.length() - gap);
      _toCam.setLength(close).add(ch.offset);
      ch.offset.lerp(_toCam, 1 - Math.pow(0.12, d));
      v.presenceDist = v.presencePos.distanceTo(cam.position);
      ch.face = Math.min(1, ch.face + d * 0.9);
      if (stepsLevel.current) stepsLevel.current.v = 0;
    }
    // cut/note: nothing moves — the dream is over.

    // Chorus freeze: everything but the presence holds still at climax+.
    const freezeTarget = phase === "climax" || phase === "cut" || phase === "note" ? 1 : 0;
    for (const [id, c] of v.channels) {
      if (id !== v.presenceId) c.freeze = freezeTarget;
      else c.freeze = phase === "climax" ? 0.7 : freezeTarget;
    }
  });

  return null;
}

/* -------------------------------------------------------------------------- */
/*  Scene contents (inside <Canvas>)                                          */
/* -------------------------------------------------------------------------- */

function SceneContents({
  world,
  palette,
  params,
  state,
  mode,
  calm,
  mobile,
  fx,
  fxTarget,
  bloomRef,
  moveRef,
  onWhisper,
  onSelect,
  vignette,
  vig,
  stepsLevel,
  frozen,
}: {
  world: World;
  palette: Palette;
  params: SceneParams;
  state: StateVector;
  mode: "drift" | "orbit";
  calm: boolean;
  mobile: boolean;
  fx: React.RefObject<SceneFx>;
  fxTarget: React.RefObject<{ warp: number; aurora: number }>;
  bloomRef: React.RefObject<BloomEffect | null>;
  moveRef: React.RefObject<{ forward: number }>;
  onWhisper: (id: string | null) => void;
  onSelect: (id: string) => void;
  /** Whether the vignette director runs (readOnly / finished experiences). */
  vignette: boolean;
  vig: React.RefObject<VignetteState | null>;
  stepsLevel: React.RefObject<{ v: number }>;
  /** Dream paralysis for the rig (cartela / climax / cut / note). */
  frozen: boolean;
}) {
  const elements = world.elements ?? [];

  return (
    <>
      <DreamSky
        palette={palette}
        fx={fx}
        calm={calm}
        fogDensity={params.fogDensity}
        curvature={state.curvature}
        stateIntensity={state.intensity}
        formConstant={params.formConstant}
      />
      <DreamLights palette={palette} />
      <DreamGround />

      {/* Baked IBL that unifies the disparate Tripo materials under one warm
          dream grade: a cheap one-frame env map (never shown as background). */}
      <Environment
        resolution={mobile ? 64 : 128}
        frames={1}
        background={false}
        environmentIntensity={0.3}
      >
        <Lightformer position={[4, 6, 4]} intensity={2.2} scale={6} color={EMBER} />
        <Lightformer position={[-6, 2, -5]} intensity={1.0} scale={6} color="#8a93a8" />
        <Lightformer position={[0, -5, 0]} intensity={0.5} scale={6} color="#1a1310" />
      </Environment>

      <Suspense fallback={null}>
        {elements.map((el) => {
          const ch = vignette ? vig.current?.channels.get(el.id) : undefined;
          return (
            <DreamObject
              key={el.id}
              element={el}
              accents={palette.accents}
              calm={calm}
              params={params}
              onHover={onWhisper}
              onSelect={onSelect}
              live={ch ? { current: ch } : undefined}
            />
          );
        })}
      </Suspense>

      {vignette ? (
        <VignetteDriver world={world} vig={vig} stepsLevel={stepsLevel} />
      ) : null}

      {mode === "drift" ? (
        <FirstPersonRig
          world={world}
          calm={calm}
          moveRef={moveRef}
          onWhisper={onWhisper}
          frozen={frozen}
        />
      ) : (
        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.6}
          zoomSpeed={0.7}
          minDistance={3}
          maxDistance={24}
          maxPolarAngle={Math.PI * 0.88}
          minPolarAngle={Math.PI * 0.12}
          autoRotate={!calm}
          autoRotateSpeed={0.3}
          target={[0, 1, 0]}
        />
      )}

      <FxRunner
        fx={fx}
        target={fxTarget}
        bloomRef={bloomRef}
        calm={calm}
        mobile={mobile}
        bloom={params.bloom}
      />
      <DreamEffects
        mobile={mobile}
        bloomRef={bloomRef}
        chromaticAberration={params.chromaticAberration}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  WebGL2 capability probe                                                   */
/* -------------------------------------------------------------------------- */
//
// three r163+ (we're on r186) is WebGL2-ONLY — there is no WebGL1 fallback in
// the renderer anymore. On a GPU without WebGL2 (e.g. pre-2012 Intel), mounting
// <Canvas> throws deep in the renderer and the browser kills the tab
// ("this page couldn't load"). So we probe first and, when WebGL2 is missing,
// render a readable DOM fallback instead of ever touching three.
function supportsWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    const ok = !!gl;
    // Let the probe context go immediately — don't hold a GL slot.
    if (gl) {
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    }
    return ok;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Fallback — no WebGL2: show the dream as text, not a crash                 */
/* -------------------------------------------------------------------------- */

function DreamTextFallback({ world }: { world: World }) {
  const elements = world.elements ?? [];
  return (
    <div className="relative h-full w-full overflow-y-auto bg-void">
      <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-16">
        <h1 className="glow-text font-display text-3xl font-light leading-tight sm:text-4xl">
          {world.title}
        </h1>

        {world.reading ? (
          <p className="mt-5 text-base leading-relaxed text-mist">{world.reading}</p>
        ) : null}

        {elements.length > 0 ? (
          <ul className="mt-8 flex flex-col gap-4 border-t border-hairline pt-8">
            {elements.map((el) => (
              <li key={el.id}>
                <p className="font-display text-lg text-haze">{el.name}</p>
                {el.meaning ? (
                  <p className="mt-0.5 text-sm leading-relaxed text-mist">{el.meaning}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-10 border-t border-hairline pt-6 text-xs leading-relaxed text-mist/70">
          Este aparelho não tem WebGL2, então o mundo 3D não pode ser desenhado
          aqui — ele só existe em texto nesta tela. Abra este mesmo link num
          celular ou num computador mais novo para caminhar dentro do sonho.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  DreamScene                                                                */
/* -------------------------------------------------------------------------- */

export default function DreamScene({ world, readOnly = false }: DreamSceneProps) {
  const [mounted, setMounted] = useState(false);
  // null = not probed yet; true/false once mounted on the client.
  const [webgl2, setWebgl2] = useState<boolean | null>(null);
  const [mobile, setMobile] = useState(false);
  const [lowPower, setLowPower] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [mode, setMode] = useState<"drift" | "orbit">("drift");

  // ---- The vignette (readOnly/finished experiences only) ---- //
  // cartela → live → climax → cut → note. The director mutates vigRef inside
  // useFrame; React only ever sees the phase (for the DOM overlays).
  const [phase, setPhase] = useState<VignettePhase>(
    readOnly ? "cartela" : "live",
  );
  // "acordar" appears after a little free exploration; pressing it ends the dream.
  const [canWake, setCanWake] = useState(false);
  const [ruleOn, setRuleOn] = useState(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Warp state. The DOM flash veil is React state; the 3D flash/bloom/aurora
  // are eased from fxTarget by FxRunner inside the canvas.
  const [flashOn, setFlashOn] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // GL context lost (defensive, mostly iOS under memory pressure).
  const [ctxLost, setCtxLost] = useState(false);

  // Whisper subtitle.
  const [whisper, setWhisper] = useState<{ name: string; line: string } | null>(null);
  const [whisperOn, setWhisperOn] = useState(false);

  const fxRef = useRef<SceneFx>({ warp: 0, aurora: 0, shift: 0 });
  const fxTargetRef = useRef<{ warp: number; aurora: number }>({ warp: 0, aurora: 0 });
  const bloomRef = useRef<BloomEffect | null>(null);
  const warpingRef = useRef(false);
  // Mobile hold-to-walk: the ember orb writes forward 0..1 here each frame.
  const moveRef = useRef<{ forward: number }>({ forward: 0 });
  // Captured in onCreated for the dev-only ?debug hook.
  const cameraRef = useRef<THREE.Camera | null>(null);
  const seedRef = useRef(hash32(world.id ?? "oneiro") % 100);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const droneRef = useRef<DroneHandle | null>(null);
  const stepsRef = useRef<StepsHandle | null>(null);
  const stepsLevelRef = useRef({ v: 0 });
  const gestureBoundRef = useRef(false);

  // The vignette channel table: one live channel per element, the presence
  // marked by the largest footprint. Rebuilt when the world's element set
  // changes (a regenerate/edit), never per frame.
  const vigRef = useRef<VignetteState | null>(null);
  if (
    !vigRef.current ||
    vigRef.current.presenceId !== presenceIdOf(world) ||
    vigRef.current.channels.size !== world.elements.length
  ) {
    const channels = new Map<string, LiveChannel>();
    for (const el of world.elements) {
      channels.set(el.id, {
        offset: new THREE.Vector3(),
        face: 0,
        freeze: 0,
        stepPhase: 0,
      });
    }
    vigRef.current = {
      phase: phaseRef.current,
      presenceId: presenceIdOf(world),
      channels,
      presencePos: new THREE.Vector3(),
      presenceDist: 999,
      gaze: 0,
      liveAt: 0,
      onBreak: () => {
        if (phaseRef.current === "live") setPhase("climax");
      },
    };
  }

  // Build the warp itinerary: this world, then every OTHER saved dream, then
  // (if that leaves nowhere to go) re-seeded variants so a warp always lands
  // somewhere new. Palette + mood + fog are all the warp needs to repaint.
  const diary = useOneiroStore((s) => s.diary);
  const stops = useMemo<DreamStop[]>(() => {
    const base: DreamStop = {
      id: world.id,
      title: world.title,
      mood: world.mood,
      palette: world.palette,
    };
    const others: DreamStop[] = diary
      .filter((d) => d.id !== world.id)
      .map((d) => ({ id: d.id, title: d.title, mood: d.mood, palette: d.palette }));

    let seq = [base, ...others];
    if (seq.length < 2) {
      const variants: DreamStop[] = MOODS.filter((m) => m !== world.mood)
        .slice(0, 3)
        .map((m, i) => ({
          id: `${world.id}:reseed:${i}`,
          title: world.title,
          mood: m,
          palette: reseedPalette(world.palette, m),
        }));
      seq = [base, ...variants];
    }
    return seq;
  }, [world.id, world.title, world.mood, world.palette, diary]);

  const activeStop = stops[activeIndex % stops.length];
  const activePalette = activeStop?.palette ?? world.palette;

  // Continuous render grammar for the active dream. Mode 1 pins the disciplined
  // dream region of each axis via moodToState; deriveSceneParams turns that into
  // the concrete fog / bloom / CA / drift / warp / form-constant knobs the scene
  // + sky + objects read. A future trip product feeds a higher-intensity
  // StateVector here and the same wiring pushes further — no contract change.
  const activeMood: Mood = activeStop?.mood ?? world.mood;
  const state: StateVector = useMemo(() => moodToState(activeMood), [activeMood]);
  const params: SceneParams = useMemo(() => deriveSceneParams(state), [state]);

  // Detect mobile + reduced-motion for degradation.
  useEffect(() => {
    setMounted(true);
    setWebgl2(supportsWebGL2());
    const narrowMql = window.matchMedia("(max-width: 768px)");
    const coarseMql = window.matchMedia("(pointer: coarse)");
    const motionMql = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Low-end heuristic (read once — hardware doesn't change mid-session):
    // few logical cores or little device memory. Chromium-only hints, so a
    // miss just means we stay on the default (richer) path.
    const nav = navigator as Navigator & { deviceMemory?: number };
    const cores = nav.hardwareConcurrency ?? 8;
    const mem = nav.deviceMemory ?? 8;
    setLowPower(cores <= 4 || mem <= 4);

    const check = () => {
      setMobile(narrowMql.matches || coarseMql.matches);
      setReduced(motionMql.matches);
    };
    check();
    narrowMql.addEventListener?.("change", check);
    motionMql.addEventListener?.("change", check);
    return () => {
      narrowMql.removeEventListener?.("change", check);
      motionMql.removeEventListener?.("change", check);
    };
  }, []);

  // Clear any pending warp timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of timers) clearTimeout(id);
    };
  }, []);

  // ---- Warp between dreams ---- //
  const triggerWarp = useCallback(() => {
    // Touch = link — but only while the dream is live. At the climax, in the
    // cut or over the morning note, the world no longer answers.
    if (phaseRef.current !== "live") return;
    if (warpingRef.current || stops.length < 2) return;
    warpingRef.current = true;

    const auroraPeak = reduced ? 0.4 : 0.95;
    const flashOut = reduced ? 240 : 420;
    const settle = reduced ? 700 : 1100;
    const release = reduced ? 900 : 1500;

    setFlashOn(true);
    fxTargetRef.current = { warp: 1, aurora: auroraPeak };

    timersRef.current.push(
      setTimeout(() => {
        setActiveIndex((i) => (i + 1) % Math.max(1, stops.length));
        seedRef.current += 137.5; // reseed the wander so you land somewhere new
        setWhisperOn(false);
        setFlashOn(false);
        fxTargetRef.current = { warp: 0, aurora: reduced ? 0.15 : 0.35 };
      }, flashOut),
    );
    timersRef.current.push(
      setTimeout(() => {
        fxTargetRef.current = { warp: 0, aurora: 0 };
      }, settle),
    );
    timersRef.current.push(
      setTimeout(() => {
        warpingRef.current = false;
      }, release),
    );
  }, [reduced, stops.length]);

  // ---- Whisper (proximity in drift, hover in orbit) ---- //
  const showWhisper = useCallback(
    (id: string | null) => {
      if (phaseRef.current !== "live") return;
      if (id === null) {
        setWhisperOn(false);
        return;
      }
      const el = world.elements.find((e) => e.id === id);
      if (!el) return;
      setWhisper({ name: el.name, line: whisperLine(el.id, el.name) });
      setWhisperOn(true);
    },
    [world.elements],
  );

  // ---- Ambient drone ---- //
  const seed = useMemo(() => hash32(world?.id ?? ""), [world?.id]);
  useEffect(() => {
    if (!mounted) return;
    droneRef.current = createDrone(seed);
    return () => {
      droneRef.current?.dispose();
      droneRef.current = null;
    };
  }, [mounted, seed]);

  const toggleAudio = useCallback(() => {
    setAudioOn((on) => {
      const next = !on;
      if (next) droneRef.current?.start();
      else droneRef.current?.stop();
      if (!next) stepsRef.current?.stop();
      return next;
    });
  }, []);

  // ---- Vignette phase machine ---- //
  // Presence steps synth (per world seed) — created lazily alongside the drone.
  useEffect(() => {
    if (!mounted) return;
    stepsRef.current = createSteps(seed);
    return () => {
      stepsRef.current?.dispose();
      stepsRef.current = null;
    };
  }, [mounted, seed]);

  useEffect(() => {
    const vig = vigRef.current;
    if (vig) vig.phase = phase;
    const timers = timersRef.current;

    if (phase === "cartela") {
      timers.push(
        setTimeout(() => setPhase("live"), reduced ? 1600 : 3000),
      );
    } else if (phase === "live") {
      setCanWake(false);
      timers.push(setTimeout(() => setCanWake(true), reduced ? 6000 : 15000));
      // liveAt is stamped by the driver on its own clock (state.clock), so the
      // dream-length timer compares like with like.
      // The rule is stated once, early — a single line, then silence.
      setRuleOn(false);
      timers.push(setTimeout(() => setRuleOn(true), 1400));
      timers.push(setTimeout(() => setRuleOn(false), 6800));
      if (audioOn) stepsRef.current?.start();
    } else if (phase === "climax") {
      // Silence as event: every layer of sound cuts dead at once.
      droneRef.current?.stop();
      stepsRef.current?.stop();
      setWhisperOn(false);
      timers.push(setTimeout(() => setPhase("cut"), reduced ? 1400 : 2400));
    } else if (phase === "cut") {
      timers.push(setTimeout(() => setPhase("note"), reduced ? 600 : 1100));
    }
  }, [phase, reduced, audioOn]);

  // The morning note's night number: position in the diary (1-based, oldest=1).
  const night = useMemo(() => {
    const idx = diary.findIndex((d) => d.id === world.id);
    return idx < 0 ? diary.length + 1 : diary.length - idx;
  }, [diary, world.id]);

  // "dormir de novo" — reset the vignette to its cartela.
  const sleepAgain = useCallback(() => {
    const vig = vigRef.current;
    if (vig) {
      vig.gaze = 0;
      vig.liveAt = 0;
      for (const c of vig.channels.values()) {
        c.face = 0;
        c.freeze = 0;
      }
    }
    setRuleOn(false);
    setPhase("cartela");
    if (audioOn) droneRef.current?.start();
  }, [audioOn]);

  useEffect(() => {
    if (!mounted || !readOnly || gestureBoundRef.current) return;
    gestureBoundRef.current = true;
    const onFirstGesture = () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
      setAudioOn((on) => {
        if (on) return on;
        droneRef.current?.start();
        return true;
      });
    };
    window.addEventListener("pointerdown", onFirstGesture);
    window.addEventListener("keydown", onFirstGesture);
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
  }, [mounted, readOnly]);

  const calm = reduced; // objects/sky/wander calm only for reduced-motion
  // "lite" = reduced-effects path: small/touch screens OR weak hardware. It
  // drops chromatic aberration + multisampling and softens bloom.
  const lite = mobile || lowPower;
  // Cap the device-pixel-ratio: full retina is the single biggest GPU cost on
  // phones. Weak hardware renders at 1×, mobile at ≤1.5×, desktop at ≤2×.
  // Retro "dream emulator" render: ~420px-wide internal resolution upscaled
  // with crisp pixels (PS1 / LSD Dream Emulator). Makes disparate generated
  // models read as ONE intentional look instead of cheap realism. ?crisp=1 off.
  const [retro, setRetro] = useState(true);
  useEffect(() => {
    try {
      setRetro(!new URLSearchParams(window.location.search).has("crisp"));
    } catch {
      /* keep default */
    }
  }, []);
  const dpr = useMemo<number | [number, number]>(() => {
    if (retro && typeof window !== "undefined") {
      return Math.min(1, Math.max(0.22, 420 / window.innerWidth));
    }
    return lowPower ? [1, 1] : mobile ? [1, 1.5] : [1, 2];
  }, [retro, lowPower, mobile]);
  const bg = activePalette?.bg ?? "var(--color-void)";

  // No WebGL2 (three r186 has no WebGL1 path) → never mount <Canvas>, which
  // would crash the tab. Show the dream as text instead.
  if (webgl2 === false) {
    return <DreamTextFallback world={world} />;
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: bg, touchAction: "none" }}
    >
      {mounted && webgl2 ? (
        <Canvas
          style={retro ? { imageRendering: "pixelated" } : undefined}
          dpr={dpr}
          gl={{ antialias: !lite, powerPreference: "high-performance", alpha: false }}
          camera={{ position: [0, 1.6, 2], fov: 60, near: 0.1, far: 400 }}
          onCreated={({ camera, gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
            cameraRef.current = camera;

            // Dev-only verification hook (opt-in via ?debug). Lets the render
            // harness read the camera / warp / flash state. Never ships behavior.
            if (
              typeof location !== "undefined" &&
              new URLSearchParams(location.search).has("debug")
            ) {
              (window as unknown as { __oneiro?: unknown }).__oneiro = {
                cam: () => cameraRef.current?.position.toArray(),
                warping: () => warpingRef.current,
                flash: () => flashOn,
                phase: () => phaseRef.current,
                presence: () => vigRef.current?.presencePos.toArray(),
                face: () => {
                  const v = vigRef.current;
                  return v?.presenceId
                    ? (v.channels.get(v.presenceId)?.face ?? 0)
                    : 0;
                },
                setFace: (x: number) => {
                  const v = vigRef.current;
                  const ch = v?.presenceId
                    ? v.channels.get(v.presenceId)
                    : undefined;
                  if (ch) ch.face = x;
                },
                hold: () => {
                  for (const t of timersRef.current) clearTimeout(t);
                  timersRef.current = [];
                },
                breakRule: () => vigRef.current?.onBreak(),
              };
            }

            // Defensive GL-context-lost handling (iOS memory pressure): keep the
            // tab alive and offer a one-tap reload instead of a dead canvas.
            const canvas = gl.domElement;
            canvas.addEventListener("webglcontextlost", (e) => {
              e.preventDefault();
              setCtxLost(true);
            });
            canvas.addEventListener("webglcontextrestored", () => {
              setCtxLost(false);
            });
          }}
        >
          <SceneContents
            world={world}
            palette={activePalette}
            params={params}
            state={state}
            mode={mode}
            calm={calm}
            mobile={lite}
            fx={fxRef}
            fxTarget={fxTargetRef}
            bloomRef={bloomRef}
            moveRef={moveRef}
            onWhisper={showWhisper}
            onSelect={triggerWarp}
            vignette={readOnly}
            vig={vigRef}
            stepsLevel={stepsLevelRef}
            frozen={phase !== "live"}
          />
        </Canvas>
      ) : null}

      {/* The cartela — the fixed ritual opening of every dream: a black card,
          the formula and the title, before the first frame of the world. */}
      {phase === "cartela" ? (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-void px-6 text-center"
          style={{ background: "oklch(9% 0.01 296)" }}
        >
          <p className="text-xs uppercase tracking-[0.35em] text-mist/70">
            Tive um sonho assim
          </p>
          <h2 className="glow-text mt-5 max-w-2xl font-display text-3xl font-light leading-tight text-haze sm:text-5xl">
            {world.title}
          </h2>
        </div>
      ) : null}

      {/* The rule — stated once, early, as a single declarative line. Not a
          tutorial: a taboo. It never repeats and never explains itself. */}
      {phase === "live" && canWake ? (
        <button
          type="button"
          onClick={() => vigRef.current?.onBreak()}
          className="pointer-events-auto absolute left-4 z-30 rounded-full border border-hairline px-4 py-2 font-display text-sm italic text-haze/90 transition hover:border-hairline-gold hover:text-neon-gold"
          style={{
            bottom: "calc(env(safe-area-inset-bottom) + 1.25rem)",
            background: "oklch(13% 0.01 296 / 0.55)",
          }}
        >
          acordar
        </button>
      ) : null}
      {phase === "live" && ruleOn ? (
        <div className="pointer-events-none absolute inset-x-0 top-[18%] z-10 flex justify-center px-6">
          <p className="font-display text-lg italic leading-snug text-haze/85 sm:text-xl">
            {world.rule ?? DEFAULT_RULE}
          </p>
        </div>
      ) : null}

      {/* The cut — waking is a hard cut, not a transition. Pure black, no fade
          out of the world: it is simply gone. */}
      {phase === "cut" ? (
        <div className="absolute inset-0 z-50 bg-black" />
      ) : null}

      {/* The morning note — the dream written down. The original account, the
          night number, and the way back to sleep or to the diary. */}
      {phase === "note" ? (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto px-6 py-12"
          style={{ background: "oklch(9% 0.01 296)" }}
        >
          <div className="w-full max-w-lg">
            <p className="text-xs uppercase tracking-[0.35em] text-mist/70">
              anotação da manhã · noite nº {night}
            </p>
            <h2 className="glow-text mt-4 font-display text-3xl font-light leading-tight text-haze sm:text-4xl">
              {world.title}
            </h2>
            {world.dreamText ? (
              <p className="mt-6 border-l border-hairline pl-4 font-display text-base italic leading-relaxed text-mist">
                {world.dreamText}
              </p>
            ) : null}
            {world.reading ? (
              <p className="mt-4 text-sm leading-relaxed text-mist/80">
                {world.reading}
              </p>
            ) : null}
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={sleepAgain}
                className="rounded-full border border-hairline-gold px-6 py-2.5 font-display text-sm text-neon-gold transition hover:bg-white/[0.03]"
              >
                dormir de novo
              </button>
              <a
                href="/diary"
                className="font-display text-sm text-mist underline-offset-4 transition hover:text-haze hover:underline"
              >
                seu diário →
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {/* GL context lost — a small DOM overlay, tap to come back. */}
      {ctxLost ? (
        <button
          type="button"
          onClick={() => location.reload()}
          className="absolute inset-0 z-30 flex items-center justify-center px-6 text-center font-display text-lg italic text-haze"
          style={{ background: "oklch(10% 0.01 60 / 0.82)" }}
        >
          <span className="glow-text">o sonho se desfez — toque para voltar</span>
        </button>
      ) : null}

      {/* Crystalline warp veil (DOM) — supports the in-canvas bloom flash. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          opacity: flashOn ? 1 : 0,
          transition: `opacity ${flashOn ? 420 : 820}ms cubic-bezier(0.4, 0, 0.2, 1)`,
          background: WARP_VEIL,
          mixBlendMode: "screen",
        }}
      />

      {/* Whisper — floating poetic subtitle that fades. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center px-6"
        style={{
          opacity: whisperOn ? 1 : 0,
          transform: whisperOn ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 700ms ease, transform 700ms ease",
        }}
      >
        {whisper ? (
          <p
            className="max-w-[34rem] rounded-[var(--radius-control)] px-4 py-2 text-center font-display text-lg italic leading-snug text-haze/90 sm:text-xl"
            style={{ background: "oklch(13% 0.01 296 / 0.55)" }}
          >
            <span className="glow-text">{whisper.line}</span>
          </p>
        ) : null}
      </div>

      {/* Mobile hold-to-walk: an ember orb, bottom-center. Touch devices have no
          WASD, so this is how you move forward through the dream. */}
      {lite && mode === "drift" ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            aria-label="segure para caminhar"
            onPointerDown={() => {
              moveRef.current.forward = 1;
            }}
            onPointerUp={() => {
              moveRef.current.forward = 0;
            }}
            onPointerCancel={() => {
              moveRef.current.forward = 0;
            }}
            className="pointer-events-auto flex h-[72px] w-[72px] items-center justify-center rounded-full"
            style={{
              touchAction: "none",
              border: `1.5px solid ${EMBER}`,
              background: "oklch(13% 0.01 296 / 0.5)",
              color: EMBER,
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="6 11 12 5 18 11" />
            </svg>
          </button>
        </div>
      ) : null}

      {/* Controls: drift/orbit toggle + ambient audio. Lifted clear of the gift
          chrome (reading panel + CTA) when read-only so they never overlap. */}
      <div
        className={`absolute right-4 z-20 flex flex-col gap-2 ${
          readOnly ? "bottom-20" : "bottom-4"
        }`}
      >
        <button
          type="button"
          onClick={() => setMode((m) => (m === "drift" ? "orbit" : "drift"))}
          aria-label={mode === "drift" ? "mudar para órbita" : "mudar para deriva"}
          title={mode === "drift" ? "deriva (toque p/ órbita)" : "órbita (toque p/ deriva)"}
          className="icon-btn h-11 w-11"
        >
          {mode === "drift" ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="2.4" />
              <path d="M12 2.6c5.2 0 9.4 4.2 9.4 9.4S17.2 21.4 12 21.4" opacity="0.5" />
              <path d="M4.4 17.6A9.36 9.36 0 0 1 12 2.6" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <ellipse cx="12" cy="12" rx="10" ry="4.4" />
              <circle cx="12" cy="12" r="2.4" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={toggleAudio}
          aria-pressed={audioOn}
          aria-label={audioOn ? "silenciar atmosfera sonora" : "ativar atmosfera sonora"}
          title={audioOn ? "silenciar atmosfera" : "ativar atmosfera"}
          className="icon-btn h-11 w-11"
        >
          {audioOn ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path d="M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4z" />
              <line x1="22" y1="9" x2="16" y2="15" />
              <line x1="16" y1="9" x2="22" y2="15" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
