// @/app/api/paddle/webhook/route.ts
// Paddle notification receiver. On a verified `transaction.completed`, grants
// the credits recorded in custom_data (set server-side at checkout) to the
// visitor, and links the buyer's email when Paddle gives us the customer.

import { verifyPaddleSignature, paddle } from "@/lib/paddle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PaddleEvent {
  event_id?: string;
  event_type?: string;
  data?: {
    id?: string;
    customer_id?: string | null;
    custom_data?: { visitorId?: string; credits?: string } | null;
  };
}

const seen = new Set<string>();

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "not configured" }, { status: 503 });

  const raw = await request.text();
  if (!verifyPaddleSignature(raw, request.headers.get("paddle-signature"), secret)) {
    return Response.json({ error: "bad signature" }, { status: 401 });
  }

  let evt: PaddleEvent;
  try {
    evt = JSON.parse(raw) as PaddleEvent;
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (evt.event_type !== "transaction.completed") return Response.json({ ok: true, ignored: evt.event_type });

  // Paddle retries; don't double-grant within this process lifetime.
  const key = evt.data?.id || evt.event_id || "";
  if (key && seen.has(key)) return Response.json({ ok: true, duplicate: true });
  if (key) seen.add(key);

  const visitorId = evt.data?.custom_data?.visitorId;
  const credits = Number(evt.data?.custom_data?.credits ?? 0);
  if (!visitorId || !Number.isFinite(credits) || credits <= 0) {
    return Response.json({ ok: true, skipped: "no visitor/credits" });
  }

  const { grantCredits, linkEmail } = await import("@/lib/ledger");
  if (evt.data?.customer_id) {
    try {
      const c = await paddle<{ email?: string }>("GET", `/customers/${evt.data.customer_id}`);
      if (c.email) linkEmail(visitorId, c.email);
    } catch {
      /* email link is best-effort */
    }
  }
  const ok = grantCredits(visitorId, credits);
  console.log(`[paddle] ${evt.data?.id} -> +${credits} credits to ${visitorId.slice(0, 8)}… ok=${ok}`);
  return Response.json({ ok });
}
