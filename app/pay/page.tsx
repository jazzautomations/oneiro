"use client";
// @/app/pay/page.tsx
// Paddle's checkout landing: Paddle.js reads ?_ptxn= and opens the overlay.
// On completion we send the dreamer back to dream, credits granted by webhook.

import Script from "next/script";
import { useState } from "react";

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: string) => void };
      Initialize: (opts: { token: string; eventCallback?: (e: { name?: string }) => void }) => void;
    };
  }
}

export default function PayPage(): React.JSX.Element {
  const [msg, setMsg] = useState("abrindo o pagamento…");
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const env = process.env.NEXT_PUBLIC_PADDLE_ENV || "sandbox";

  const init = () => {
    const P = window.Paddle;
    if (!P || !token) {
      setMsg("Pagamentos ainda não estão disponíveis.");
      return;
    }
    if (env !== "production") P.Environment.set("sandbox");
    P.Initialize({
      token,
      eventCallback: (e) => {
        if (e.name === "checkout.completed") {
          setMsg("pronto — seus créditos chegam em instantes.");
          setTimeout(() => (window.location.href = "/create?checkout=success"), 2500);
        }
        if (e.name === "checkout.closed") window.location.href = "/create";
      },
    });
  };

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-6 text-center">
      <Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="afterInteractive" onLoad={init} />
      <p className="font-display text-xl italic text-mist">{msg}</p>
    </main>
  );
}
