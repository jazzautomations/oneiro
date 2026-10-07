"use client";

// @/components/LoadingDream.tsx
// Full-screen oniric overlay shown while a dream is being transcribed,
// interpreted and sculpted into 3D ("o sonho está tomando forma").
//
// The point of this screen is to make ~30–60s of model generation feel
// alive and intentional rather than like a hung spinner. It layers:
//   1. a slowly drifting multi-stop nebula gradient (pure CSS),
//   2. a canvas particle field of glowing "dream motes" that breathe,
//      twinkle and drift upward (requestAnimationFrame),
//   3. a cycling set of poetic status lines that cross-fade,
//   4. a subtle, optional progress meter (ring + hairline bar).
//
// Everything is self-contained (no external deps beyond React), SSR-safe
// (all window/document/canvas access happens inside effects), and honors
// prefers-reduced-motion by falling back to a calm static field.

import { useEffect, useMemo, useRef, useState } from "react";

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

export interface LoadingDreamProps {
  /** Current build phase. Drives the headline + accent energy. */
  phase: string;
  /** Optional 0–100 progress. When omitted, the meter shows an indeterminate pulse. */
  progress?: number;
  /** Optional override for the cycling poetic status lines. */
  messages?: string[];
}

/* -------------------------------------------------------------------------- */
/*  Copy                                                                      */
/* -------------------------------------------------------------------------- */

/** Big headline per phase. Unknown phases fall back to the generating line. */
const PHASE_HEADLINE: Record<string, string> = {
  idle: "O sonho aguarda",
  listening: "Escutando o sonho",
  interpreting: "Lendo os símbolos",
  generating: "O sonho está tomando forma",
  ready: "O sonho despertou",
};

/** Poetic, slowly-cycling sub-lines. Portuguese to match the product voice. */
const DEFAULT_MESSAGES: string[] = [
  "dobrando o tempo em volta das imagens…",
  "pescando formas no fundo da memória…",
  "misturando cor, névoa e silêncio…",
  "dando peso ao que era só sensação…",
  "acordando objetos que nunca existiram…",
  "costurando o impossível com fios de luz…",
  "deixando as imperfeições virarem beleza…",
  "respirando vida no que foi sonhado…",
];

/* -------------------------------------------------------------------------- */
/*  Canvas particle field                                                     */
/* -------------------------------------------------------------------------- */

interface Mote {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  r: number; // radius px (at dpr=1)
  vx: number; // drift per second (normalized)
  vy: number;
  hue: number; // palette index 0..accents.length-1
  phase: number; // twinkle phase
  twinkle: number; // twinkle speed
  baseA: number; // base alpha
}

/** Dream accent colors (match globals.css neon tokens). [r,g,b] */
const ACCENTS: [number, number, number][] = [
  [157, 91, 255], // neon-violet
  [255, 61, 240], // neon-magenta
  [65, 232, 255], // neon-cyan
  [255, 111, 179], // neon-rose
  [255, 201, 105], // neon-gold
];

