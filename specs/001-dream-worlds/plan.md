# Implementation Plan: Oneiro — Dream Worlds

**Branch**: `001-dream-worlds` | **Date**: 2026-10-05 | **Spec**: ./spec.md

**Input**: Feature specification from `specs/001-dream-worlds/spec.md`

## Summary
Produto web onde a pessoa fala um sonho → o sonho é interpretado em 3–5 elementos → cada elemento vira um objeto 3D (Tripo text-to-3D, orquestrado em paralelo) → composto numa cena psicodélica navegável (react-three-fiber) → persistido num diário e presenteável por link público. Latência de geração coberta por uma tela de "o sonho está tomando forma". Padrão de produto v1 polido; construído em uma noite por fleet multiagente.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 26, Next.js 15 (App Router)

**Primary Dependencies**: react, next, tailwindcss; three + @react-three/fiber + @react-three/drei + @react-three/postprocessing; zustand (estado); groq-sdk (LLM + Whisper fallback); @google/model-viewer (AR, P3). Tripo via fetch REST.

**Storage**: Vercel Blob (re-host de GLB + doc JSON do mundo pros links); localStorage pro índice do diário (com espelho no Blob pra compartilhar).

**Testing**: smoke manual + 1 e2e feliz (Playwright opcional). Testes não são foco (hackathon) — só o fluxo feliz.

**Target Platform**: Web responsivo; Chrome/Edge priorizados (Web Speech API). Deploy Vercel.

**Project Type**: Web app full-stack single-project (Next.js).

**Performance Goals**: mundo navegável em ≤90s no caminho típico; navegação ~60fps em celular mediano (degradação graciosa de efeitos).

**Constraints**: chaves só server-side; Whisper nunca local (Web Speech no cliente / Groq no server); URLs do Tripo expiram ~5min → re-host obrigatório no Blob com CORS; orçamento ~300 créditos Tripo → cap 3–5 objetos/sonho + cache + 1 mundo demo pré-gerado.

**Scale/Scope**: ~6 telas/rotas, ~5 API routes, 1 cena 3D. Uso pessoal/demo.

## Constitution Check
*GATE: passa.*
- **I. Voz-primeiro**: `VoiceCapture` é a entrada; texto é fallback. ✅
- **II. Espera é experiência**: `LoadingDream` cobre a geração com progresso/narrativa. ✅
- **III. Qualidade de produto**: design system (Tailwind + tokens), som, mobile; `main` sempre deployável. ✅
- **IV. Imperfeição é estética**: shaders/pós-processamento oníricos envolvem os modelos. ✅
- **V. P0 primeiro**: US1+US2 (P1) antes de US3/US4 (P2) e US5 (P3). ✅
- **VI. Compartilhável**: rota `/gift/[id]` + `/api/share`. ✅
- **VII. Segredos**: tudo em API routes server-side. ✅

Sem violações → sem Complexity Tracking.

## Project Structure

### Source Code (repository root)
```text
app/
├── layout.tsx, globals.css
├── page.tsx                     # entrada: capturar o sonho
├── dream/[id]/page.tsx          # mundo navegável (dono)
├── gift/[id]/page.tsx           # mundo somente-leitura (presente)
├── diary/page.tsx               # diário (P2)
└── api/
    ├── transcribe/route.ts      # fallback STT (Groq Whisper)
    ├── interpret/route.ts       # Groq LLM: sonho → elementos+título+paleta
    ├── dream/route.ts           # cria N tasks Tripo text-to-3D
    ├── status/route.ts          # poll Tripo + re-host GLB no Blob
    └── share/route.ts           # salva/serve o doc do mundo
components/
├── VoiceCapture.tsx             # Web Speech API + UI de gravação
├── DreamScene.tsx               # <Canvas> r3f, câmera, navegação, postfx
├── DreamObject.tsx              # carrega GLB, idle float, interação
├── DreamSky.tsx                 # shader de céu/atmosfera por paleta
├── LoadingDream.tsx             # "o sonho está tomando forma"
├── GiftBar.tsx                  # gerar/compartilhar link
└── DiaryGallery.tsx             # grade dos mundos (P2)
lib/
├── tripo.ts                     # client Tripo (server): createTask/poll
├── groq.ts                      # interpret() + transcribe()
├── storage.ts                   # re-host GLB + save/load world (Blob)
├── world.ts                     # tipos + serialize/deserialize World
└── store.ts                     # zustand: estado do sonho/cena + diário local
public/
└── demo/                        # mundo demo pré-gerado (fallback)
```

**Structure Decision**: single-project Next.js (App Router). Frontend e API no mesmo app; componentes 3D isolados por arquivo pra permitir build paralelo sem colisão.

## Fase 0 — research (resumo, já feito nas pesquisas da noite)
- Tripo: `POST /v2/openapi/task` type `text_to_model` (ou image); poll `/task/{id}`; output GLB/PBR; URLs expiram ~5min → re-host. ~20–30 créditos/obj, ~30–60s.
- AR: `<model-viewer>` dá Scene Viewer (Android) e Quick Look (iOS via USDZ) de graça.
- Voz: Web Speech API (cliente) com fallback Groq Whisper (server).

## Fase 1 — design/contratos (resumo)
- **Entities** (ver spec): Dream, DreamElement, World, GiftLink → tipos em `lib/world.ts`.
- **API contracts**: interpret(dreamText)→{title,mood,palette,elements[]}; dream(elements[])→{taskIds[]}; status(taskIds[])→{ready[],modelUrls[]}; share(world)→{id,url}.
