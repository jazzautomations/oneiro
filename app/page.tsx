// @/app/page.tsx
// The front door: the marketing landing. The working maker — the full
// capture -> interpret -> generate -> scene -> diary -> gift flow — now lives
// verbatim at /create (app/create/page.tsx); this page is pure, static
// presentation and every primary CTA routes there.
//
// Server component (no "use client", no state): it just renders <Landing/>,
// which composes the shared ui.tsx primitives and the pure pricing data. No
// keys, no API calls, nothing that could 500 — so the door always opens, with
// or without auth/Stripe/Groq/Tripo configured.

import type { Metadata } from "next";
import Landing from "@/components/Landing";

export const metadata: Metadata = {
  description:
    "Fale um sonho e caminhe dentro dele. O Oneiro transforma sonhos falados em mundos 3D navegáveis que você guarda, revisita e presenteia. O primeiro é grátis.",
};

export default function HomePage(): React.JSX.Element {
  return <Landing />;
}