function seededMotes(count: number): Mote[] {
  // Deterministic-ish spread (no reliance on Math.random stability, but it's
  // purely decorative so Math.random is fine here on the client).
  const motes: Mote[] = [];
  for (let i = 0; i < count; i++) {
    motes.push({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 2.6,
      vx: (Math.random() - 0.5) * 0.012,
      vy: -(0.01 + Math.random() * 0.03), // gently rising
      hue: i % ACCENTS.length,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.6 + Math.random() * 1.6,
      baseA: 0.25 + Math.random() * 0.55,
    });
  }
  return motes;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function LoadingDream({ phase, progress, messages }: LoadingDreamProps) {
  const lines = useMemo(
    () => (messages && messages.length > 0 ? messages : DEFAULT_MESSAGES),
    [messages],
  );
  const headline = PHASE_HEADLINE[phase] ?? PHASE_HEADLINE.generating;

  const [lineIndex, setLineIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [slow, setSlow] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* ---- gentle "this is taking a while" reassurance ------------------- */
  // Tripo generation is slow and some elements may lag or time out. After a
  // threshold we reassure rather than let the loader feel hung — the world
  // still opens with whatever arrived (partial render is handled downstream).
  useEffect(() => {
    setSlow(false);
    if (phase !== "generating") return;
    const id = window.setTimeout(() => setSlow(true), 45_000);
    return () => window.clearTimeout(id);
  }, [phase]);

  /* ---- reduced-motion detection -------------------------------------- */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  /* ---- cycle the poetic lines ---------------------------------------- */
  useEffect(() => {
    if (lines.length <= 1) return;
    const id = window.setInterval(() => {
      setLineIndex((i) => (i + 1) % lines.length);
    }, 3800);
    return () => window.clearInterval(id);
  }, [lines]);

  // Keep the active line valid if the messages array shrinks.
  useEffect(() => {
    setLineIndex((i) => (i < lines.length ? i : 0));
  }, [lines.length]);

  /* ---- canvas particle animation ------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Scale mote count to area, but keep it modest on mobile.
    const area = Math.max(1, width * height);
    const count = Math.round(Math.min(140, Math.max(40, area / 9000)));
    const motes = seededMotes(count);

    let raf = 0;
    let last = performance.now();

    const drawMote = (m: Mote, alpha: number) => {
      const px = m.x * width;
      const py = m.y * height;
      const [r, g, b] = ACCENTS[m.hue];
      const radius = m.r * 6;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grad.addColorStop(0.4, `rgba(${r},${g},${b},${alpha * 0.4})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    const renderStatic = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      for (const m of motes) drawMote(m, m.baseA * 0.8);
      ctx.globalCompositeOperation = "source-over";
    };

    if (reduced) {
      renderStatic();
      const onResize = () => {
        resize();
        renderStatic();
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // clamp big gaps
      last = now;

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      for (const m of motes) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.phase += m.twinkle * dt;

        // wrap around the edges for an endless field
        if (m.y < -0.05) {
          m.y = 1.05;
          m.x = Math.random();
        }
        if (m.x < -0.05) m.x = 1.05;
        if (m.x > 1.05) m.x = -0.05;

        const twinkle = 0.55 + 0.45 * Math.sin(m.phase);
        drawMote(m, m.baseA * twinkle);
      }

      ctx.globalCompositeOperation = "source-over";
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [reduced]);

  /* ---- progress meter ------------------------------------------------- */
  const hasProgress = typeof progress === "number" && !Number.isNaN(progress);
  const pct = hasProgress ? Math.max(0, Math.min(100, progress as number)) : 0;

  // SVG ring geometry
  const R = 52;
  const C = 2 * Math.PI * R;
  const dash = hasProgress ? (pct / 100) * C : C * 0.28;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={headline}
      style={styles.root}
    >
      {/* Drifting nebula gradient background */}
      <div style={styles.nebula} className="oneiro-ld-nebula" aria-hidden />
      <div style={styles.vignette} aria-hidden />

      {/* Glowing particle field */}
      <canvas ref={canvasRef} style={styles.canvas} aria-hidden />

      {/* Content */}
      <div style={styles.center}>
        {/* Breathing dream orb + progress ring */}
        <div style={styles.orbWrap} className="oneiro-ld-float">
          <div style={styles.orbGlow} className="oneiro-ld-breathe" aria-hidden />
          <div style={styles.orbCore} className="oneiro-ld-breathe" aria-hidden />
          <svg
            width="140"
            height="140"
            viewBox="0 0 140 140"
            style={styles.ring}
            aria-hidden
          >
            <defs>
              <linearGradient id="oneiro-ld-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#9d5bff" />
                <stop offset="50%" stopColor="#ff3df0" />
                <stop offset="100%" stopColor="#41e8ff" />
              </linearGradient>
            </defs>
            <circle
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke="rgba(233,227,255,0.10)"
              strokeWidth="3"
            />
            <circle
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke="url(#oneiro-ld-grad)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`}
              transform="rotate(-90 70 70)"
              className={hasProgress ? undefined : "oneiro-ld-spin"}
              style={{
                transition: hasProgress ? "stroke-dasharray 0.6s ease" : undefined,
                transformOrigin: "70px 70px",
              }}
            />
          </svg>
          {hasProgress && (
            <div style={styles.pct}>{Math.round(pct)}%</div>
          )}
        </div>

        {/* Headline */}
        <h1 style={styles.headline} className="oneiro-ld-drift">
          {headline}
        </h1>

        {/* Cycling poetic line (cross-fades via key change) */}
        <p key={lineIndex} style={styles.line} className="oneiro-ld-fade">
          {lines[lineIndex] ?? lines[0]}
        </p>

        {/* Hairline progress bar */}
        <div style={styles.barTrack} aria-hidden>
          <div
            style={{
              ...styles.barFill,
              width: hasProgress ? `${pct}%` : "40%",
            }}
            className={hasProgress ? "oneiro-ld-drift" : "oneiro-ld-indeterminate"}
          />
        </div>

        {/* Slow-generation reassurance — appears only if it's really taking a
            while, never replacing the poetic cycle above. */}
        {slow && (
          <p style={styles.slowNote}>
            algumas formas demoram mais a nascer — já estamos quase lá
          </p>
        )}
      </div>

      {/* Scoped keyframes + reduced-motion fallbacks */}
      <style>{CSS}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inline styles                                                             */
/* -------------------------------------------------------------------------- */

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#07040f",
    color: "#e9e3ff",
    userSelect: "none",
  },
  nebula: {
    position: "absolute",
    inset: "-20%",
    backgroundImage: [
      "radial-gradient(40rem 40rem at 20% 25%, rgba(157,91,255,0.35), transparent 60%)",
      "radial-gradient(38rem 38rem at 82% 30%, rgba(255,61,240,0.28), transparent 58%)",
      "radial-gradient(44rem 44rem at 50% 95%, rgba(65,232,255,0.22), transparent 60%)",
      "radial-gradient(30rem 30rem at 70% 70%, rgba(255,111,179,0.20), transparent 55%)",
    ].join(","),
    backgroundRepeat: "no-repeat",
    filter: "blur(10px)",
  },
  vignette: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(130% 130% at 50% 50%, transparent 45%, rgba(7,4,15,0.85) 100%)",
    pointerEvents: "none",
  },
  canvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  },
  center: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    padding: "0 24px",
    maxWidth: "36rem",
  },
  orbWrap: {
    position: "relative",
    width: 140,
    height: 140,
    display: "grid",
    placeItems: "center",
    marginBottom: 28,
  },
  orbGlow: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: "9999px",
    background:
      "radial-gradient(circle at 50% 50%, rgba(255,61,240,0.55), rgba(157,91,255,0.25) 45%, transparent 70%)",
    filter: "blur(14px)",
  },
  orbCore: {
    position: "absolute",
    width: 70,
    height: 70,
    borderRadius: "9999px",
    background:
      "radial-gradient(circle at 35% 30%, #fff 0%, #ff8ff4 18%, #9d5bff 55%, #1d0f3f 100%)",
    boxShadow:
      "0 0 40px -6px rgba(255,61,240,0.7), inset 0 0 24px -6px rgba(255,255,255,0.6)",
  },
  ring: {
    position: "relative",
  },
  pct: {
    position: "absolute",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.04em",
    color: "#e9e3ff",
    textShadow: "0 0 12px rgba(157,91,255,0.8)",
  },
  headline: {
    margin: 0,
    fontSize: "clamp(1.6rem, 6vw, 2.6rem)",
    lineHeight: 1.1,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    backgroundImage:
      "linear-gradient(135deg, #9d5bff 0%, #ff3df0 45%, #41e8ff 100%)",
    backgroundSize: "220% 220%",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    textShadow: "0 0 36px rgba(157,91,255,0.25)",
  },
  line: {
    marginTop: 16,
    marginBottom: 0,
    minHeight: "1.6em",
    fontSize: "clamp(0.95rem, 3.4vw, 1.1rem)",
    color: "#a79cc9",
    fontStyle: "italic",
    letterSpacing: "0.01em",
  },
  barTrack: {
    marginTop: 32,
    width: "min(340px, 80vw)",
    height: 3,
    borderRadius: 9999,
    background: "rgba(233,227,255,0.10)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 9999,
    background:
      "linear-gradient(90deg, #9d5bff, #ff3df0, #41e8ff)",
    backgroundSize: "220% 220%",
    transition: "width 0.6s ease",
  },
  slowNote: {
    marginTop: 20,
    marginBottom: 0,
    fontSize: "clamp(0.8rem, 2.8vw, 0.9rem)",
    color: "#8a7fb0",
    letterSpacing: "0.01em",
  },
};

