"use client";

// @/components/DreamChat.tsx
// "Conversar com o sonho" — an optional, controlled slide-in where the dream
// answers in first person (Groq, grounded in this world). Voice-or-text input.
// Docked to the right with NO scrim, so the silent wander keeps running behind
// it; opening it is always a deliberate choice, never the default screen.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { World } from "@/lib/world";
import { IconButton, cn } from "@/components/ui";

/* ------------------------------------------------------------------ *
 * Minimal Web Speech typings (absent from the DOM lib).
 * ------------------------------------------------------------------ */
interface SpeechAlt {
  readonly transcript: string;
}
interface SpeechResult {
  readonly isFinal: boolean;
  readonly [i: number]: SpeechAlt;
}
interface SpeechResultList {
  readonly length: number;
  readonly [i: number]: SpeechResult;
}
interface SpeechEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechResultList;
}
interface SpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type SpeechCtor = new () => SpeechRecognition;
interface SpeechWin extends Window {
  SpeechRecognition?: SpeechCtor;
  webkitSpeechRecognition?: SpeechCtor;
}

function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as SpeechWin;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* keep probing */
    }
  }
  return "";
}

function extFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  return "wav";
}

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */
interface Msg {
  role: "user" | "assistant";
  content: string;
}

export interface DreamChatProps {
  world: World;
  open: boolean;
  onClose: () => void;
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */
export default function DreamChat({ world, open, onClose }: DreamChatProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("");
  const baseDraftRef = useRef("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  /* ---- capability detection ---- */
  useEffect(() => {
    const hasSpeech = speechCtor() !== null;
    const hasRecorder =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined";
    setVoiceSupported(hasSpeech || hasRecorder);
    mimeRef.current = pickMime();
  }, []);

  /* ---- scroll to newest ---- */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending, open]);

  /* ---- focus the field when opened ---- */
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 260);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  /* ---- teardown mic on unmount ---- */
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stopStream();
    },
    [stopStream],
  );

  /* ---- send a turn ---- */
  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;

      const next = [...messages, { role: "user" as const, content }];
      setMessages(next);
      setDraft("");
      setError(null);
      setSending(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: {
              title: world.title,
              dreamText: world.dreamText,
              mood: world.mood,
              reading: world.reading,
              elements: world.elements.map((e) => ({
                name: e.name,
                meaning: e.meaning,
              })),
            },
            messages: next,
          }),
        });
        const data = (await res.json().catch(() => null)) as
          | { reply?: string; error?: string }
          | null;
        if (!res.ok || !data?.reply) {
          throw new Error(data?.error ?? "O sonho ficou em silêncio.");
        }
        setMessages((m) => [...m, { role: "assistant", content: data.reply! }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Algo se desfez.");
      } finally {
        setSending(false);
      }
    },
    [messages, sending, world],
  );

  const onSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      void send(draft);
    },
    [draft, send],
  );

  /* ---- voice: Web Speech streaming, else record + transcribe ---- */
  const startSpeech = useCallback((Ctor: SpeechCtor) => {
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    baseDraftRef.current = "";
    setDraft((d) => {
      baseDraftRef.current = d ? d + " " : "";
      return d;
    });
    rec.onresult = (e: SpeechEvent) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setDraft((baseDraftRef.current + text).trimStart());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = mimeRef.current;
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stopStream();
        setListening(false);
        const blob = new Blob(chunksRef.current, {
          type: mime || "audio/webm",
        });
        if (blob.size === 0) return;
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, `dream.${extFor(mime)}`);
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          const data = (await res.json().catch(() => null)) as
            | { text?: string; error?: string }
            | null;
          if (res.ok && data?.text) {
            setDraft((d) => (d ? `${d} ${data.text}`.trim() : data.text!.trim()));
          }
        } catch {
          /* ignore — the field is still typeable */
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setError("Não consegui acessar o microfone.");
    }
  }, [stopStream]);

  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      setListening(false);
      return;
    }
    setError(null);
    const Ctor = speechCtor();
    if (Ctor) startSpeech(Ctor);
    else void startRecording();
  }, [listening, startSpeech, startRecording]);

  return (
    <aside
      aria-label="Conversar com o sonho"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex w-[min(92vw,26rem)] flex-col",
        "border-l border-hairline bg-abyss",
        "transition-transform duration-300 ease-out motion-reduce:transition-none",
        open ? "translate-x-0" : "pointer-events-none translate-x-full",
      )}
      style={{
        boxShadow: "-24px 0 70px -48px oklch(2% 0.01 296 / 0.9)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* header */}
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="h-4 w-px bg-neon-gold"
            style={{ boxShadow: "0 0 10px oklch(84% 0.13 82 / 0.5)" }}
          />
          <p className="max-w-[16rem] truncate font-display text-base text-haze">
            {world.title}
          </p>
        </div>
        <IconButton label="Fechar conversa" onClick={onClose}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </IconButton>
      </header>

      {/* transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
        {messages.length === 0 ? (
          <p className="mt-2 max-w-[22rem] font-display text-lg font-light leading-relaxed text-mist">
            Fale comigo. Sou o sonho que você sonhou — pergunte o que quiser às
            minhas formas, e eu respondo de dentro delas.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <li
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <span
                  className={cn(
                    "max-w-[85%] rounded-[var(--radius-control)] px-3.5 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "border border-hairline-gold bg-neon-gold/[0.06] text-haze"
                      : "border border-hairline bg-void/60 font-display text-base font-light text-mist",
                  )}
                >
                  {m.content}
                </span>
              </li>
            ))}
            {sending && (
              <li className="flex justify-start">
                <span className="animate-dream-pulse text-sm text-whisper">
                  o sonho responde…
                </span>
              </li>
            )}
          </ul>
        )}
      </div>

      {error && (
        <p role="alert" className="px-5 pb-2 text-sm text-neon-rose">
          {error}
        </p>
      )}

      {/* composer */}
      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 border-t border-hairline px-4 py-4"
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          rows={1}
          placeholder={
            listening
              ? "ouvindo…"
              : transcribing
                ? "transcrevendo…"
                : "escreva ou fale com o sonho"
          }
          className="input max-h-32 min-h-[2.75rem] flex-1 resize-none"
          disabled={sending}
        />
        {voiceSupported && (
          <IconButton
            label={listening ? "Parar de ouvir" : "Falar com o sonho"}
            onClick={toggleVoice}
            disabled={sending || transcribing}
            aria-pressed={listening}
            className={cn(
              listening &&
                "animate-dream-pulse border-hairline-gold text-neon-gold",
            )}
          >
            <MicIcon />
          </IconButton>
        )}
        <IconButton
          label="Enviar"
          type="submit"
          disabled={sending || !draft.trim()}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12 14-7-5 14-3-6-6-1Z" />
          </svg>
        </IconButton>
      </form>
    </aside>
  );
}

function MicIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
