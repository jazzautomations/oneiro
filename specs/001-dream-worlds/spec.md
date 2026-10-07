# Feature Specification: Oneiro — Dream Worlds

**Feature Branch**: `001-dream-worlds`

**Created**: 2026-10-05

**Status**: Draft

**Input**: Falar o sonho que teve e caminhar dentro dele: diário de sonhos que vira um mundo 3D psicodélico navegável, colecionável e presenteável.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Falar um sonho e caminhar dentro dele (Priority: P1)

A pessoa acabou de acordar, abre o Oneiro, toca em "conte seu sonho" e **fala** o que sonhou. Em segundos ela vê o sonho ser interpretado e, enquanto o mundo "toma forma", objetos oníricos nascem numa cena 3D que ela pode explorar (orbitar/caminhar).

**Why this priority**: É o coração do produto e do demo — sem isso não há nada. Entrega sozinha a proposta de valor inteira ("seu sonho virou um lugar").

**Independent Test**: Falar (ou, no fallback, digitar) um sonho e, ao final, conseguir navegar por um mundo 3D coerente com o que foi dito, sem nenhuma outra feature presente.

**Acceptance Scenarios**:

1. **Given** a pessoa concedeu o microfone, **When** ela fala um sonho de ~10–30s e confirma, **Then** o sistema mostra a transcrição e, em até ~90s, apresenta um mundo 3D navegável com 3–5 elementos derivados do sonho.
2. **Given** a captura de voz falhou ou foi negada, **When** a pessoa usa o campo de texto de emergência, **Then** o mesmo mundo é gerado a partir do texto.
3. **Given** o mundo está sendo gerado, **When** a pessoa espera, **Then** ela vê uma animação/narrativa de "o sonho está tomando forma" com progresso — nunca uma tela parada.

---

### User Story 2 - Presentear/compartilhar o mundo (Priority: P1)

Ao terminar, a pessoa gera um **link** e envia pra alguém. Quem recebe abre no navegador e **caminha** pelo mesmo mundo (somente leitura), sem instalar nada.

**Why this priority**: O tema do evento é "um mundo como presente"; o compartilhamento é parte do núcleo e é o motor viral.

**Independent Test**: Criar um mundo, gerar o link, abri-lo em outra sessão/aba anônima e conseguir navegar pela cópia.

**Acceptance Scenarios**:

1. **Given** um mundo criado, **When** a pessoa toca em "presentear", **Then** recebe um link público que reabre o mundo navegável.
2. **Given** um link de presente, **When** um visitante o abre, **Then** vê o título do sonho e caminha pelo mundo sem precisar de conta.

---

### User Story 3 - Diário de sonhos (Priority: P2)

A pessoa acumula seus mundos ao longo do tempo numa galeria — reabre, revive e vê seus sonhos virarem uma coleção.

**Why this priority**: Transforma uma experiência única em um produto com retenção (hábito), diferencial sobre apps de diário de sonhos existentes.

**Independent Test**: Criar dois mundos e vê-los listados numa galeria persistente que permite reabrir cada um.

**Acceptance Scenarios**:

1. **Given** mundos já criados, **When** a pessoa abre o diário, **Then** vê cada sonho com título, data e uma prévia, e pode reabri-lo.

---

### User Story 4 - Narração e reação no presente (Priority: P2)

O dono pode anexar a **narração em voz** apresentando o sonho; o visitante pode deixar uma reação.

**Why this priority**: Amplifica a carga emocional (o que mais viraliza) com baixo custo de build.

**Acceptance Scenarios**:

1. **Given** um mundo, **When** o dono grava uma narração, **Then** o visitante do link a ouve ao explorar.

---

### User Story 5 - Levar pro mundo real (Priority: P3)

Ver um objeto do sonho em **AR** no próprio espaço e/ou exportar uma imagem/clip do dreamscape pra redes.

**Why this priority**: Payoff compartilhável extra; não essencial pro fluxo.

**Acceptance Scenarios**:

1. **Given** um objeto gerado, **When** a pessoa toca em "ver no meu espaço" num celular compatível, **Then** o objeto aparece em AR.

---

