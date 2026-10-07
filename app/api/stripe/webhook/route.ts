// @/app/api/stripe/webhook/route.ts
// Stripe webhook: on a verified, paid `checkout.session.completed` from one of
// our Payment Links, grant the credits to the visitor in client_reference_id
// (+5 per add-on bought on the checkout page) and link the buyer's email.
// Signature is verified by hand (HMAC of `${t}.${body}`), so only
// STRIPE_WEBHOOK_SECRET is needed — no Stripe secret key on this server.

import crypto from "node:crypto";
import { getPackage, ORDER_BUMP } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verify(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  let t = "";
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") t = v;
    if (k === "v1" && v) v1.push(v);
  }
  if (!t || v1.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const e = Buffer.from(expected, "hex");
  return v1.some((sig) => {
    const s = Buffer.from(sig, "hex");
    return s.length === e.length && crypto.timingSafeEqual(s, e);
  });
}

interface Session {
  id?: string;
  payment_status?: string;
  client_reference_id?: string | null;
  amount_total?: number | null;
  metadata?: { packageId?: string } | null;
  customer_details?: { email?: string | null } | null;
}

const seen = new Set<string>();

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "not configured" }, { status: 503 });

  const raw = await request.text();
  if (!verify(raw, request.headers.get("stripe-signature"), secret)) {
    return Response.json({ error: "bad signature" }, { status: 400 });
  }

  let evt: { type?: string; data?: { object?: Session } };
  try {
    evt = JSON.parse(raw);
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (evt.type !== "checkout.session.completed") return Response.json({ received: true });

  const s = evt.data?.object ?? {};
  if (s.payment_status !== "paid") return Response.json({ received: true, unpaid: true });
  if (s.id && seen.has(s.id)) return Response.json({ received: true, duplicate: true });
  if (s.id) seen.add(s.id);

  const pkg = getPackage(s.metadata?.packageId ?? "");
  if (!pkg) return Response.json({ received: true, skipped: "not an Oneiro link" });

  // The +5 add-on is an optional item on the Stripe page: infer it from the total.
  const extraCents = Math.max(0, (s.amount_total ?? 0) - pkg.priceUsd * 100);
  const bumps = Math.floor(extraCents / (ORDER_BUMP.priceUsd * 100));
  const credits = pkg.credits + bumps * ORDER_BUMP.credits;

  const { grantCredits, grantByEmail, linkEmail } = await import("@/lib/ledger");
  const email = s.customer_details?.email ?? null;
  const visitorId = s.client_reference_id ?? null;
  let ok: boolean;
  if (visitorId) {
    if (email) linkEmail(visitorId, email);
    ok = grantCredits(visitorId, credits);
  } else if (email) {
    ok = grantByEmail(email, credits);
  } else {
    ok = false;
  }
  console.log(`[stripe] ${s.id} ${pkg.id} +${credits} credits -> ${visitorId?.slice(0, 8) ?? email} ok=${ok}`);
  return Response.json({ received: true, ok });
}
