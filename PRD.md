# PRD — Oneiro (nome provisório) 🌙
### Um diário de sonhos vivo: fale o sonho que teve e caminhe dentro dele.

> Construído pro **Tripothon S1** (Tripo3D), mas com **padrão de PRODUTO v1 real**, não protótipo de demo. Entrega até **terça 06/10 09:00 BRT**. Capacidade de execução: fleet multiagente (ultracode em paralelo) + Jazz + Carlos + Codex + Devin.
>
> Nota de negócio: como *startup* a ideia de keepsake deu NO-GO (validado). Isso **não rebaixa o padrão de craft** — Oneiro é uma peça de produto completa e polida (portfólio + entrada forte no hacka, onde Completude vale 25%).

---

## 1. Visão
A maioria dos sonhos evapora em minutos. Oneiro captura o sonho **no momento em que você acorda** — você só **fala** — e transforma ele num **mundo 3D psicodélico que você pode caminhar dentro, colecionar num diário e presentear**. Cada sonho vira um lugar. Com o tempo, você tem uma **constelação de mundos** que foram só seus.

Encaixe no tema do hacka ("um mundo que não existe, como presente") é literal. E a imperfeição do Tripo **é a estética** — sonho é surreal, então geometria estranha = feature.

## 2. Usuários
- **Primário:** qualquer pessoa fascinada pelos próprios sonhos (praticantes de sonho lúcido, criativos, curiosos).
- **Hackathon:** juízes Tripo + builders de 3D; pessoal do network de sábado em SP.

## 3. Princípios de produto (a régua de qualidade)
1. **Mágico desde o primeiro uso** — do silêncio ao mundo em < 90s, sem fricção.
2. **Voz primeiro** — acabou de acordar, não quer digitar.
3. **A espera é parte da mágica**, nunca um spinner morto.
4. **Polido, não "de hacka"** — tipografia, som, transições, mobile caprichados.
5. **Compartilhável por padrão** — todo sonho gera um link que funciona de verdade.

## 4. Jornadas (produto completo, não um fluxo só)

### 4.1 Onboarding (primeira vez)
Abertura imersiva (céu onírico, áudio) → "Conte um sonho que você teve" → permissão de microfone explicada com carinho.

### 4.2 Capturar & construir um sonho (núcleo)
Fala → transcrição ao vivo → interpretação (objetos oníricos + paleta/humor) → geração Tripo (com animação "o sonho está tomando forma") → objetos **nascem** no mundo → **dreamscape navegável** (shader de céu, bloom, névoa, partículas, drone ambiente, objetos flutuando/respirando).

### 4.3 Diário de sonhos (persistência real)
Galeria de todos os mundos já criados; reabrir e recaminhar; título + data + humor; busca por vibe. Persistido (não só localStorage — storage real).

### 4.4 Presentear / compartilhar
Link público que abre uma cópia navegável do mundo (read-only), com a **narração em voz** do dono apresentando o sonho. Opcional: visitante deixa uma reação.

### 4.5 Levar pro mundo real (bônus)
Botão **AR** ("ver no seu quarto") via model-viewer; exportar imagem/clip do dreamscape pra redes.

## 5. Escopo priorizado (produto, não MVP)

**P0 — espinha do produto (tem que estar perfeita):**
- Captura de voz (Web Speech API; **Groq Whisper** no server como fallback — nunca Whisper local).
- Interpretação do sonho via LLM (Groq): objetos + prompts curados + paleta/humor + título.
- Pipeline Tripo **text-to-3D** orquestrado (N objetos em paralelo, poll, re-host em bucket — URL do Tripo expira ~5min).
- Dreamscape navegável polido (r3f + drei + postprocessing): céu shader, bloom, névoa, partículas, áudio, idle motion.
- Animação de espera que cobre a latência.
- Persistência + diário (storage real).
- Link de presente que funciona.
- Design/identidade visual coeso + som.

**P1 — produto redondo:**
- Narração em voz anexada ao presente.
- AR de um objeto; export de imagem/clip.
- Reação do visitante no link.
- Edição leve (renomear, reposicionar objeto, trocar paleta).

**P2 — encanta (se a fleet voar):**
- Múltiplos "biomas" de sonho (pesadelo, voo, água) com presets de shader/áudio.
- Trilha generativa por humor.
- Onboarding com sonho de exemplo pré-gerado.

**NÃO agora:** login pesado/contas sociais, pagamento, impressão/keepsake, multiplayer em tempo real.

## 6. Arquitetura
- **Next.js (App Router) + TS + Tailwind**, deploy Vercel.
- **react-three-fiber + drei + @react-three/postprocessing** pro dreamscape.
- Server routes: `/api/interpret` (Groq LLM), `/api/transcribe` (Groq Whisper fallback), `/api/dream` (cria tasks Tripo em lote), `/api/status` (poll + re-host), `/api/share` (salva/serve mundo).
- **Storage:** bucket (Vercel Blob ou R2) pros GLB/USDZ re-hospedados + doc JSON do mundo (cena + refs) pro diário e pros links.
- Chaves: `TRIPO_API_KEY` (em `~/.config/tripo/.env`), `GROQ_API_KEY` (a confirmar). Só server-side.
- CORS correto no bucket (`model/gltf-binary`, `model/vnd.usdz+zip`).

## 7. Plano de execução paralela (fleet)
Workstreams independentes pra rodar em paralelo (ultracode workflow + Codex/Devin/Carlos):
- **WS-A — Pipeline voz→sonho:** Web Speech + `/api/transcribe` + `/api/interpret` (Groq).
- **WS-B — Pipeline Tripo:** `/api/dream` + `/api/status` + re-host no bucket + orquestração de N objetos.
- **WS-C — Dreamscape 3D:** cena r3f, shaders, postfx, áudio, idle motion, câmera/navegação.
- **WS-D — Diário + Share:** persistência, galeria, `/api/share`, página pública do presente.
- **WS-E — Design/identidade + onboarding + copy** e **som**.
- **WS-F — Infra/deploy:** Vercel, bucket, envs, CI, fallback pré-gerado.
Integração contínua numa branch; eu costuro.

## 8. Definition of Done
1. Produto polido rodando em URL pública (desktop + mobile).
2. Fluxo completo: fala → mundo → diário → link de presente → (AR/narração P1).
3. Entregáveis do edital: screen recording (walkthrough) + board de imagens.
4. Track **App** + Tool Track Tripo (uso orquestrado de múltiplas gerações).

## 9. Riscos & mitigação
- **Latência Tripo 30–60s/obj** → gerar em paralelo + animação de espera + pré-gerar exemplo.
- **Qualidade text-to-3D surreal** → curar prompts no `/api/interpret`; aesthetic psicodélico perdoa.
- **Créditos ~300** (~10 gerações) → cap 3–5 objetos/sonho; cachear; fallback pré-gerado 1x. *(se for gerar muito no dev, pedir upgrade de créditos cedo.)*
- **Escopo P0 estourar** → P0 fecha primeiro e sempre deployável; P1/P2 só depois.
- **Coordenação da fleet** → tarefas isoladas por arquivo/rota pra não colidir.

## 10. Orçamento de créditos
~300 Tripo, ~20–30/obj. Dev + demo: cap por sonho + cache agressivo + 1 fallback pré-gerado. Pedir mais créditos se o dev consumir rápido.
