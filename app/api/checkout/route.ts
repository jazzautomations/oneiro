// @/app/api/checkout/route.ts
// POST { packageId, bump } -> create a Paddle transaction for a one-time credit
// purchase and return { url } (our /pay page with ?_ptxn=, where Paddle.js opens
// the checkout). Degrades to 503 when Paddle isn't configured, so the app keeps
// running without keys. The visitor id rides in custom_data; the webhook grants
// credits on transaction.completed.

import { ensureVisitorId } from "@/lib/identity";
import { getPackage, ORDER_BUMP } from "@/lib/pricing";
import { paddle } from "@/lib/paddle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originOf(request: Request): string {
  return request.headers.get("origin") || new URL(request.url).origin;
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.PADDLE_API_KEY) {
    return Response.json({ error: "payments not configured" }, { status: 503 });
  }

  let packageId = "";
  let bump = false;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    packageId = typeof body.packageId === "string" ? body.packageId.trim() : "";
    bump = body.bump === true;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const pkg = getPackage(packageId);
  if (!pkg) return Response.json({ error: "Unknown package." }, { status: 400 });

  const pkgPrice = process.env[pkg.priceEnv];
  if (!pkgPrice) return Response.json({ error: "payments not configured" }, { status: 503 });

  const items = [{ price_id: pkgPrice, quantity: 1 }];
  const bumpPrice = process.env[ORDER_BUMP.priceEnv];
  const bumpApplied = bump && !!bumpPrice;
  if (bumpApplied) items.push({ price_id: bumpPrice as string, quantity: 1 });

  const credits = pkg.credits + (bumpApplied ? ORDER_BUMP.credits : 0);
  const { id: visitorId, isNew, setCookie } = ensureVisitorId(request);

  try {
    const txn = await paddle<{ id: string; checkout?: { url?: string } | null }>("POST", "/transactions", {
      items,
      custom_data: { visitorId, packageId: pkg.id, bump: bumpApplied ? "1" : "0", credits: String(credits) },
      checkout: { url: `${originOf(request)}/pay` },
    });
    const url = txn.checkout?.url;
    if (!url) return Response.json({ error: "No checkout URL." }, { status: 502 });
    const res = Response.json({ url }, { status: 200 });
    if (isNew) res.headers.set("Set-Cookie", setCookie);
    return res;
  } catch (err) {
    console.error("[checkout] paddle:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Failed to create checkout." }, { status: 502 });
  }
}
