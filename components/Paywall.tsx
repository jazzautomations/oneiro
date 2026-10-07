"use client";
// @/components/Paywall.tsx
// The credit paywall, shown as an overlay when the dreamer runs out of free
// worlds (the build flow catches a 402 from /api/dream and opens this). It lists
// the credit packages from @/lib/pricing (the single source of truth shared with
// the checkout route + webhook) plus the one-click order bump, and sends the
// chosen package to POST /api/checkout, which replies with a Stripe Checkout URL
// we redirect to.
//
// On-doctrine "Oniric Lacquer": a flat lacquer panel on the warm void, one gold
// accent (the best-value pack), hairlines not glass, no blur. Mobile-first and
// reduced-motion aware.

import { useEffect, useState } from "react";
import { Button, Chip, Panel, cn } from "@/components/ui";
import { PACKAGES, ORDER_BUMP, type CreditPackage } from "@/lib/pricing";

interface MeResponse {
  credits: number;
  freeUsed: boolean;
}

interface CheckoutResponse {
  url?: string;
  error?: string;
}

export default function Paywall({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [entered, setEntered] = useState(false);
  // The +5 add-on is offered on the Stripe checkout page itself (optional item).
  const bump = false;
  const [credits, setCredits] = useState<number | null>(null);
  // Which package is mid-redirect (disables the grid), or an error line.
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One-shot fade-in whenever the overlay opens.
  useEffect(() => {
    if (!open) {
      setEntered(false);
      setPending(null);
      setError(null);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Show the current balance when we have it (purely informational).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/me")
      .then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : null))
      .then((data) => {
        if (alive && data) setCredits(data.credits);
      })
      .catch(() => {
        /* balance is a nicety — silently skip if it fails */
      });
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  const buy = async (pkg: CreditPackage) => {
    if (pending) return;
    setPending(pkg.id);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: pkg.id, bump }),
      });
      if (res.status === 503) {
        setError("Pagamentos ainda não estão disponíveis. Tente mais tarde.");
        setPending(null);
        return;
      }
      if (!res.ok) throw new Error("checkout failed");
      const data = (await res.json()) as CheckoutResponse;
      if (!data.url) throw new Error("no url");
      // Hand off to the Stripe Payment Link (tagged with this visitor).
      window.location.href = data.url;
    } catch {
      setError("Não consegui abrir o pagamento agora. Tente de novo.");
      setPending(null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !pending) onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-void px-5 py-[max(1.5rem,env(safe-area-inset-top))]"
      style={{
        backgroundImage:
          "radial-gradient(48rem 40rem at 50% 118%, oklch(72% 0.17 52 / 0.16), transparent 60%)",
      }}
    >
      <Panel
        className={cn(
          "relative my-auto w-full max-w-md p-7 transition-all duration-500 ease-out sm:p-9",
          "motion-reduce:transition-none",
          entered
            ? "translate-y-0 opacity-100"
            : "translate-y-3 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
        )}
      >
        {!pending && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 text-xs text-whisper transition-colors hover:text-mist"
          >
            fechar
          </button>
        )}

        <header className="text-center">
          <h2
            id="paywall-title"
            className="glow-text font-display text-3xl font-light leading-[1.1] sm:text-4xl"
          >
            Continue sonhando.
          </h2>
          <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-mist">
            Seu primeiro mundo foi por nossa conta. Pegue créditos para dar vida
            a mais sonhos — cada mundo custa 1 crédito.
          </p>
          {credits !== null && (
            <Chip className="mt-5">
              {credits === 0
                ? "0 créditos"
                : `${credits} ${credits === 1 ? "crédito" : "créditos"} restantes`}
            </Chip>
          )}
        </header>

        <div className="mt-7 space-y-3">
          {PACKAGES.map((pkg, i) => {
            const best = i === PACKAGES.length - 1;
            const total = bump ? pkg.credits + ORDER_BUMP.credits : pkg.credits;
            return (
              <div
                key={pkg.id}
                className={cn(
                  "flex items-center justify-between gap-4 rounded-[var(--radius-control)] border p-4",
                  best ? "border-hairline-gold" : "border-hairline",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg text-haze">
                      {pkg.label}
                    </span>
                    {best && <Chip gold>melhor valor</Chip>}
                  </div>
                  <p className="mt-1 text-xs text-mist">{pkg.tagline}</p>
                  <p className="mt-1 text-xs text-whisper">
                    {total} {total === 1 ? "crédito" : "créditos"}
                    {bump && (
                      <span className="text-gold-pale">
                        {" "}
                        (+{ORDER_BUMP.credits})
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={best ? "primary" : "ghost"}
                  onClick={() => buy(pkg)}
                  disabled={pending !== null}
                >
                  {pending === pkg.id
                    ? "…"
                    : `Comprar · $${bump ? pkg.priceUsd + ORDER_BUMP.priceUsd : pkg.priceUsd}`}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-center text-sm text-mist">
          No pagamento você pode adicionar <span className="text-gold-pale">{ORDER_BUMP.label}</span>.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-[var(--radius-control)] border border-neon-rose/40 bg-neon-rose/10 px-4 py-3 text-sm text-neon-rose"
          >
            {error}
          </p>
        )}

        <p className="mt-5 text-center text-xs text-whisper">
          Pagamento único e seguro via Stripe. Sem assinatura.
        </p>
      </Panel>
    </div>
  );
}
