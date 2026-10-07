#!/usr/bin/env bun
// fleet — dispatch task cards to headless agent CLIs and collect their work.
// Devin stays the orchestrator: it writes the card, spawns the run here,
// then reviews the git diff + runs verification itself (tsc/build/headless).
//
// Usage:
//   bun scripts/fleet.mjs claude tasks/foo.md [--model opus] [--bg]
//   bun scripts/fleet.mjs codex  tasks/foo.md [--bg]
//   bun scripts/fleet.mjs gemini tasks/foo.md
//
// A task card is plain markdown: goal, files allowed, acceptance criteria.
// Output streams to runs/<ts>-<agent>.log (and stdout unless --bg).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [agent, taskArg, ...rest] = process.argv.slice(2);
if (!agent || !taskArg) {
  console.error("usage: fleet.mjs <claude|codex|gemini> <task-file|text> [--model M] [--bg]");
  process.exit(2);
}

const flag = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : null;
};
const bg = rest.includes("--bg");
const model = flag("--model");

const task = existsSync(taskArg) ? readFileSync(taskArg, "utf8") : taskArg;
const prompt = `${task}\n\n---\nRegras: muda só o que a task pede; roda a verificação indicada; reporta o que fez e o que NÃO fez em 5 linhas no final.`;

// Headless invocations per CLI. The permission bypass flags are what make
// them autonomous — without them the run stalls on the first tool approval.
const SPAWN = {
  claude: (p, m) => [
    "claude",
    ["-p", p, "--output-format", "text", "--dangerously-skip-permissions",
     ...(m ? ["--model", m] : []), "--max-turns", "60"],
  ],
  codex: (p) => ["codex", ["exec", "--full-auto", p]],
  gemini: (p) => ["gemini", ["-p", p, "--yolo"]],
};

const build = SPAWN[agent];
if (!build) {
  console.error(`agent desconhecido: ${agent} (claude|codex|gemini)`);
  process.exit(2);
}
const [bin, args] = build(prompt, model);

mkdirSync("runs", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const logPath = resolve("runs", `${stamp}-${agent}.log`);

const child = spawn(bin, args, { cwd: process.cwd(), env: process.env });
const chunks = [];
child.stdout.on("data", (d) => { chunks.push(d); if (!bg) process.stdout.write(d); });
child.stderr.on("data", (d) => { chunks.push(d); if (!bg) process.stderr.write(d); });
child.on("close", (code) => {
  writeFileSync(logPath, Buffer.concat(chunks));
  console.log(`\n[fleet] ${agent} exit=${code} log=${logPath}`);
  process.exit(code ?? 1);
});
if (bg) console.log(`[fleet] spawned pid=${child.pid} log=${logPath}`);
