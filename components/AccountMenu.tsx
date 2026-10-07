"use client";
// @/components/AccountMenu.tsx
// Account chrome for the top bar. Login is ADDITIVE — this component never
// gates the guest flow. It reads the Auth.js session and the configured
// providers straight from the built-in endpoints (no SessionProvider needed),
// so it degrades on its own:
//
//   • auth NOT configured (no Google creds) -> a disabled "Entrar com Google"
//     button with a "em breve" tooltip. Never 500s, never blocks guests.
//   • configured + signed OUT -> an active "Entrar com Google" button.
//   • signed IN -> credits (GET /api/me) + the account email + "Sair".
//
// Every fetch is best-effort: any failure leaves the guest-looking fallback
// (the disabled connect-later button), so the bar always renders.

import { useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { Button, Chip, cn } from "@/components/ui";

interface Account {
  email: string;
  credits: number | null;
}

type State =
  | { status: "loading" }
  | { status: "guest"; configured: boolean }
  | { status: "account"; account: Account };

/** Is Google wired up? Empty /api/auth/providers means auth is unconfigured. */
async function fetchConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/providers", { credentials: "same-origin" });
    if (!res.ok) return false;
    const data: unknown = await res.json().catch(() => null);
    return Boolean(data && typeof data === "object" && "google" in data);
  } catch {
    return false;
  }
}

/** The signed-in email, or null (unconfigured / signed out / error). */
async function fetchEmail(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/session", { credentials: "same-origin" });
    if (!res.ok) return null;
    const data: unknown = await res.json().catch(() => null);
    if (data && typeof data === "object") {
      const user = (data as { user?: { email?: unknown } }).user;
      if (user && typeof user.email === "string") return user.email;
    }
    return null;
  } catch {
    return null;
  }
}

/** Current credit balance for the account (same source Shell reads). */
async function fetchCredits(): Promise<number | null> {
  try {
    const res = await fetch("/api/me", { credentials: "same-origin" });
    if (!res.ok) return null;
    const data: unknown = await res.json().catch(() => null);
    const credits = Number((data as { credits?: unknown } | null)?.credits);
    return Number.isFinite(credits) ? Math.max(0, Math.trunc(credits)) : null;
  } catch {
    return null;
  }
}

export default function AccountMenu({ className }: { className?: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      const email = await fetchEmail();
      if (email) {
        const credits = await fetchCredits();
        if (alive) setState({ status: "account", account: { email, credits } });
        return;
      }
      const configured = await fetchConfigured();
      if (alive) setState({ status: "guest", configured });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state.status === "loading") return null;

  if (state.status === "account") {
    const { email, credits } = state.account;
    return (
      <div className={cn("flex items-center gap-2 sm:gap-3", className)}>
        {credits !== null && (
          <Chip gold title={`${credits} créditos`}>
            <span className="tnum">{credits}</span>
          </Chip>
        )}
        <span
          title={email}
          className="hidden max-w-[11rem] truncate text-xs text-whisper sm:inline"
        >
          {email}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          Sair
        </Button>
      </div>
    );
  }

  // Guest. The button is the login affordance; when auth is not configured it
  // is a clear "connect later" placeholder (disabled + "em breve"), never a
  // dead end that errors.
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      disabled={!state.configured}
      title={state.configured ? "Entrar com sua conta Google" : "em breve"}
      onClick={state.configured ? () => void signIn("google") : undefined}
    >
      <GoogleGlyph />
      Entrar com Google
    </Button>
  );
}

function GoogleGlyph() {
  // Monochrome so it obeys the one-accent rule (no brand rainbow on chrome).
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 11v3.2h4.5c-.2 1.2-1.5 3.4-4.5 3.4-2.7 0-4.9-2.2-4.9-5s2.2-5 4.9-5c1.5 0 2.6.7 3.2 1.2l2.2-2.1C16.7 4.9 14.6 4 12 4 7.6 4 4 7.6 4 12s3.6 8 8 8c4.6 0 7.7-3.2 7.7-7.8 0-.5 0-.9-.1-1.2H12z" />
    </svg>
  );
}
