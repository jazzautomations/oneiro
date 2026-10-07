"use client";

// @/components/DreamObject.tsx
// A single navigable object inside a dream world.
//
// Loads a generated GLB from `element.modelUrl` (via drei's useGLTF) and places
// it at the element's authored position / scale / rotation. While the model is
// missing or still loading, a glowing placeholder primitive stands in its
// place so the world is never empty or jarring.
//
// Every object has a life of its own: a gentle idle float, a slow breathing
// scale (deterministic per-element phase so the scene never pulses in unison),
// a soft emissive glow that pulses in time, and a lazy "look-at" so objects
// slowly turn to notice the wanderer. Hovering lifts the glow + scale and
// surfaces its whisper; clicking plays a short synthesized pop and asks the
// scene to warp. The glow is drawn from the world palette so each object reads
// as a shard of the same dream rather than a random rainbow.

import {
  Component,
  useRef,
  useMemo,
  useEffect,
  useCallback,
  Suspense,
  type ReactNode,
  type ErrorInfo,
} from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { DreamElement, SceneParams } from "@/lib/world";
import { EMBER } from "@/lib/palette";

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

export interface DreamObjectProps {
  /** The dream element to render. */
  element: DreamElement;
  /** World accent palette; the object's glow is picked from it deterministically. */
  accents?: string[];
  /** Fired on click/tap — the scene uses this to warp between dreams. */
  onSelect?: (id: string) => void;
  /** Fired on hover enter (id) / leave (null) — the scene shows the whisper. */
  onHover?: (id: string | null) => void;
  /** Mobile / reduced-motion degrade: calmer animation, no look-at tracking. */
  calm?: boolean;
  /**
   * Render-time dream grammar, from deriveSceneParams(state). Drives the vertex
   * warp, the transient saturation/emissive swell and the non-uniform scale
   * drift so a tidy Tripo mesh does the dreamwork. Absent = a calm default.
   */
  params?: SceneParams;
  /**
   * Live direction channel — the vignette director mutates these values each
   * frame; the object reads them inside useFrame (no re-render). `offset` moves
   * the whole object in world space (the procession), `face` drives how hard it
   * turns toward the camera (the climax stare), `freeze` stills the idle life,
   * and `stepPhase` gives the chorus its synchronized footfall. Absent = the
   * object behaves exactly as before.
   */
  live?: React.RefObject<{
    offset: THREE.Vector3;
    face: number;
    freeze: number;
    stepPhase: number;
  }>;
}

/* -------------------------------------------------------------------------- */
/*  Deterministic per-element derivations                                     */
/* -------------------------------------------------------------------------- */

/** FNV-ish rolling hash of a string -> unsigned 32-bit int. */
function hash32(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable [0,1) value from a seed, used to offset animation phases. */
function hashToUnit(seed: string): number {
  return (hash32(seed) % 10000) / 10000;
}

/** Safely parse a color string, never throws. */
function toColor(value: string | undefined, fallback: string): THREE.Color {
  const c = new THREE.Color();
  try {
    c.set(value && value.trim() ? value : fallback);
  } catch {
    c.set(fallback);
  }
  return c;
}

/**
 * The object's glow color. Chosen deterministically from the world palette so
 * every object belongs to the same dream; falls back to a warm ember when the
 * palette is empty.
 */
function glowColor(seed: string, accents: string[] | undefined): THREE.Color {
  const list = (accents ?? []).filter(Boolean);
  if (list.length > 0) {
    return toColor(list[hash32(seed) % list.length], EMBER);
  }
  return toColor(EMBER, EMBER);
}

/* -------------------------------------------------------------------------- */
/*  Vertex-warp GLSL (self-contained; same gradient noise as DreamSky)        */
/* -------------------------------------------------------------------------- */

// Injected into the cloned GLB's MeshStandardMaterial vertex shader via
// onBeforeCompile: a gentle, time-advected displacement ALONG the normal so the
// tidy mesh breathes / melts without us throwing away its PBR textures (which
// MeshDistortMaterial would). Reuses DreamSky's hash3/value-noise recipe.
const WARP_PARS = /* glsl */ `
  uniform float uWarpTime;
  uniform float uWarpAmp;
  uniform float uWarpFreq;
  vec3 dwHash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float dwNoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(dot(dwHash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
              dot(dwHash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
          mix(dot(dwHash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
              dot(dwHash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
      mix(mix(dot(dwHash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
              dot(dwHash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
          mix(dot(dwHash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
              dot(dwHash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
  }
`;

const WARP_BODY = /* glsl */ `
  float dwN = dwNoise(position * uWarpFreq + vec3(uWarpTime * 0.3));
  float dwN2 = dwNoise(position * uWarpFreq * 2.1 - vec3(0.0, uWarpTime * 0.21, 0.0));
  float dwDisp = dwN * 0.7 + dwN2 * 0.3;
  transformed += normal * dwDisp * uWarpAmp;
`;

// Scratch objects for the transient-saturation swell (shared; per-frame use is
// synchronous so instances never collide).
const _swellCol = new THREE.Color();
const _swellHsl = { h: 0, s: 0, l: 0 };

/* -------------------------------------------------------------------------- */
/*  WebAudio "pop" (synthesized, no asset)                                    */
/* -------------------------------------------------------------------------- */

let _audioCtx: AudioContext | null = null;

/** Lazily obtain (and resume) a shared AudioContext; null when unavailable. */
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    if (!_audioCtx) _audioCtx = new Ctor();
    if (_audioCtx.state === "suspended") void _audioCtx.resume();
    return _audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play a short "chime": a sine sweeping down in pitch with a fast attack /
 * exponential decay. Pitch is seeded so each object rings at its own note.
 */
function playPop(seed: string): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const base = 440 + hashToUnit(seed) * 440; // 440–880 Hz
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.35, now + 0.18);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  } catch {
    /* audio is a nicety; never let it break interaction */
  }
}

