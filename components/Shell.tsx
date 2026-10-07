"use client";
// @/components/Shell.tsx
// The slim product top bar: wordmark (home), a credits indicator, and the link
// into the diary. Presentational chrome only — it never touches the capture or
// build flow. Lives at the top of the landing column (parent owns the gutter),
// so it inherits the page's horizontal padding and stays a quiet hairline row.
//
// The credits indicator reads GET /api/me (visitor credits + whether the free
// first world is still available). The route is server-only and cookie-driven
// (httpOnly visitor id), so the fetch is same-origin with no payload. If the
// route is absent or the request fails, the indicator simply hides — the bar
// degrades to wordmark + diary link and nothing breaks.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Chip, cn } from "@/components/ui";
import { useOneiroStore } from "@/lib/store";
import { FIRST_WORLD_FREE } from "@/lib/pricing";
import AccountMenu from "@/components/AccountMenu";

/** Loose mirror of GET /api/me — parsed defensively, any field may be absent. */
interface MeResponse {
  credits?: number;
  free_used?: number | boolean;
  freeUsed?: boolean;
}

interface Me {
  credits: number;
  /** The free first world has not been spent yet (the viral hook). */
  freeAvailable: boolean;
}

function parseMe(data: unknown): Me | null {
  if (!data || typeof data !== "object") return null;
  const d = data as MeResponse;
  const credits = Number(d.credits);
  const freeUsed = Boolean(d.free_used ?? d.freeUsed);
  return {
    credits: Number.isFinite(credits) ? Math.max(0, Math.trunc(credits)) : 0,
    freeAvailable: FIRST_WORLD_FREE && !freeUsed,
  };
}

export default function Shell({ className }: { className?: string }) {
  const diaryCount = useOneiroStore((s) => s.diary.length);
  const [me, setMe] = useState<Me | null>(null);

  // One best-effort read on mount. Any failure (route missing, offline, bad
  // JSON) leaves `me` null and the credits chip hidden — never a thrown error.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "same-origin" });
        if (!res.ok) return;
        const data: unknown = await res.json().catch(() => null);
        if (alive) setMe(parseMe(data));
      } catch {
        /* indicator stays hidden */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <header className={cn("flex items-center justify-between gap-3 py-1", className)}>
      <Link
        href="/"
        className="font-display text-xl tracking-[0.02em] text-haze transition-colors hover:text-gold-pale"
      >
        Oneiro
      </Link>

      <div className="flex items-center gap-2 sm:gap-3">
        <CreditsIndicator me={me} />
        <Button href="/diary" variant="ghost" size="sm">
          seu diário
          {diaryCount > 0 && (
            <Chip gold className="ml-1 tnum">
              {diaryCount}
            </Chip>
          )}
        </Button>
        {/* Additive login chrome: self-degrades to a disabled "connect later"
            button when auth is unconfigured, so the guest bar is untouched. */}
        <AccountMenu />
      </div>
    </header>
  );
}

/** Gold chip: the free-world hook while it lasts, else the credit balance. */
function CreditsIndicator({ me }: { me: Me | null }) {
  if (!me) return null;

  if (me.freeAvailable) {
    return (
      <Chip gold title="Seu primeiro mundo é grátis">
        <SparkIcon />
        1º grátis
      </Chip>
    );
  }

  return (
    <Chip gold title={`${me.credits} créditos`}>
      <SparkIcon />
      <span className="tnum">{me.credits}</span>
    </Chip>
  );
}

function SparkIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v4M12 17v4M5 12H1M23 12h-4M6.3 6.3 3.5 3.5M20.5 20.5l-2.8-2.8M17.7 6.3l2.8-2.8M3.5 20.5l2.8-2.8" />
    </svg>
  );
}