### Edge Cases

- Sonho muito curto/vago ("sonhei com minha vó") → sistema completa com elementos atmosféricos pra sempre render um mundo coerente.
- Sonho muito longo → limita a 3–5 elementos principais pra caber no orçamento de geração e no tempo.
- Conteúdo impróprio → filtra/suaviza antes de gerar.
- Geração de um elemento falha/demora demais → mundo é montado com os que deram certo; nunca trava a experiência.
- Sem rede no meio da geração → estado claro e possibilidade de retomar.
- Dispositivo fraco → cena degrada (menos partículas/efeitos) mantendo navegabilidade.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST capturar a descrição de um sonho por voz, com transcrição visível, e oferecer entrada por texto como alternativa.
- **FR-002**: O sistema MUST interpretar a descrição extraindo 3–5 elementos oníricos, um título e uma paleta/humor.
- **FR-003**: O sistema MUST gerar um objeto 3D para cada elemento e compô-los numa única cena navegável.
- **FR-004**: O sistema MUST permitir explorar a cena (orbitar e/ou caminhar) em desktop e mobile.
- **FR-005**: Durante a geração, o sistema MUST exibir progresso/narrativa contínua (sem estado parado) e MUST concluir o fluxo típico em até ~90s.
- **FR-006**: O sistema MUST, se um ou mais elementos falharem, montar a cena com os disponíveis sem interromper a experiência.
- **FR-007**: O sistema MUST gerar um link público que reabre o mundo em modo somente-leitura, sem exigir conta.
- **FR-008**: O sistema MUST persistir os mundos criados e listá-los num diário reabrível. *(P2)*
- **FR-009**: O sistema SHOULD permitir anexar narração em voz ao mundo presenteado. *(P2)*
- **FR-010**: O sistema SHOULD oferecer visualização em AR de um objeto e export de imagem/clip. *(P3)*
- **FR-011**: O sistema MUST ter um mundo pré-gerado de demonstração que carregue instantaneamente como rede de segurança.
- **FR-012**: O sistema MUST tratar a imperfeição dos modelos como estética (efeitos oníricos), garantindo coerência visual.

### Key Entities

- **Dream (Sonho)**: a captura — transcrição, título, humor/paleta, data, narração opcional.
- **Dream Element (Elemento onírico)**: um item extraído do sonho que vira um objeto 3D (nome, descrição/prompt, modelo gerado, posição/escala na cena).
- **World (Mundo)**: a cena composta — conjunto de elementos, atmosfera (céu/cor/áudio), estado de câmera.
- **Gift Link (Presente)**: referência pública compartilhável que resolve para um World somente-leitura.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A partir de um sonho falado, a pessoa chega a um mundo navegável em **até 90 segundos** no caminho típico.
- **SC-002**: Uma pessoa nova completa o fluxo "falar → mundo → presentear" **na primeira tentativa, sem instruções**.
- **SC-003**: O link de presente abre e fica navegável em outro dispositivo em **menos de 5 segundos** (mundo já gerado).
- **SC-004**: Cada mundo apresenta **3–5 elementos** reconhecíveis em relação ao sonho descrito.
- **SC-005**: O produto roda de forma fluida (navegação sem travar) em um celular mediano.
- **SC-006**: Em caso de falha de geração/rede, a pessoa **nunca** vê uma tela morta — sempre há um mundo (inclusive o de demonstração) ou um estado acionável.
- **SC-007 (hackathon)**: Entregáveis completos até **06/10 09:00 BRT**: produto em URL pública + screen recording (walkthrough) + board de imagens.

## Assumptions

- Dispositivo com microfone e navegador moderno (Chrome/Edge priorizados pra captura de voz).
- Conectividade estável durante a geração.
- Orçamento de geração limitado → cap de 3–5 elementos por sonho e cache agressivo; 1 mundo de demonstração pré-gerado.
- Sem contas/login no v1; identidade leve por dispositivo pro diário.
- Público inicial: curiosos/entusiastas de sonhos (incl. sonho lúcido) e avaliadores do hackathon.
- "Sonho lúcido" é vibe/estética, não mecânica, no v1.