/* -------------------------------------------------------------------------- */
/*  Loaded model                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Renders the generated GLB. The loaded scene is cloned (with cloned materials)
 * so we can safely tint an emissive glow without mutating drei's shared cache.
 * Emissive intensity pulses gently and lifts while `hoverRef` is engaged.
 */
function LoadedModel({
  url,
  element,
  glow,
  hoverRef,
  phase,
  calm,
  params,
}: {
  url: string;
  element: DreamElement;
  glow: THREE.Color;
  hoverRef: React.RefObject<number>;
  phase: number;
  calm: boolean;
  params?: SceneParams;
}) {
  const { scene } = useGLTF(url);
  const materials = useRef<THREE.MeshStandardMaterial[]>([]);

  // One shared set of warp uniforms, assigned (by reference) into every cloned
  // material's compiled shader — so a single per-frame write warps the whole
  // model and nothing recompiles when the amplitude eases.
  const warpUniforms = useMemo(
    () => ({
      uWarpTime: { value: 0 },
      uWarpAmp: { value: 0 },
      uWarpFreq: { value: 1.8 },
    }),
    [],
  );

  // Clone once per loaded GLB (NOT per palette/warp): re-cloning the whole scene
  // every warp allocated a fresh object graph + materials and thrashed the GC on
  // phones. The glow *color* is applied separately (cheap) whenever it changes.
  const cloned = useMemo(() => {
    const root = scene.clone(true);
    const collected: THREE.MeshStandardMaterial[] = [];

    const cloneMat = (m: THREE.Material): THREE.Material => {
      const clone = m.clone();
      const std = clone as Partial<THREE.MeshStandardMaterial>;
      if (std.emissive instanceof THREE.Color) {
        std.emissive.copy(glow);
        // Keep the glow a faint rim, not a wash: a strong emissive tint turned
        // the real textured model into an abstract glowing blob (an amber ant
        // read as a purple light-smear). Let the model's own material show.
        (clone as THREE.MeshStandardMaterial).emissiveIntensity = 0.12;
        // Let the shared IBL (drei <Environment>) grade these disparate Tripo
        // materials toward one coherent dream lacquer.
        (clone as THREE.MeshStandardMaterial).envMapIntensity = 0.6;
        collected.push(clone as THREE.MeshStandardMaterial);
      }
      // Blend a vertex warp into whatever shader this material already compiles
      // to, preserving its textures/PBR. Share the uniform objects so one write
      // drives every material.
      clone.onBeforeCompile = (shader) => {
        shader.uniforms.uWarpTime = warpUniforms.uWarpTime;
        shader.uniforms.uWarpAmp = warpUniforms.uWarpAmp;
        shader.uniforms.uWarpFreq = warpUniforms.uWarpFreq;
        shader.vertexShader =
          WARP_PARS +
          shader.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\n" + WARP_BODY,
          );
      };
      return clone;
    };

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(cloneMat)
          : cloneMat(mesh.material);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });

    // Tripo returns models at wildly different native scales (and off-center),
    // so a raw <primitive> looks tiny or lopsided. Normalize every model to a
    // consistent, substantial size and recenter it on the group origin, so each
    // object reads as a present, habitable thing — not a distant speck.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 1e-4 && Number.isFinite(maxDim)) {
      const TARGET = element.footprint ?? 2.6; // world units, largest dimension
      const s = TARGET / maxDim;
      const center = box.getCenter(new THREE.Vector3());
      root.scale.setScalar(s);
      // Plant the object ON the floor: offset by the bbox MIN y (not center y)
      // so its base sits at y = 0 instead of floating with its centroid.
      root.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    }

    materials.current = collected;
    return root;
    // glow is intentionally omitted — applied below without re-cloning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // Re-tint the emissive glow when the palette shifts (warp / surreal shift).
  // Cheap colour copy on the already-cloned materials — no new allocations.
  useEffect(() => {
    for (const m of materials.current) m.emissive.copy(glow);
  }, [glow, cloned]);

  // Dispose the cloned materials when they are replaced or unmounted. Geometry
  // is shared with the cache (clone() references it), so we never dispose that.
  useEffect(() => {
    const mats = materials.current;
    return () => {
      for (const m of mats) m.dispose();
    };
  }, [cloned]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // Advance + ease the vertex-warp amplitude toward the state's objectWarp.
    warpUniforms.uWarpTime.value = t;
    const warpTarget =
      (params?.objectWarp ?? 0) * (calm ? 0.25 : 1) * 0.12;
    warpUniforms.uWarpAmp.value +=
      (warpTarget - warpUniforms.uWarpAmp.value) * 0.05;

    // Objects are LIT, not luminous: emissive rests near-dark (~0.05) and only
    // the hover lift + the rare swell add a glow on top. Per Oniric-Lacquer the
    // emissive is a faint interaction/warp highlight, never the object's body.
    const pulse = 0.04 + 0.04 * (0.5 + 0.5 * Math.sin(t * 1.3));
    const lift = hoverRef.current ?? 0;

    // Transient hyper-saturation / emissive swell: a rare, sharp spike (seeded
    // phase, ~every 19s) whose size tracks the state's saturation headroom.
    // Warm ember swell, never a rainbow — Oniric-Lacquer stays intact.
    const satHead = Math.max(0, (params?.saturation ?? 1) - 0.95);
    const sw = Math.sin(t * 0.33 + phase);
    const swell = Math.pow(Math.max(0, sw), 12) * (calm ? 0.3 : 1);
    const target = pulse + lift * 0.9 + swell * (0.8 + satHead * 2.2);

    for (const m of materials.current) m.emissiveIntensity = target;

    if (swell > 0.02 && satHead > 0.001) {
      _swellCol.copy(glow).getHSL(_swellHsl);
      _swellCol.setHSL(
        _swellHsl.h,
        Math.min(1, _swellHsl.s * (1 + swell * satHead * 1.6)),
        _swellHsl.l,
      );
      for (const m of materials.current) m.emissive.copy(_swellCol);
    } else {
      for (const m of materials.current) m.emissive.copy(glow);
    }
  });

  return <primitive object={cloned} />;
}

