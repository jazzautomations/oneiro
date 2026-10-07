"use client";

// @/components/DreamSky.tsx
// The dream atmosphere — and the home of the crystalline aurora.
//
// A very large inverted sphere (BackSide) surrounds the camera, painted by a
// custom animated shader: a soft domain-warped nebula tinted by the world's
// Palette, plus flowing violet→magenta→cyan iridescent bands. Per the Oniric
// Lacquer doctrine the crystalline aurora lives ONLY here, in the dream — it is
// always faintly present and surges during a warp or a surreal shift.
//
// Everything that changes at runtime (palette morph on warp, aurora surge, the
// white-out flash, surreal shift pulses) is driven through a shared mutable
// `fx` ref and per-frame color lerps, so the dream transforms smoothly with
// zero React re-renders. The matching scene fog is lerped the same way.

import { useMemo, useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Palette } from "@/lib/world";
import {
  CRYSTAL_VIOLET as HEX_VIOLET,
  CRYSTAL_MAGENTA as HEX_MAGENTA,
  CRYSTAL_CYAN as HEX_CYAN,
} from "@/lib/palette";

/* -------------------------------------------------------------------------- */
/*  Shared runtime FX channel (owned by DreamScene, read here every frame)    */
/* -------------------------------------------------------------------------- */

export interface SceneFx {
  /** 0..1 white-out flash during a warp. */
  warp: number;
  /** 0..~1 crystalline aurora strength (baseline small, surges on warp). */
  aurora: number;
  /** 0..1 surreal-shift pulse (slow timer; recolours + brightens). */
  shift: number;
}

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

export interface DreamSkyProps {
  /** Color scheme driving the sky + fog. Morphs smoothly when it changes. */
  palette: Palette;
  /** Shared FX channel (warp / aurora / shift), updated by the scene. */
  fx: React.RefObject<SceneFx>;
  /** Radius of the surrounding sky sphere. Default 120. */
  radius?: number;
  /** Animation speed multiplier (nebula drift). Default 1. */
  speed?: number;
  /** Fog density (exp2). 0 disables fog. Default 0.012. */
  fogDensity?: number;
  /** Overall nebula intensity 0..1. Default 1. */
  intensity?: number;
  /**
   * State curvature 0..1 (from the StateVector): deepens the domain-warp and
   * bends the log-polar form-constant family from rings toward rays. Default 0.
   */
  curvature?: number;
  /**
   * State intensity 0..1 (from the StateVector): adds aurora bands and raises
   * the form-constant frequency. Distinct from the nebula `intensity`. Default 0.
   */
  stateIntensity?: number;
  /**
   * Log-polar form-constant strength 0..1 (SceneParams.formConstant). A subtle,
   * crystalline Klüver layer gated to the dream moment. 0 = off. Default 0.
   */
  formConstant?: number;
  /** Reduced-motion / mobile: slow the drift, calm the breathing. */
  calm?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Color helpers                                                             */
/* -------------------------------------------------------------------------- */

function toColor(value: string | undefined, fallback: string): THREE.Color {
  const c = new THREE.Color();
  try {
    c.set(value && value.trim() ? value : fallback);
  } catch {
    c.set(fallback);
  }
  return c;
}

/** Pad / trim an accent list to exactly three colors for the shader. */
function accentTriplet(accents: string[] | undefined, bg: THREE.Color): THREE.Color[] {
  const list = Array.isArray(accents) ? accents.filter(Boolean) : [];
  const out: THREE.Color[] = [];
  for (let i = 0; i < 3; i++) {
    if (list[i]) {
      out.push(toColor(list[i], "#ffffff"));
    } else if (out.length > 0) {
      const prev = out[out.length - 1].clone();
      const hsl = { h: 0, s: 0, l: 0 };
      prev.getHSL(hsl);
      prev.setHSL((hsl.h + 0.08) % 1, hsl.s, Math.min(1, hsl.l + 0.08));
      out.push(prev);
    } else {
      const b = bg.clone();
      const hsl = { h: 0, s: 0, l: 0 };
      b.getHSL(hsl);
      b.setHSL((hsl.h + i * 0.12) % 1, Math.min(1, hsl.s + 0.3), Math.min(1, hsl.l + 0.25));
      out.push(b);
    }
  }
  return out;
}

// Crystalline tokens — one source of truth (@/lib/palette), matched to the
// OKLCH --color-neon-violet / -magenta / -cyan tokens in globals.css.
const CRYSTAL_VIOLET = new THREE.Color(HEX_VIOLET);
const CRYSTAL_MAGENTA = new THREE.Color(HEX_MAGENTA);
const CRYSTAL_CYAN = new THREE.Color(HEX_CYAN);

/* -------------------------------------------------------------------------- */
/*  Shaders                                                                   */
/* -------------------------------------------------------------------------- */

const VERTEX = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec3 vWorldDir;

