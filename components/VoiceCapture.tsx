"use client";
// @/components/VoiceCapture.tsx
// Mic-first dream capture. Big pulsing mic button + live transcription.
//
// Two capture paths, auto-selected at mount:
//   A) Web Speech API (SpeechRecognition / webkitSpeechRecognition, lang pt-BR):
//      streams LIVE interim + final transcription straight in the browser.
//   B) Fallback — no Web Speech: records the mic with MediaRecorder and POSTs
//      the audio Blob to /api/transcribe (server-side Groq Whisper).
//
// A <textarea> is ALWAYS present so the dream can be typed or edited by hand —
// it doubles as the no-mic / denied-permission fallback. No server keys here.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Button, cn } from "@/components/ui";
import { GOLD_PALE, EMBER } from "@/lib/palette";

/* ------------------------------------------------------------------ *
 * Minimal Web Speech API typings (absent from the standard DOM lib).
 * Declared locally to keep the module typecheck-clean without polluting
 * the global scope.
 * ------------------------------------------------------------------ */

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  readonly [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface SpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
  webkitAudioContext?: typeof AudioContext;
}

/**
 * iOS Safari exposes `webkitSpeechRecognition` but calling .start() freezes the
 * page (the dictation never streams results). So on iOS we never take the Web
 * Speech path — capture falls back to MediaRecorder → /api/transcribe (Whisper).
 */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as "Macintosh" but is a touch device.
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return iDevice || iPadOS;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  if (isIOS()) return null;
  const w = window as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* ignore and keep probing */
    }
  }
  return "";
}

function extForMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  return "wav";
}

function joinTranscript(prev: string, next: string): string {
  const a = prev.trim();
  const b = next.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
}

/* ------------------------------------------------------------------ *
 * Props
 * ------------------------------------------------------------------ */

