# Oneiro — Tripothon S1 submission (draft)

## Title
Oneiro — walk inside your dream

## One-liner
Tell Oneiro a dream. It becomes a 3D place you can walk into — every object generated from your words with Tripo — and plays back as a short staged vignette, like a scene from Kurosawa's *Dreams*.

## Description
Most dream apps are text diaries. Oneiro turns the dream itself into a place.

You speak or type a dream ("a giant ant walking through the city, people running below"). An LLM reads it faithfully and picks the 3–5 concrete things the dream actually contained. Each one is generated as a real 3D object with **Tripo text-to-3D** (text_to_model, PBR, web-weight settings) and placed into a navigable first-person scene: a warm near-black void, a ground that fades into fog, your objects planted at true scale — a 13-unit skyscraper, a 6-unit ant, a 1-unit runner.

Then the dream *happens*. Each dream plays as a short vignette with a shape borrowed from Kurosawa's *Dreams* and *LSD: Dream Emulator*: a title card (“I had a dream like this”), the dream going live as a presence emerges from the fog and comes toward you, a climax if you stare at it or get too close (it closes in, you can't move, the sound cuts), a hard cut to black — and then the morning note: your dream, written back into your journal. Touching an object links you to the next dream.

Oneiro is a product, not a demo: dream journal, editable worlds, gift links so you can send someone your dream, and metered generation (first dream free).

## How Tripo is used
- Tripo API v2 `text_to_model` for every object in every dream (3–5 generations per dream), PBR on, face_limit/texture tuned for the web so a whole dream loads on a phone.
- Objects are normalized and scaled by narrative "footprint" (tiny / human / large / huge) so a skyscraper and an ant from the same dream read at the right scale together.
- The whole pipeline — speech → interpretation → Tripo → playable vignette — runs in about two minutes.

## Links
- Live demo (phone or desktop, WebGL2): https://oneiro.170.9.240.8.sslip.io/dream/ant-city-demo
- Make your own dream: https://oneiro.170.9.240.8.sslip.io/create
- Repo: (public GitHub link — pending)
- Video: (pending)

## Stack
Next.js 16 · react-three-fiber / three · Tripo3D API · Groq (LLM + Whisper) · deployed on an Oracle ARM box (bun + Caddy).