  uniform float uTime;
  uniform float uIntensity;
  uniform float uWarp;
  uniform float uAurora;
  uniform float uShift;
  uniform float uCurvature;
  uniform float uStateIntensity;
  uniform float uFormConstant;
  uniform vec3 uBg;
  uniform vec3 uA0;
  uniform vec3 uA1;
  uniform vec3 uA2;
  uniform vec3 uC0; // crystalline violet
  uniform vec3 uC1; // crystalline magenta
  uniform vec3 uC2; // crystalline cyan

  vec3 hash3(vec3 p) {
    p = vec3(
      dot(p, vec3(127.1, 311.7, 74.7)),
      dot(p, vec3(269.5, 183.3, 246.1)),
      dot(p, vec3(113.5, 271.9, 124.6))
    );
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
            dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
        mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
            dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
      mix(
        mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
            dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
        mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
            dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y),
      u.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float t = uTime * 0.05;

    // Domain-warped fbm for a drifting, swirling nebula. Curvature deepens the
    // warp so a higher-curvature state swirls harder (never leaves the nebula).
    float warpGain = 1.0 + uCurvature * 0.9;
    vec3 q = dir * 1.6;
    vec3 warp = vec3(
      fbm(q + vec3(0.0, t, 0.0)),
      fbm(q + vec3(5.2, 1.3 - t, 1.1)),
      fbm(q + vec3(-2.4, 2.7, t * 0.5))
    ) * warpGain;
    float n1 = fbm(q + warp * 1.4 + vec3(t * 0.6, 0.0, -t * 0.3));
    float n2 = fbm(q * 2.3 + warp * 2.0 - vec3(0.0, t * 0.9, 0.0));

    float cloud = clamp(n1 * 0.75 + 0.5, 0.0, 1.0);
    float detail = clamp(n2 * 0.75 + 0.5, 0.0, 1.0);

    float vertical = dir.y * 0.5 + 0.5;
    float band = pow(1.0 - abs(dir.y), 1.5); // 1 at horizon, 0 at poles

    vec3 col = mix(uBg * 0.82, uBg, smoothstep(0.0, 1.0, vertical));

    float m0 = smoothstep(0.45, 0.85, cloud) * band;
    float m1 = smoothstep(0.55, 0.95, detail) * band;
    float m2 = smoothstep(0.35, 0.80, cloud * detail) * (0.4 + 0.6 * band);

    col = mix(col, uA0, m0 * 0.75 * uIntensity);
    col = mix(col, uA1, m1 * 0.65 * uIntensity);
    col = mix(col, uA2, m2 * 0.55 * uIntensity);

    float filament = pow(clamp(detail - cloud + 0.5, 0.0, 1.0), 3.0);
    col += uA0 * filament * 0.25 * uIntensity;

    // ---- Crystalline aurora: the dream moment. Flowing iridescent bands,
    //      always faintly alive, surging on warp / surreal shift. ---- //
    float auroraAmt = clamp(uAurora + uShift * 0.35, 0.0, 2.0);
    vec3 w2 = dir * 2.4 + vec3(t * 0.9, -t * 0.6, t * 0.4);
    float ab = fbm(w2 + warp * 1.3);
    // State intensity packs in more bands (higher imagery/event rate).
    float bandFreq = 3.0 + uStateIntensity * 4.0;
    float bands = sin((dir.y * bandFreq + ab * 4.0 + uTime * 0.22) * 3.14159265);
    bands = pow(clamp(bands * 0.5 + 0.5, 0.0, 1.0), 2.2);
    float hband = pow(1.0 - abs(dir.y), 1.2);
    float cyc = 0.5 + 0.5 * sin(uTime * 0.12 + ab * 2.0);
    vec3 aur = mix(uC0, uC1, cyc);
    aur = mix(aur, uC2, pow(bands, 1.5));
    col += aur * bands * hband * auroraAmt * 0.7;

    // ---- Log-polar form-constant layer (Klüver). The retino-cortical map
    //      w = log(z): one knob (curvature) sweeps rings -> spiral -> rays. Kept
    //      subtle + crystalline here so it belongs to the dream moment; a trip
    //      product drives uFormConstant far higher for the full entoptic lattice.
    if (uFormConstant > 0.001) {
      vec2 p = dir.xz / (abs(dir.y) + 0.35);
      float r = length(p) + 1e-3;
      float ang = atan(p.y, p.x);
      float lx = log(r);
      float al = uCurvature * 1.5707963;              // 0 rings -> PI/2 rays
      float k = 10.0 + uStateIntensity * 6.0;         // hypercolumn count
      float stripe = cos(k * (cos(al) * lx + sin(al) * ang) - uTime * 0.5);
      stripe = pow(clamp(stripe * 0.5 + 0.5, 0.0, 1.0), 2.0);
      float fc = uFormConstant * smoothstep(2.4, 0.2, r); // fade toward horizon
      vec3 ftint = mix(uC0, uC2, 0.5 + 0.5 * sin(uTime * 0.1 + lx * 2.0));
      col += ftint * stripe * fc * 0.16;
    }

    // Surreal shift gently lifts luminance + saturation.
    col *= 1.0 + uShift * 0.14;

    // Soft breathing luminance so the sky never feels static.
    float breathe = 0.5 + 0.5 * sin(uTime * 0.15);
    col *= 0.92 + 0.08 * breathe;

    // ---- Warp white-out: a crystalline bloom flash, not a clinical white. ---- //
    vec3 flash = mix(vec3(0.92, 0.97, 1.0), uC2, 0.22);
    col = mix(col, flash, smoothstep(0.0, 1.0, uWarp));
    col += uC0 * uWarp * 0.35;

    gl_FragColor = vec4(col, 1.0);

    #include <colorspace_fragment>
  }
`;

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The dream sky + crystalline aurora. Drop inside an r3f <Canvas>. Morphs
 * smoothly whenever `palette` changes (used for warps) and reacts every frame
 * to the shared `fx` channel. Installs matching, smoothly-lerped scene fog.
 */
export default function DreamSky({
  palette,
  fx,
  radius = 120,
  speed = 1,
  fogDensity = 0.012,
  intensity = 1,
  curvature = 0,
  stateIntensity = 0,
  formConstant = 0,
  calm = false,
}: DreamSkyProps) {
  const scene = useThree((s) => s.scene);

  const bg = palette?.bg ?? "#07040f";
  const fog = palette?.fog ?? bg;
  const accentsKey = (palette?.accents ?? []).join(",");

  // Build the material ONCE; colors are animated toward targets every frame.
  const material = useMemo(() => {
    const bgCol = toColor(bg, "#07040f");
    const [a0, a1, a2] = accentTriplet(palette?.accents, bgCol);
    return new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: THREE.MathUtils.clamp(intensity, 0, 1) },
        uWarp: { value: 0 },
        uAurora: { value: 0.12 },
        uShift: { value: 0 },
        uCurvature: { value: 0 },
        uStateIntensity: { value: 0 },
        uFormConstant: { value: 0 },
        uBg: { value: bgCol.clone() },
        uA0: { value: a0.clone() },
        uA1: { value: a1.clone() },
        uA2: { value: a2.clone() },
        uC0: { value: CRYSTAL_VIOLET.clone() },
        uC1: { value: CRYSTAL_MAGENTA.clone() },
        uC2: { value: CRYSTAL_CYAN.clone() },
      },
    });
    // Built once — palette changes flow through the target refs + lerp below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smoothly-morphed targets, updated whenever the palette prop changes.
  const targets = useRef({
    bg: toColor(bg, "#07040f"),
    a0: new THREE.Color(),
    a1: new THREE.Color(),
    a2: new THREE.Color(),
    fog: toColor(fog, bg),
  });

  useEffect(() => {
    const bgCol = toColor(bg, "#07040f");
    const [a0, a1, a2] = accentTriplet(palette?.accents, bgCol);
    targets.current.bg.copy(bgCol);
    targets.current.a0.copy(a0);
    targets.current.a1.copy(a1);
    targets.current.a2.copy(a2);
    targets.current.fog.copy(toColor(fog, bg));
  }, [bg, fog, accentsKey, palette?.accents]);

  // Keep uIntensity live if the prop changes.
  useEffect(() => {
    material.uniforms.uIntensity.value = THREE.MathUtils.clamp(intensity, 0, 1);
  }, [material, intensity]);

  // State-vector targets (curvature / intensity / form-constant). Lerped every
  // frame so a warp into a different mood eases its grammar rather than popping.
  const stateTargets = useRef({ curvature: 0, stateIntensity: 0, formConstant: 0 });
  useEffect(() => {
    stateTargets.current.curvature = THREE.MathUtils.clamp(curvature, 0, 1);
    stateTargets.current.stateIntensity = THREE.MathUtils.clamp(stateIntensity, 0, 1);
    stateTargets.current.formConstant = THREE.MathUtils.clamp(formConstant, 0, 1);
  }, [curvature, stateIntensity, formConstant]);

  // Dispose the GPU material on unmount / replace.
  useEffect(() => () => material.dispose(), [material]);

  // Install palette-tinted fog + a solid clear color; restore on cleanup.
  const fogObjRef = useRef<THREE.FogExp2 | null>(null);
  useEffect(() => {
    const prevFog = scene.fog;
    const prevBg = scene.background;

    if (fogDensity > 0) {
      const f = new THREE.FogExp2(targets.current.fog.getHex(), fogDensity);
      fogObjRef.current = f;
      scene.fog = f;
    } else {
      fogObjRef.current = null;
      scene.fog = null;
    }
    scene.background = targets.current.bg.clone();

    return () => {
      scene.fog = prevFog;
      scene.background = prevBg;
      fogObjRef.current = null;
    };
  }, [scene, fogDensity]);

  // Animate: advance time, lerp colors toward targets, apply the FX channel.
  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const u = material.uniforms;
    u.uTime.value += d * speed * (calm ? 0.45 : 1);

    // Framerate-independent color morph (used by warps between dreams).
    const k = 1 - Math.pow(0.02, d);
    (u.uBg.value as THREE.Color).lerp(targets.current.bg, k);
    (u.uA0.value as THREE.Color).lerp(targets.current.a0, k);
    (u.uA1.value as THREE.Color).lerp(targets.current.a1, k);
    (u.uA2.value as THREE.Color).lerp(targets.current.a2, k);

    const bgScene = scene.background;
    if (bgScene instanceof THREE.Color) bgScene.lerp(targets.current.bg, k);
    if (fogObjRef.current) fogObjRef.current.color.lerp(targets.current.fog, k);

    // Read the shared FX channel (warp flash, aurora surge, surreal shift).
    const f = fx.current;
    if (f) {
      u.uWarp.value = f.warp;
      u.uAurora.value = 0.12 + f.aurora;
      u.uShift.value = f.shift;
    }

    // Ease the state grammar toward its targets (same framerate-independent k).
    const st = stateTargets.current;
    u.uCurvature.value += (st.curvature - u.uCurvature.value) * k;
    u.uStateIntensity.value += (st.stateIntensity - u.uStateIntensity.value) * k;
    u.uFormConstant.value += (st.formConstant - u.uFormConstant.value) * k;
  });

  return (
    <mesh scale={[radius, radius, radius]} frustumCulled={false} renderOrder={-1000}>
      <sphereGeometry args={[1, 64, 32]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