export interface VoiceCaptureProps {
  /** Called with the final dream text when the dreamer submits. */
  onSubmit: (dreamText: string) => void;
  /** Disable all interaction (e.g. while the parent is building the world). */
  disabled?: boolean;
  /** Optional seed text (resume an edit). */
  initialText?: string;
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export default function VoiceCapture({
  onSubmit,
  disabled = false,
  initialText = "",
}: VoiceCaptureProps) {
  const [speechSupported, setSpeechSupported] = useState(false);
  const [recorderSupported, setRecorderSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [text, setText] = useState(initialText);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Imperative handles kept out of render.
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Tracks whether the user intends to keep recording (used to auto-restart
  // SpeechRecognition after Chrome's silence-driven onend).
  const wantRecordingRef = useRef(false);

  /* ---- capability detection (client only) ---- */
  useEffect(() => {
    setSpeechSupported(getSpeechRecognitionCtor() !== null);
    setRecorderSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined",
    );
    mimeRef.current = pickMimeType();
  }, []);

  /* ---- teardown helpers ---- */
  const stopVisualizer = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      void ctx.close().catch(() => {});
    }
    const canvas = canvasRef.current;
    const c2d = canvas?.getContext("2d");
    if (canvas && c2d) c2d.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
  }, []);

  const startVisualizer = useCallback((stream: MediaStream) => {
    try {
      // Honor reduced-motion: the waveform is decorative, so skip the animation
      // loop entirely (capture still works; the canvas just stays quiet).
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      const w = window as SpeechWindow;
      const Ctx = window.AudioContext ?? w.webkitAudioContext;
      if (!Ctx) return;
      const audioCtx = new Ctx();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      const bins = analyser.frequencyBinCount;
      const data = new Uint8Array(bins);

      // Read the warm-light tokens ONCE at start so the waveform tracks
      // --gradient-dream (gold-pale → ember) instead of baked-in hex.
      const cs = getComputedStyle(document.documentElement);
      const stop0 = cs.getPropertyValue("--color-gold-pale").trim() || GOLD_PALE;
      const stop1 = cs.getPropertyValue("--color-ember").trim() || EMBER;

      const draw = () => {
        rafRef.current = requestAnimationFrame(draw);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const c2d = canvas.getContext("2d");
        if (!c2d) return;

        const dpr =
          typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const cssW = canvas.clientWidth || 280;
        const cssH = canvas.clientHeight || 56;
        const w2 = Math.floor(cssW * dpr);
        const h2 = Math.floor(cssH * dpr);
        if (canvas.width !== w2 || canvas.height !== h2) {
          canvas.width = w2;
          canvas.height = h2;
        }

        analyser.getByteFrequencyData(data);
        c2d.clearRect(0, 0, canvas.width, canvas.height);

        const bars = 28;
        const step = Math.max(1, Math.floor(bins / bars));
        const gap = 3 * dpr;
        const barW = (canvas.width - gap * (bars - 1)) / bars;
        const gradient = c2d.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, stop0);
        gradient.addColorStop(1, stop1);
        c2d.fillStyle = gradient;

        for (let i = 0; i < bars; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) sum += data[i * step + j] ?? 0;
          const avg = sum / step / 255; // 0..1
          const minH = 2 * dpr;
          const h = minH + avg * (canvas.height - minH);
          const x = i * (barW + gap);
          const y = (canvas.height - h) / 2;
          const r = Math.min(barW / 2, 3 * dpr);
          c2d.beginPath();
          c2d.roundRect(x, y, barW, h, r);
          c2d.fill();
        }
      };
      draw();
    } catch {
      /* visualizer is best-effort; failure must not break capture */
    }
  }, []);

  /* ---- fallback: POST recorded audio to /api/transcribe ---- */
  const transcribeBlob = useCallback(async (blob: Blob) => {
    if (blob.size === 0) {
      setError("Nenhum áudio capturado. Tente de novo ou digite seu sonho.");
      return;
    }
    setTranscribing(true);
    setError(null);
    try {
      const ext = extForMime(blob.type || mimeRef.current);
      const form = new FormData();
      form.append("audio", blob, `dream.${ext}`);
      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : "Falha ao transcrever o áudio.";
        throw new Error(message);
      }
      const spoken =
        data && typeof data === "object" && "text" in data
          ? String((data as { text: unknown }).text ?? "")
          : "";
      setText((prev) => joinTranscript(prev, spoken));
      if (!spoken.trim()) {
        setError("Não entendi o áudio. Pode tentar de novo ou digitar.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Falha ao transcrever o áudio.",
      );
    } finally {
      setTranscribing(false);
    }
  }, []);

  /* ---- SpeechRecognition driver ---- */
  const startRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return false;
    try {
      const recognition = new Ctor();
      recognition.lang = "pt-BR";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let finalChunk = "";
        let interimChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const alt = result[0];
          if (!alt) continue;
          if (result.isFinal) finalChunk += alt.transcript;
          else interimChunk += alt.transcript;
        }
        if (finalChunk) setText((prev) => joinTranscript(prev, finalChunk));
        setInterim(interimChunk);
      };

      recognition.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setError(
            "Microfone bloqueado. Libere o acesso ou digite seu sonho abaixo.",
          );
          wantRecordingRef.current = false;
          setRecording(false);
          stopVisualizer();
          stopStream();
          return;
        }
        setError("A transcrição ao vivo falhou. Você pode digitar seu sonho.");
      };

      recognition.onend = () => {
        // Chrome stops on silence; restart while the dreamer still wants to talk.
        if (wantRecordingRef.current) {
          try {
            recognition.start();
            return;
          } catch {
            /* fall through to a clean stop */
          }
        }
        setInterim("");
        setRecording(false);
        stopVisualizer();
        stopStream();
      };

      recognitionRef.current = recognition;
      recognition.start();
      return true;
    } catch {
      setError("Não consegui iniciar a transcrição ao vivo.");
      return false;
    }
  }, [stopStream, stopVisualizer]);

  /* ---- MediaRecorder driver (fallback path) ---- */
  const startMediaRecorder = useCallback(
    (stream: MediaStream) => {
      try {
        const mime = mimeRef.current;
        const recorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
        chunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };
        recorder.onstop = () => {
          const type = recorder.mimeType || mime || "audio/webm";
          const blob = new Blob(chunksRef.current, { type });
          chunksRef.current = [];
          stopVisualizer();
          stopStream();
          void transcribeBlob(blob);
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        return true;
      } catch {
        setError("Não consegui gravar o áudio. Digite seu sonho abaixo.");
        return false;
      }
    },
    [stopStream, stopVisualizer, transcribeBlob],
  );

  /* ---- start / stop orchestration ---- */
  const startCapture = useCallback(async () => {
    if (disabled || recording || transcribing) return;
    setError(null);
    setInterim("");

    let stream: MediaStream | null = null;
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch {
      stream = null;
    }

    // Without a mic stream we can only use SpeechRecognition (own capture).
    if (!stream && !speechSupported) {
      setError(
        "Não consegui acessar o microfone. Libere a permissão ou digite seu sonho abaixo.",
      );
      return;
    }

    if (stream) {
      streamRef.current = stream;
      startVisualizer(stream);
    }

    wantRecordingRef.current = true;
    setRecording(true);

    if (speechSupported) {
      const ok = startRecognition();
      if (!ok) {
        // live transcription refused to start — degrade to recorder if we can
        wantRecordingRef.current = false;
        setRecording(false);
        if (stream && recorderSupported) {
          setRecording(true);
          wantRecordingRef.current = true;
          if (!startMediaRecorder(stream)) {
            wantRecordingRef.current = false;
            setRecording(false);
            stopVisualizer();
            stopStream();
          }
        } else {
          stopVisualizer();
          stopStream();
        }
      }
      return;
    }

    // Fallback path: record + server transcription.
    if (stream) {
      if (!startMediaRecorder(stream)) {
        wantRecordingRef.current = false;
        setRecording(false);
        stopVisualizer();
        stopStream();
      }
    }
  }, [
    disabled,
    recording,
    transcribing,
    speechSupported,
    recorderSupported,
    startRecognition,
    startMediaRecorder,
    startVisualizer,
    stopStream,
    stopVisualizer,
  ]);

  const stopCapture = useCallback(() => {
    wantRecordingRef.current = false;
    setInterim("");

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      // onend will flip recording off + tear down the stream/visualizer.
      return;
    }

    if (mediaRecorderRef.current) {
      setRecording(false);
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop(); // onstop -> transcribeBlob + teardown
          return;
        }
      } catch {
        /* ignore */
      }
    }

    setRecording(false);
    stopVisualizer();
    stopStream();
  }, [stopStream, stopVisualizer]);

  const toggleRecording = useCallback(() => {
    if (recording) stopCapture();
    else void startCapture();
  }, [recording, startCapture, stopCapture]);

  /* ---- unmount cleanup ---- */
  useEffect(() => {
    return () => {
      wantRecordingRef.current = false;
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        recognition.onend = null;
        recognition.onresult = null;
        recognition.onerror = null;
        try {
          recognition.abort();
        } catch {
          /* ignore */
        }
      }
      const recorder = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
      const stream = streamRef.current;
      streamRef.current = null;
      if (stream) for (const track of stream.getTracks()) track.stop();
    };
  }, []);

  /* ---- handlers ---- */
  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setText(event.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    const dream = text.trim();
    if (!dream || disabled || recording || transcribing) return;
    onSubmit(dream);
  }, [text, disabled, recording, transcribing, onSubmit]);

  /* ---- derived ---- */
  const liveText = joinTranscript(text, interim);
  const canSubmit =
    liveText.trim().length > 0 && !disabled && !recording && !transcribing;
  const busy = disabled || transcribing;

  const status = recording
    ? speechSupported
      ? "Ouvindo seu sonho…"
      : "Gravando… toque para encerrar"
    : transcribing
      ? "Transcrevendo o que você sonhou…"
      : disabled
        ? "Dando forma ao sonho…"
        : speechSupported || recorderSupported
          ? "Toque no microfone e conte seu sonho"
          : "Seu navegador não captura voz — escreva seu sonho abaixo";

  return (
    <section
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-7"
      aria-label="Capturar sonho por voz"
    >
      {/* The mic: the single warm light, a lacquer object on the void.
          No panel behind it — it IS the hero object. */}
      <div className="relative grid h-40 w-40 place-items-center">
        {recording && (
          <span
            aria-hidden
            className="animate-dream-pulse absolute inset-0 rounded-full bg-neon-gold/20 blur-2xl"
          />
        )}
        <button
          type="button"
          onClick={toggleRecording}
          disabled={busy}
          aria-pressed={recording}
          aria-label={
            recording ? "Parar gravação" : "Começar a gravar seu sonho"
          }
          className={cn(
            "relative z-10 grid h-32 w-32 place-items-center rounded-full",
            "border border-hairline-gold [background-image:var(--gradient-dream)]",
            "outline-none transition-transform duration-200",
            "disabled:cursor-not-allowed disabled:opacity-50",
            recording
              ? "scale-105 shadow-[0_0_64px_-12px_oklch(from_var(--color-neon-gold)_l_c_h_/_0.55)]"
              : "shadow-[0_0_44px_-16px_oklch(from_var(--color-neon-gold)_l_c_h_/_0.5)] hover:scale-105",
          )}
        >
          {/* The dark lens: a solid void core (no blur) so the gold ring reads. */}
          <span className="grid h-[6.75rem] w-[6.75rem] place-items-center rounded-full bg-void text-gold-pale">
            {recording ? (
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <rect
                  x="6"
                  y="6"
                  width="12"
                  height="12"
                  rx="2.5"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <path
                  d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"
                  fill="currentColor"
                />
                <path
                  d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        </button>
      </div>

      {/* Waveform — gold, appears only while listening */}
      <canvas
        ref={canvasRef}
        aria-hidden
        className={cn(
          "h-14 w-full max-w-sm transition-opacity duration-300",
          recording ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Status line */}
      <p
        className="min-h-5 text-center text-sm text-mist"
        role="status"
        aria-live="polite"
      >
        {status}
      </p>

      {/* Live / editable transcript — the one bounded surface */}
      <div className="w-full">
        <label htmlFor="dream-text" className="sr-only">
          Transcrição do sonho
        </label>
        <textarea
          id="dream-text"
          value={recording ? liveText : text}
          onChange={handleTextChange}
          readOnly={recording}
          disabled={disabled}
          rows={4}
          placeholder={
            speechSupported || recorderSupported
              ? "…ou escreva seu sonho aqui"
              : "Seu navegador não captura voz — escreva seu sonho aqui"
          }
          className="input w-full resize-none disabled:opacity-60"
        />
      </div>

      {error && (
        <p className="text-center text-sm text-neon-rose" role="alert">
          {error}
        </p>
      )}

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        size="lg"
        className="w-full sm:w-auto"
      >
        {transcribing ? "Transcrevendo…" : "Dar vida ao sonho"}
      </Button>
    </section>
  );
}
