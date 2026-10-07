// @/lib/pricing.ts
// The single source of truth for what Oneiro sells. Pure data — NO process.env,
// NO side effects — so the UI, the checkout route and the Stripe webhook all
// agree on ids, prices and credit amounts by importing from here.
//
// Each package carries the NAME of the env var that holds its Stripe Payment Link URL
// (never the id itself); server code resolves process.env[pkg.priceEnv]
// at request time. Prices are the human-facing truth; the Stripe prices + Payment Links
// (with the +5 bump as an optional item) were created to match.

/** A one-time credit pack purchasable via a Stripe Payment Link. */
export interface CreditPackage {
  /** Stable slug used in URLs, checkout and the webhook. */
  id: string;
  /** Human-facing name. */
  label: string;
  /** One-line value framing for the UI. */
  tagline: string;
  /** Price in whole US dollars. */
  priceUsd: number;
  /** Credits granted on purchase. */
  credits: number;
  /** Name of the env var holding this package's Stripe Payment Link URL. */
  priceEnv: string;
}

/** An optional add-on offered at checkout (the "order bump"). */
export interface OrderBump {
  credits: number;
  priceUsd: number;
  priceEnv: string;
  label: string;
}

/**
 * The first world a visitor generates is free — the viral hook. The ledger
 * tracks this per visitor via the `free_used` flag.
 */
export const FIRST_WORLD_FREE = true as const;

/** 1 credit = 1 world generation, or 1 single-object edit/regeneration. */
export const CREDITS_PER_WORLD = 1 as const;
export const CREDITS_PER_OBJECT_EDIT = 1 as const;

/** The one-time credit packages, cheapest first. */
export const PACKAGES: readonly CreditPackage[] = [
  {
    id: "wanderer",
    label: "Wanderer",
    tagline: "A handful of worlds to explore.",
    priceUsd: 7,
    credits: 5,
    priceEnv: "STRIPE_LINK_WANDERER",
  },
  {
    id: "dreamer",
    label: "Dreamer",
    tagline: "Dream often. Best value.",
    priceUsd: 15,
    credits: 15,
    priceEnv: "STRIPE_LINK_DREAMER",
  },
] as const;

/** "+5 credits for $5" shown as a one-click add-on at checkout. */
export const ORDER_BUMP: OrderBump = {
  credits: 5,
  priceUsd: 5,
  priceEnv: "STRIPE_PRICE_BUMP",
  label: "+5 credits for $5",
} as const;

/** All package ids, for validating untrusted input. */
export type PackageId = (typeof PACKAGES)[number]["id"];

/** Look up a package by id, or undefined if the id is unknown. Pure. */
export function getPackage(id: string): CreditPackage | undefined {
  return PACKAGES.find((p) => p.id === id);
}
