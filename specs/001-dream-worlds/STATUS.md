# STATUS — narrative vignette (a cena virou acontecimento)

Estado real do trabalho de transformar a cena de "mostruário de GLBs" em vinheta encenada.
Fonte conceitual: estudos de Kurosawa's Dreams, Waking Life e LSD: Dream Emulator
(journals no histórico de workflows; síntese registrada na conversa, não num arquivo).

## O que está implementado e VERIFICADO por screenshot (headless Chromium/swiftshader)

Cadeia de fases em `components/DreamScene.tsx`:

```
cartela → live → climax → cut → note
```

Evidências em `specs/001-dream-worlds/shots/` (frames capturados no headless):

| Beat | O que acontece | Frame |
|---|---|---|
| cartela | tela preta "TIVE UM SONHO ASSIM" + título, ~1.6-3s | `shots/1-cartela.png` |
| live | regra (`world.rule`) aparece 1x em itálico e some; presença = `elements[0]` sai da névoa ~9.5u além do mark e avança 28s; coro tem stepPhase sincronizado | `shots/2-rule-live.png`, `shots/3-live.png` |
| climax | disparado por olhar sustentado (cone >0.9 por 3.2s), proximidade (<footprint*0.85+1.6) ou fim do sonho (260s). Presença converge até `gap=footprint*0.9+1.2` da câmera e vira (`face→1`); coro congela; jogador paralisado; som corta | `shots/4-climax-stare.png` |
| cut | frame 100% preto ~0.6-1.1s | `shots/5-cut.png` |
| note | "anotação da manhã · noite nº N" + relato original + CTAs | `shots/6-note.png` |

Console: zero erros. `bunx tsc --noEmit`: limpo. `bun run build`: passa.

## Bug corrigido nesta sessão

O clímax não vendia: `_toCam.setLength(min(dist*0.18, gap))` aproximava só ~18% do gap
e `presencePos` ficava stale fora da fase live. Agora a presença converge de fato
até perto da câmera (`close = dist - gap`, lerp `1-pow(0.12,d)`) e `presencePos`/`presenceDist`
atualizam no clímax.

## Debug hook (`?debug=1` somente — nunca em produção)

`window.__oneiro`: `cam()`, `warping()`, `flash()`, `phase()`, `presence()`,
`face()`, `setFace(x)`, `hold()` (cancela timers de fase p/ segurar um beat), `breakRule()`.

## Harness de verificação

```bash
bun scripts/headless-check.mjs   # sequência completa → /tmp/oneiro-shots
```

Flags obrigatórias p/ WebGL por software: `--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader`.
Chromium: `/usr/bin/chromium`. Dev server: `bun run dev` (porta que aparecer, ex: 3022).

ATENÇÃO: swiftshader roda ~1.5fps — delta-clamps deixam animações mais lentas que o real.
Use `hold()` + `setFace(1)` pra segurar beats curtos (climax=1.4s no reduced-motion).
`prefers-reduced-motion` encolhe TODOS os timings ~40% (headless reporta reduce).

## O que FALTA (próxima sessão)

- [ ] **Som não verificável headless**: passos-sintetizador (`StepsHandle`) como anúncio
      antes da imagem + corte do drone no clímax. Testar em máquina real.
- [ ] **Gaze-break real**: câmera controlada por jogador olhando 3.2s — só simulado via `breakRule()`.
- [ ] **Cartela no dev**: tempo de compile/HMR come parte da janela de 1.6s. Em prod ok.
      Considerar começar a fase só após primeiro frame renderizado.
- [ ] **Touch=link**: colisão/tap deveria linkar pra outra vinheta (fade pelo humor → próximo stop).
      Stops já existem (`stops` em DreamScene) — falta conectar o gesto.
- [ ] **Coro em uníssono**: `stepPhase` sincroniza os canais mas o demo tem 1 corredor só.
      Valer a pena N instâncias do mesmo GLB miúdo em contra-procissão (ver beat-sheet da formiga).
- [ ] **"o estranho barato"**: nada de erro-de-contagem/texto-ilegível ainda — o uncanny mínimo.
- [ ] **Auto-fim 260s** não exercitado num run completo.
- [ ] **Diário→continuidade**: chart pós-sonho, humor de ontem moldando hoje — ainda galeria.
- [ ] Note-screen wording: "noite nº 1" é número de posição no diário — conferir se ordenação é a certa.

## Arquivos-chave

- `components/DreamScene.tsx` — máquina de fases, VignetteDriver, overlays, debug hook
- `components/DreamObject.tsx` — canal `live` (offset/face/freeze/stepPhase) consumido por frame
- `lib/world.ts` — `World.rule?: string` (retro-compatível)
- `public/worlds/ant-city-demo.json` — mundo demo re-autorado (formiga = elements[0])
- `scripts/headless-check.mjs` — harness de verificação
