// @/app/api/stripe/webhook/route.ts
// Stripe webhook receiver. On a verified `checkout.session.completed` it grants
// the purchased credits to the buyer and links their email in the ledger.
//
// Graceful degradation: with no STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY the
// route is a no-op 200, so the build and the app run with no Stripe keys set.
// Signature is verified against the RAW request body (request.text()); keys are
// read from env and never logged.

import Stripe from "stripe";
import { getPackage, ORDER_BUMP } from "@/lib/pricing";

export const runtime = "nodejs";
// Raw-body signature verification per request; never cache.
export const dynamic = "force-dynamic";

/** Credits a completed session bought, from the metadata we set at checkout. */
function creditsForSession(session: Stripe.Checkout.Session): number {
  const packageId = session.metadata?.packageId;
  const bump = session.metadata?.bump === "1";
  const pkg = packageId ? getPackage(packageId) : undefined;
  const base = pkg ? pkg.credits : 0;
  return base + (bump ? ORDER_BUMP.credits : 0);
}

function buyerEmail(session: Stripe.Checkout.Session): string | null {
  return session.customer_details?.email || session.customer_email || null;
}

export async function POST(request: Request): Promise<Response> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // No keys -> payments not configured. Acknowledge so Stripe (or a probe)
  // doesn't retry, but do nothing.
  if (!secretKey || !webhookSecret) {
    return Response.json({ received: true }, { status: 200 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing signature." }, { status: 400 });
  }

  const stripe = new Stripe(secretKey);

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch {
    // Bad signature / malformed payload — do not trust it.
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    // Not a purchase completion — acknowledge and ignore.
    return Response.json({ received: true }, { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const credits = creditsForSession(session);
  const visitorId = session.metadata?.visitorId || null;
  const email = buyerEmail(session);

  if (credits <= 0) {
    return Response.json({ received: true }, { status: 200 });
  }

  // Imported at request time, not module load: the ledger pulls in bun:sqlite,
  // which only resolves under Bun (the runtime host) — never in next build's
  // Node page-data workers. A static import would break the build.
  const { grantCredits, grantByEmail, linkEmail } = await import("@/lib/ledger");

  if (visitorId) {
    // Link the email we just learned (folds in any webhook-first parked
    // credits), then grant this purchase onto the known visitor.
    if (email) linkEmail(visitorId, email);
    grantCredits(visitorId, credits);
  } else if (email) {
    // No visitor in metadata — attach by email (parks on a placeholder row if
    // no visitor has linked this email yet).
    grantByEmail(email, credits);
  }

  return Response.json({ received: true }, { status: 200 });
}
