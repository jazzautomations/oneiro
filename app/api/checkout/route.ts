// @/app/api/checkout/route.ts
// POST { packageId, bump } -> create a Stripe Checkout Session for a one-time
// credit purchase and return { url } for the client to redirect to.
//
// Payments degrade gracefully: when STRIPE_SECRET_KEY (or the package's Stripe
// Price id) is absent the route returns 503 so the build and the app keep
// running with no Stripe keys set. Keys and price ids are read from env at
// request time — never hardcoded, never logged.
//
// The visitor is identified by the signed `oneiro_vid` cookie (see
// @/lib/identity) and carried into the session via client_reference_id +
// metadata; the webhook later links the buyer's email and grants credits.

import Stripe from "stripe";
import { ensureVisitorId } from "@/lib/identity";
import { getPackage, ORDER_BUMP } from "@/lib/pricing";

export const runtime = "nodejs";
// Creates a live Stripe session per request; never cache.
export const dynamic = "force-dynamic";

interface CheckoutBody {
  packageId: string;
  bump: boolean;
}

function parseBody(value: unknown): CheckoutBody | null {
  if (!value || typeof value !== "object") return null;
  const { packageId, bump } = value as Record<string, unknown>;
  if (typeof packageId !== "string" || !packageId.trim()) return null;
  return { packageId: packageId.trim(), bump: bump === true };
}

/** The app's own origin, for success/cancel redirects back into the app. */
function originOf(request: Request): string {
  return request.headers.get("origin") || new URL(request.url).origin;
}

export async function POST(request: Request): Promise<Response> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return Response.json(
      { error: "payments not configured" },
      { status: 503 },
    );
  }

  let body: CheckoutBody | null;
  try {
    body = parseBody(await request.json());
  } catch {
    return Response.json(
      { error: "Invalid JSON body. Expected { packageId, bump }." },
      { status: 400 },
    );
  }
  if (!body) {
    return Response.json(
      { error: "packageId is required." },
      { status: 400 },
    );
  }

  const pkg = getPackage(body.packageId);
  if (!pkg) {
    return Response.json(
      { error: `Unknown package "${body.packageId}".` },
      { status: 400 },
    );
  }

  // Resolve Stripe Price ids from env at request time (pricing never reads env).
  // A missing package price means payments aren't fully configured -> 503.
  const pkgPriceId = process.env[pkg.stripePriceEnv];
  if (!pkgPriceId) {
    return Response.json(
      { error: "payments not configured" },
      { status: 503 },
    );
  }

  const lineItems: { price: string; quantity: number }[] = [
    { price: pkgPriceId, quantity: 1 },
  ];

  // Order bump is optional: include it only when requested AND its price id is
  // configured, so a missing bump price never blocks the core purchase.
  const bumpPriceId = process.env[ORDER_BUMP.stripePriceEnv];
  const bumpApplied = body.bump && !!bumpPriceId;
  if (bumpApplied) {
    lineItems.push({ price: bumpPriceId as string, quantity: 1 });
  }

  const { id: visitorId, isNew, setCookie } = ensureVisitorId(request);
  const origin = originOf(request);

  const stripe = new Stripe(secretKey);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      metadata: {
        visitorId,
        packageId: pkg.id,
        bump: bumpApplied ? "1" : "0",
      },
      client_reference_id: visitorId,
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
    });

    if (!session.url) {
      return Response.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 502 },
      );
    }

    const res = Response.json({ url: session.url }, { status: 200 });
    if (isNew) res.headers.set("Set-Cookie", setCookie);
    return res;
  } catch {
    // Never surface Stripe internals / keys to the client or logs.
    return Response.json(
      { error: "Failed to create checkout session." },
      { status: 502 },
    );
  }
}
