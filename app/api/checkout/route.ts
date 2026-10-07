// @/app/api/checkout/route.ts
// POST { packageId } -> { url }: the package's Stripe Payment Link, tagged with
// this visitor (client_reference_id) so the webhook can grant credits to the
// right browser. No Stripe secret key needed server-side. Returns 503 when the
// link isn't configured, so the app keeps running without payments.

import { ensureVisitorId } from "@/lib/identity";
import { getPackage } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let packageId = "";
  try {
    const body = (await request.json()) as Record<string, unknown>;
    packageId = typeof body.packageId === "string" ? body.packageId.trim() : "";
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const pkg = getPackage(packageId);
  if (!pkg) return Response.json({ error: "Unknown package." }, { status: 400 });

  const link = process.env[pkg.priceEnv];
  if (!link) return Response.json({ error: "payments not configured" }, { status: 503 });

  const { id: visitorId, isNew, setCookie } = ensureVisitorId(request);
  const url = new URL(link);
  url.searchParams.set("client_reference_id", visitorId);

  const res = Response.json({ url: url.toString() }, { status: 200 });
  if (isNew) res.headers.set("Set-Cookie", setCookie);
  return res;
}