/* -------------------------------------------------------------------------- */
/*  Scoped CSS (keyframes)                                                    */
/* -------------------------------------------------------------------------- */

const CSS = `
@keyframes oneiro-ld-nebula-drift {
  0%   { transform: translate3d(0,0,0) scale(1); }
  50%  { transform: translate3d(2%, -2%, 0) scale(1.06); }
  100% { transform: translate3d(0,0,0) scale(1); }
}
@keyframes oneiro-ld-breathe {
  0%, 100% { transform: scale(0.94); opacity: 0.9; }
  50%      { transform: scale(1.06); opacity: 1; }
}
@keyframes oneiro-ld-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-10px); }
}
@keyframes oneiro-ld-text-drift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes oneiro-ld-fade-in {
  0%   { opacity: 0; transform: translateY(6px); }
  12%  { opacity: 1; transform: translateY(0); }
  88%  { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-6px); }
}
@keyframes oneiro-ld-spin {
  to { transform: rotate(270deg); }
}
@keyframes oneiro-ld-indeterminate {
  0%   { transform: translateX(-120%); }
  100% { transform: translateX(320%); }
}

.oneiro-ld-nebula { animation: oneiro-ld-nebula-drift 24s ease-in-out infinite; }
.oneiro-ld-breathe { animation: oneiro-ld-breathe 4.2s ease-in-out infinite; }
.oneiro-ld-float { animation: oneiro-ld-float 7s ease-in-out infinite; }
.oneiro-ld-drift { animation: oneiro-ld-text-drift 14s ease infinite; }
.oneiro-ld-fade { animation: oneiro-ld-fade-in 3.8s ease-in-out both; }
.oneiro-ld-spin { animation: oneiro-ld-spin 1.6s cubic-bezier(0.5,0,0.5,1) infinite; }
.oneiro-ld-indeterminate {
  width: 40% !important;
  animation: oneiro-ld-indeterminate 1.8s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .oneiro-ld-nebula,
  .oneiro-ld-breathe,
  .oneiro-ld-float,
  .oneiro-ld-drift,
  .oneiro-ld-fade,
  .oneiro-ld-spin,
  .oneiro-ld-indeterminate {
    animation: none !important;
  }
}
`;