/* -------------------------------------------------------------------------- */
/*  Placeholder                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A glowing crystalline stand-in shown while the model is missing or loading.
 * Slowly spins and pulses so a "forming" dream feels alive rather than broken.
 */
function Placeholder({
  glow,
  hoverRef,
  calm,
}: {
  glow: THREE.Color;
  hoverRef: React.RefObject<number>;
  calm: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const lift = hoverRef.current ?? 0;
    if (meshRef.current && !calm) {
      meshRef.current.rotation.y += delta * (0.45 + lift * 0.9);
      meshRef.current.rotation.x += delta * 0.2;
    }
    if (matRef.current) {
      matRef.current.emissiveIntensity =
        0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2)) + lift * 1.1;
    }
    if (lightRef.current) {
      lightRef.current.intensity = 2.2 + lift * 3.5;
    }
  });

  return (
    <group>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.6, 1]} />
        <meshStandardMaterial
          ref={matRef}
          color={glow}
          emissive={glow}
          emissiveIntensity={0.7}
          roughness={0.25}
          metalness={0.1}
          transparent
          opacity={0.85}
          flatShading
        />
      </mesh>
      <pointLight ref={lightRef} color={glow} intensity={2.2} distance={7} decay={2} />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Model error boundary                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A failed, missing or corrupt GLB (404, decode error, out-of-memory on a weak
 * phone) throws out of Suspense — which, uncaught, would white-screen the whole
 * <Canvas>. This boundary catches it and keeps the glowing placeholder in that
 * object's place, so the dream stays whole. Remount it (via `key`) to retry a
 * new url. Lives inside the r3f tree, so its fallback is a 3D node.
 */
class ModelErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Swallow — a broken model degrades gracefully to its placeholder and must
    // never take the scene down with it.
    void _error;
    void _info;
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/* -------------------------------------------------------------------------- */
/*  DreamObject                                                               */
/* -------------------------------------------------------------------------- */

// Scratch objects reused across frames so look-at tracking allocates nothing.
const _tmpTarget = new THREE.Vector3();
const _tmpMat = new THREE.Matrix4();
const _tmpQuat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Places a dream element in the scene with an idle float + breathing, a lazy
 * look-at toward the camera, hover emphasis and click-to-warp. Renders the
 * generated model when available, otherwise a glowing placeholder. Because the
 * outer group only translates, the element's world position equals
 * `element.position`, which the scene reuses for proximity whispers + warps.
 * Drop inside an r3f <Canvas>.
 */
export default function DreamObject({
  element,
  accents,
  onSelect,
  onHover,
  calm = false,
  params,
  live,
}: DreamObjectProps) {
  const rootRef = useRef<THREE.Group>(null);
  const turnRef = useRef<THREE.Group>(null);
  const floatRef = useRef<THREE.Group>(null);
  const hoverRef = useRef(0); // eased 0..1 hover amount (read by children)
  const hoverTargetRef = useRef(0); // 0/1 target set by pointer handlers
  // Eased freeze — the director sets the target, this value chases it so the
  // chorus stills over ~0.5s instead of snapping dead mid-motion.
  const freezeRef = useRef(0);

  const glow = useMemo(() => glowColor(element.id, accents), [element.id, accents]);
  const phase = useMemo(() => hashToUnit(element.id) * Math.PI * 2, [element.id]);

  // Idle float + breathing + eased hover lift; plus a lazy look-at that turns
  // the object to face the wanderer (stronger while hovered). The outer group
  // is a pure translate, so look-at math works in world space with no parents.
  useFrame((state, delta) => {
    const f = floatRef.current;
    const turn = turnRef.current;
    const t = state.clock.elapsedTime;
    const v = live?.current;

    // Ease hover toward its 0/1 target (framerate-independent).
    const hk = 1 - Math.pow(0.0001, delta);
    hoverRef.current += (hoverTargetRef.current - hoverRef.current) * hk;
    // Ease the director's freeze (0 = alive, 1 = held still mid-gesture).
    const freezeTarget = v ? v.freeze : 0;
    freezeRef.current += (freezeTarget - freezeRef.current) * (1 - Math.pow(0.02, delta));
    const frozen = freezeRef.current;

    // Procession offset: the outer group is a pure translate of the authored
    // position, so the director can walk the object through the dream.
    if (rootRef.current && v) {
      rootRef.current.position.set(
        element.position[0] + v.offset.x,
        element.position[1] + v.offset.y,
        element.position[2] + v.offset.z,
      );
    }

    if (f) {
      const alive = 1 - frozen;
      // The chorus steps in unison on the shared phase — small synchronized
      // footfall on top of the (per-object, out-of-phase) idle float.
      const step = v ? Math.max(0, Math.sin(v.stepPhase)) * 0.055 * alive : 0;
      f.position.y = Math.sin(t * 0.8 + phase) * (calm ? 0.1 : 0.18) * alive + step;
      const breathe = 1 + Math.sin(t * 1.1 + phase) * 0.03 * alive;
      const lift = 1 + hoverRef.current * 0.08;
      const base = breathe * lift;
      // Gentle NON-UNIFORM scale drift (each axis its own phase) — the mesh
      // subtly loses its rigid proportions. Gated by objectWarp so it vanishes
      // cleanly to a uniform breathe when the state is calm / warp is 0.
      const nu = calm ? 0 : (params?.objectWarp ?? 0) * 0.14 * alive;
      if (nu > 0.0001) {
        f.scale.set(
          base * (1 + Math.sin(t * 0.9 + phase) * nu),
          base * (1 + Math.sin(t * 1.27 + phase * 1.3) * nu),
          base * (1 + Math.sin(t * 1.07 + phase * 0.7) * nu),
        );
      } else {
        f.scale.setScalar(base);
      }
    }

    if (turn && !calm) {
      _tmpTarget.set(
        element.position[0] + (v ? v.offset.x : 0),
        element.position[1] + (v ? v.offset.y : 0),
        element.position[2] + (v ? v.offset.z : 0),
      );
      // eye = object, target = camera → the object's forward turns to face you.
      _tmpMat.lookAt(_tmpTarget, state.camera.position, _up);
      _tmpQuat.setFromRotationMatrix(_tmpMat);
      // Blend only partway so objects *drift* toward facing you — dreamlike,
      // never a hard billboard. Hover tightens the gaze. The director's `face`
      // (climax) seizes the head outright — and it bypasses `freeze` on
      // purpose: the body locks mid-step while the head still turns to you.
      const driftAmt =
        (0.08 + hoverRef.current * 0.22) * (delta * 60) * (1 - frozen);
      const seized = v ? v.face * (delta * 60) * 1.4 : 0;
      const amt = driftAmt + seized;
      if (amt > 0.0001) turn.quaternion.slerp(_tmpQuat, Math.min(0.9, amt));
    }
  });

  const setHover = useCallback(
    (on: boolean) => {
      hoverTargetRef.current = on ? 1 : 0;
      if (typeof document !== "undefined") {
        document.body.style.cursor = on ? "pointer" : "";
      }
      onHover?.(on ? element.id : null);
    },
    [element.id, onHover],
  );

  // iOS Safari never dispatches a DOM `click` on a canvas, so r3f's onClick is
  // dead on iPhone (walking works there because pointer events DO fire). So we
  // detect a TAP from pointer events: short (<300ms) and still (<8px). A drag
  // (look-around) or a hold never counts.
  const tapRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const handleDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    const ne = e.nativeEvent;
    tapRef.current = { x: ne.clientX, y: ne.clientY, t: performance.now() };
  }, []);
  const handleUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const t0 = tapRef.current;
      tapRef.current = null;
      if (!t0) return;
      const ne = e.nativeEvent;
      const moved = Math.abs(ne.clientX - t0.x) + Math.abs(ne.clientY - t0.y);
      if (moved > 8 || performance.now() - t0.t > 300) return;
      e.stopPropagation();
      playPop(element.id);
      onSelect?.(element.id);
    },
    [element.id, onSelect],
  );

  const handleOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHover(true);
    },
    [setHover],
  );

  const handleOut = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHover(false);
    },
    [setHover],
  );

  // Clear the global cursor if we unmount while hovered.
  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") document.body.style.cursor = "";
    };
  }, []);

  return (
    <group ref={rootRef} position={element.position}>
      <group ref={turnRef}>
        <group rotation={element.rotation} scale={element.scale}>
          <group
            ref={floatRef}
            onPointerDown={handleDown}
            onPointerUp={handleUp}
            onPointerOver={handleOver}
            onPointerOut={handleOut}
          >
            {element.modelUrl ? (
              <ModelErrorBoundary
                key={element.modelUrl}
                fallback={<Placeholder glow={glow} hoverRef={hoverRef} calm={calm} />}
              >
                <Suspense fallback={<Placeholder glow={glow} hoverRef={hoverRef} calm={calm} />}>
                  <LoadedModel
                    url={element.modelUrl}
                    element={element}
                    glow={glow}
                    hoverRef={hoverRef}
                    phase={phase}
                    calm={calm}
                    params={params}
                  />
                </Suspense>
              </ModelErrorBoundary>
            ) : (
              <Placeholder glow={glow} hoverRef={hoverRef} calm={calm} />
            )}
          </group>
        </group>
      </group>
    </group>
  );
}
