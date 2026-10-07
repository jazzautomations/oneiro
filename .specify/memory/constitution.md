# Oneiro Constitution

Projeto de uma noite (hackathon Tripothon S1), padrão de **produto v1 polido**. Fonte de produto: `PRD.md`.

## Core Principles

### I. Voz-primeiro & mágico no primeiro uso
A entrada principal é a VOZ — a pessoa acabou de acordar e fala o sonho. Do silêncio ao mundo navegável em menos de 90s, sem cadastro, sem fricção. Toda tela tem que ser óbvia pra alguém grogue.

### II. A espera é parte da experiência (NON-NEGOTIABLE)
Nunca um spinner morto. A latência de geração (~30–60s) é sempre coberta por narrativa/animação ("o sonho está tomando forma"). Se há espera, há magia acontecendo na tela.

### III. Qualidade de produto, não de hacka
Tipografia, som, transições, estados vazios e mobile são caprichados. O `main` está **sempre deployável e demonstrável**. Um fluxo polido e completo vence um fluxo ambicioso e quebrado.

### IV. Imperfeição é estética, não bug
A geometria imperfeita do 3D generativo é tratada como linguagem visual onírica/psicodélica (brilho, névoa, flutuação, cor). Nunca se pede desculpa por ela — ela é curada a favor.

### V. Priorização P0 → P1 → P2
P0 (espinha do produto) tem que estar funcionando e deployado antes de qualquer P1. Nada de P2 enquanto P0/P1 não fecharem. Cada incremento mantém o app utilizável ponta a ponta.

### VI. Compartilhável por padrão
Todo sonho gera um link real que abre uma cópia navegável. Compartilhar não é um extra — é parte do núcleo.

### VII. Segurança & segredos
Chaves (Tripo, Groq) só server-side, nunca no browser. Transcrição de voz nunca roda Whisper local — usa Web Speech API no cliente ou Groq no server.

## Restrições técnicas
Next.js (App Router) + TypeScript + Tailwind; react-three-fiber + drei + postprocessing pro 3D; Tripo text-to-3D como motor de assets (uso orquestrado, múltiplas gerações); Groq pra LLM/transcrição; GLB re-hospedado em bucket próprio com CORS (URLs do Tripo expiram ~5min); deploy Vercel.

## Fluxo de trabalho (fleet)
6 workstreams isolados por arquivo/rota pra rodar em paralelo (ultracode + Codex/Devin/Carlos), integrados numa branch. Cada workstream entrega algo testável isoladamente. Fallback pré-gerado obrigatório pro demo nunca morrer ao vivo.

## Governance
Esta constituição guia decisões de escopo e qualidade na madrugada. Em conflito, prevalece: (1) deployável > completo > ambicioso; (2) P0 antes de tudo; (3) prazo é terça 06/10 09:00 BRT. Mudanças de escopo passam pelo PRD.

**Version**: 1.0.0 | **Ratified**: 2026-10-05 | **Last Amended**: 2026-10-05
