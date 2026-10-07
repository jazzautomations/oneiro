# Tasks: Oneiro — Dream Worlds

**Input**: `specs/001-dream-worlds/` (plan.md, spec.md)

**Organization**: por fase e user story. Tags extras `[WS-x]` mapeiam pros workstreams paralelos da fleet (ultracode/Codex/Devin). `[P]` = paralelizável (arquivos distintos, sem dependência).

## Workstreams
- **WS-A** pipeline voz→sonho · **WS-B** pipeline Tripo · **WS-C** cena 3D · **WS-D** diário+share · **WS-E** design/onboarding/som · **WS-F** infra/deploy/demo.

---

## Fase 1: Setup (infra compartilhada)
- [ ] T001 [WS-F] Scaffold Next.js 15 (App Router, TS, Tailwind) via `create-next-app`; rodar dev.
- [ ] T002 [WS-F] Instalar deps: three, @react-three/fiber, @react-three/drei, @react-three/postprocessing, zustand, groq-sdk, @google/model-viewer.
- [ ] T003 [P] [WS-F] `.env.local` lendo `TRIPO_API_KEY` (de ~/.config/tripo/.env) e `GROQ_API_KEY`; `.env.example`.
- [ ] T004 [P] [WS-E] Design tokens + `globals.css` (paleta onírica, tipografia, dark base) + layout base.

## Fase 2: Foundational (bloqueia as stories)
- [ ] T005 [WS-C/D] `lib/world.ts`: tipos Dream, DreamElement, World, GiftLink + serialize/deserialize. **(base de tudo)**
- [ ] T006 [P] [WS-D] `lib/store.ts`: zustand com estado do sonho/cena + persistência localStorage.
- [ ] T007 [P] [WS-B] `lib/tripo.ts`: client server (createTask text_to_model, poll status, parse GLB url).
- [ ] T008 [P] [WS-B/F] `lib/storage.ts`: re-host GLB (download Tripo→Vercel Blob, CORS) + save/load world JSON.
- [ ] T009 [P] [WS-A] `lib/groq.ts`: `interpret()` (sonho→{title,mood,palette,elements[]}) + `transcribe()`.
- [ ] T010 [WS-F] `public/demo/`: 1 mundo demo pré-gerado (GLBs + world.json) como fallback.

**Checkpoint**: base pronta → stories podem rodar em paralelo.

---

## Fase 3: US1 — Falar e caminhar no sonho (P1) 🎯 MVP
**Goal**: do microfone ao mundo navegável.
- [ ] T011 [P] [WS-A] `components/VoiceCapture.tsx`: Web Speech API, UI de gravação, transcrição ao vivo, fallback textarea.
- [ ] T012 [P] [WS-A] `app/api/interpret/route.ts` + `app/api/transcribe/route.ts` (Groq).
- [ ] T013 [WS-B] `app/api/dream/route.ts` (cria N tasks) + `app/api/status/route.ts` (poll + re-host via storage.ts).
- [ ] T014 [P] [WS-C] `components/DreamSky.tsx`: shader de céu/atmosfera parametrizado por paleta/humor.
- [ ] T015 [P] [WS-C] `components/DreamObject.tsx`: carrega GLB, idle float/breathing, look-at câmera, som no clique.
- [ ] T016 [WS-C] `components/DreamScene.tsx`: `<Canvas>`, layout dos objetos, navegação (orbit + walk), postfx (bloom/fog/vignette), áudio ambiente. (depende T005,T014,T015)
- [ ] T017 [P] [WS-E] `components/LoadingDream.tsx`: animação "o sonho está tomando forma" ligada ao progresso do status.
- [ ] T018 [WS-C/A] `app/page.tsx` + `app/dream/[id]/page.tsx`: orquestra captura→interpret→dream→status→cena. (costura US1)
- [ ] T019 [WS-C] Degradação graciosa (mobile: menos partículas/efeitos) + loader de GLB resiliente a falhas parciais.

**Checkpoint**: US1 funcional e deployável (MVP).

---

## Fase 4: US2 — Presentear/compartilhar (P1)
**Goal**: link público navegável.
- [ ] T020 [WS-D] `app/api/share/route.ts`: salva world JSON no Blob, retorna id/url.
- [ ] T021 [P] [WS-D] `components/GiftBar.tsx`: botão "presentear" → cria link → copia/compartilha.
- [ ] T022 [WS-D] `app/gift/[id]/page.tsx`: carrega world do Blob, cena somente-leitura, mostra título. (reusa DreamScene)

**Checkpoint**: criar mundo → gerar link → abrir em outra aba → navegar.

---

## Fase 5: US3 — Diário de sonhos (P2)
- [ ] T023 [P] [WS-D] `app/diary/page.tsx` + `components/DiaryGallery.tsx`: grade dos mundos (título/data/prévia), reabrir.
- [ ] T024 [WS-D] Espelhar índice do diário no Blob pra persistir entre dispositivos.

## Fase 6: US4 — Narração + reação (P2)
- [ ] T025 [P] [WS-A/D] Gravar narração em voz, anexar ao world, tocar no `/gift/[id]`.
- [ ] T026 [P] [WS-D] Reação simples do visitante (emoji) gravada no world.

## Fase 7: US5 — AR + export (P3)
- [ ] T027 [P] [WS-C] Botão AR via `<model-viewer>` (converter 1 GLB→USDZ via Tripo convert).
- [ ] T028 [P] [WS-E] Export de imagem/clip do dreamscape (canvas capture).

---

## Fase 8: Polish & integração
- [ ] T029 [WS-E] Onboarding + copy + estados vazios + som final.
- [ ] T030 [WS-F] Deploy Vercel (envs, Blob, CORS), teste no celular.
- [ ] T031 [WS-F] Gravar screen recording (walkthrough) + montar board de imagens + submeter (portal + Discord).

---

## Dependências & ordem
- Fase 1 → Fase 2 (bloqueante) → US1 (MVP) → US2 → US3/US4 → US5 → Polish.
- Paralelizável após Fase 2: WS-A, WS-B, WS-C, WS-D, WS-E avançam juntos; WS-F costura/deploya.
- Dentro da US1: T016 depende de T005/T014/T015; T018 depende de T011–T017.

## Estratégia
MVP = Fase 1+2+US1 deployado. Depois US2 (link), US3/4, US5. Sempre deployável a cada checkpoint. Prazo: 06/10 09:00 BRT.
