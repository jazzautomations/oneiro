# Task for Devin — record the Oneiro demo video (Tripothon S1 submission)

## Goal
Produce a smooth screen recording (mp4, 30fps) of the live Oneiro dream vignette, phone-first, for a hackathon submission due in ~2h. Real browser with WebGL2 required (Chrome/Chromium, NOT software GL).

## What Oneiro is (for context)
You speak/type a dream → AI interprets it → Tripo text-to-3D generates the dream's objects → you walk inside the dream in first person. Each dream plays as a staged vignette (Kurosawa's *Dreams* / *LSD: Dream Emulator*): title card → the dream is "live" (a presence emerges from the fog and approaches) → climax when you stare at it or get too close (it closes in on you, you freeze, sound cuts) → black cut → "morning note" (your dream journal entry).

## URL
https://oneiro.170.9.240.8.sslip.io/dream/ant-city-demo
(Dream: "a giant ant walking through the city, between skyscrapers, people running below." Objects are real Tripo-generated GLBs: amber ant, glass skyscraper, running person.)

## Controls
- Drag anywhere on the canvas = look around (first-person).
- Hold the round ember button (bottom-center) = walk forward. On desktop WASD also works.
- Tap an object = "link" (warp). Don't over-use; one tap near the end is enough.
- The climax triggers if you keep looking at the ant for ~3s, or walk close to it.

## Recording plan (two takes)
### Take A — phone portrait (primary), 60–90s
Viewport 430×860 (or emulate iPhone 12 in Chrome DevTools, DPR 2–3). Record the browser tab/screen at 30fps.
1. Load the page. Let the black title card ("TIVE UM SONHO ASSIM" + title) play fully (~3s). Do not touch.
2. When the scene appears, pause 2s. Then slowly drag to look left→right across the ant, the skyscraper, the runner (~6s).
3. Hold the ember button and walk forward toward the ant for ~8–10s, letting it grow in frame. Release.
4. Keep the camera ON the ant and hold still — the climax will trigger (the ant closes in, screen holds, then cuts to black). Do not touch during the climax/cut.
5. Let the "anotação da manhã" (morning note) screen show for ~4s. End.
### Take B — desktop 16:9 (secondary), 45–60s
1600×900 window. Same beats, faster. Use WASD to walk.

## Output
- `oneiro-demo-phone.mp4` (portrait) and `oneiro-demo-desktop.mp4` (16:9), H.264, 30fps, with any in-browser audio if captured (there is an ambient drone + footsteps; audio is a bonus, not required).
- Also save 6 clean PNG stills: title card, scene wide, walking toward ant, climax (ant in face), black cut, morning note.
- Upload/attach the files and report: durations, resolution, whether the climax triggered on its own, and any console errors seen.

## Rules
- Do NOT edit code. Do NOT reload mid-take (the title card only plays on load).
- If the page shows only glowing orange domes instead of objects, wait up to 15s (models loading, 2–3MB each) before recording.
- If something breaks, report exactly what (URL, console error, screenshot) instead of working around it.
