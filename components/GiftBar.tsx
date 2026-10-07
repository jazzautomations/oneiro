"use client";

// @/components/GiftBar.tsx
// "Presentear este sonho" — publish the current World to /api/share and surface
// the resulting public /gift/<id> link with one-tap copy + native share.
//
// The world is POSTed exactly as /api/share expects ({ world }) and the route
// answers { id, url: "/gift/<id>" }. The relative url becomes absolute on the
// client (origin is browser-only) so the copied / shared link works anywhere.
//
// Doctrine: one accent (gold) on chrome, hairlines before shadows, flat panel,
// small radii. The gift ritual is the single warm moment here.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { World } from "@/lib/world";
import { Panel, Button, IconButton } from "@/components/ui";

export interface GiftBarProps {
  /** The world to gift. Its `id` + payload are published to /api/share. */
  world: World;
}

type ShareStatus = "idle" | "publishing" | "ready" | "error";

export default function GiftBar({ world }: GiftBarProps) {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  // Origin is browser-only; resolve it after mount so SSR markup matches.
  useEffect(() => {
    try {
      setOrigin(window.location.origin);
    } catch {
      setOrigin("");
    }
  }, []);

  // Reset any previously-published link if the world being viewed changes.
  useEffect(() => {
    setStatus("idle");
    setPath(null);
    setError(null);
    setCopied(false);
  }, [world.id]);

  const absoluteUrl = useMemo(
    () => (path ? `${origin}${path}` : ""),
    [origin, path],
  );

  const displayUrl = useMemo(() => {
    if (!path) return "";
    const base = origin.replace(/^https?:\/\//, "");
    return base ? `${base}${path}` : path;
  }, [origin, path]);

  const publish = useCallback(async () => {
    setStatus("publishing");
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ world }),
      });
      const data = (await res.json().catch(() => null)) as
        | { id?: string; url?: string; error?: string }
        | null;
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? "Não consegui publicar o sonho.");
      }
      setPath(data.url);
      setStatus("ready");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Algo deu errado ao presentear.",
      );
      setStatus("error");
    }
  }, [world]);

  const copy = useCallback(async () => {
    if (!absoluteUrl) return;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
    } catch {
      // Clipboard blocked (insecure context) — hidden-textarea fallback.
      try {
        const ta = document.createElement("textarea");
        ta.value = absoluteUrl;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        return;
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }, [absoluteUrl]);

  const nativeShare = useCallback(async () => {
    if (!absoluteUrl) return;
    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
    };
    if (typeof nav.share !== "function") {
      await copy();
      return;
    }
    try {
      await nav.share({
        title: world.title || "Um sonho em Oneiro",
        text: `Entre neste sonho: ${world.title || "um mundo onírico"}.`,
        url: absoluteUrl,
      });
    } catch {
      /* cancelled — the link is still on screen */
    }
  }, [absoluteUrl, copy, world.title]);

  const canNativeShare =
    typeof navigator !== "undefined" && "share" in navigator;

  return (
    <Panel className="w-full p-5 sm:p-6">
      {status !== "ready" ? (
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-semibold text-haze">
              Presentear este sonho
            </h3>
            <p className="mt-1 text-sm text-mist">
              Gere um link público para que alguém possa atravessá-lo.
            </p>
            {status === "error" && error ? (
              <p className="mt-2 text-sm text-neon-rose">{error}</p>
            ) : null}
          </div>

          <Button
            onClick={publish}
            disabled={status === "publishing"}
            className="shrink-0"
          >
            {status === "publishing" ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-void/40 border-t-void" />
                Tecendo o presente…
              </>
            ) : (
              <>
                <GiftIcon />
                presentear este sonho
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-neon-gold">
              <GiftIcon />
            </span>
            <h3 className="font-display text-xl font-semibold text-haze">
              Seu sonho virou presente
            </h3>
          </div>

          <div className="flex items-stretch gap-2">
            <a
              href={path ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="panel-inset min-w-0 flex-1 truncate px-4 py-3 text-sm text-mist transition-colors hover:border-hairline-gold hover:text-haze"
              title={absoluteUrl}
            >
              {displayUrl || "…"}
            </a>
            <IconButton
              label={copied ? "Link copiado" : "Copiar link"}
              onClick={copy}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </IconButton>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={nativeShare} size="sm">
              <ShareIcon />
              {canNativeShare ? "Compartilhar" : "Copiar link"}
            </Button>
            <button
              type="button"
              onClick={publish}
              className="text-sm text-whisper underline-offset-4 transition-colors hover:text-mist hover:underline"
            >
              gerar novo link
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Inline icons (consistent 2px stroke; gold carried by currentColor).
 * ------------------------------------------------------------------ */

function GiftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5 15.4 17.5" />
      <path d="M15.4 6.5 8.6 10.5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-neon-gold">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
