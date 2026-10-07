#!/usr/bin/env bun
// Creates Oneiro's Paddle catalog + webhook + client token via the API and prints
// the env lines to add. Idempotent-ish: reuses a product named "Oneiro credits".
// usage: PADDLE_API_KEY=pdl_sdbx_... [PADDLE_ENV=sandbox|production] bun scripts/paddle-setup.mjs https://oneiro.jazzautomations.com.br
const KEY = process.env.PADDLE_API_KEY;
const ENV = process.env.PADDLE_ENV === "production" ? "production" : "sandbox";
const BASE = ENV === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
const SITE = (process.argv[2] || "https://oneiro.jazzautomations.com.br").replace(/\/$/, "");
if (!KEY) { console.error("PADDLE_API_KEY missing"); process.exit(2); }

async function api(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j.error ?? j)}`);
  return j.data;
}

const products = await api("GET", "/products?status=active&per_page=200");
let product = products.find((p) => p.name === "Oneiro credits");
if (!product) product = await api("POST", "/products", { name: "Oneiro credits", tax_category: "standard", description: "Credits to generate dream worlds in Oneiro." });
console.error("product:", product.id);

const prices = await api("GET", `/prices?product_id=${product.id}&status=active&per_page=200`);
const want = [
  ["PADDLE_PRICE_WANDERER", "Wanderer — 5 dreams", "700"],
  ["PADDLE_PRICE_DREAMER", "Dreamer — 15 dreams", "1500"],
  ["PADDLE_PRICE_BUMP", "+5 dreams", "500"],
];
const out = [];
for (const [env, desc, cents] of want) {
  let p = prices.find((x) => x.description === desc);
  if (!p) p = await api("POST", "/prices", { product_id: product.id, description: desc, name: desc, unit_price: { amount: cents, currency_code: "USD" } });
  out.push(`${env}=${p.id}`);
}

const dest = `${SITE}/api/paddle/webhook`;
const notifs = await api("GET", "/notification-settings");
let n = notifs.find((x) => x.destination === dest);
if (!n) n = await api("POST", "/notification-settings", { description: "Oneiro credits", destination: dest, type: "url", subscribed_events: ["transaction.completed"], api_version: 1 });
out.push(`PADDLE_WEBHOOK_SECRET=${n.endpoint_secret_key}`);

try {
  const t = await api("POST", "/client-tokens", { name: "oneiro-web" });
  out.push(`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=${t.token}`);
} catch (e) {
  console.error("client token via API failed (create it in Developer tools > Authentication):", e.message);
}
out.push(`PADDLE_ENV=${ENV}`, `NEXT_PUBLIC_PADDLE_ENV=${ENV}`);
console.log(out.join("\n"));
