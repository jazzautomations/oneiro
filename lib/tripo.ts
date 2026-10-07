// @/lib/tripo.ts
// SERVER-ONLY client for the Tripo v2 OpenAPI (text-to-3D generation).
// Do NOT import this from a client component — it reads TRIPO_API_KEY.
//
// Docs: https://platform.tripo3d.ai/docs
//
// Usage:
//   const taskId = await createTextTo3D("a melting golden clock");
//   let r; do { r = await pollTask(taskId); } while (r.status === "running");
//   // r.modelUrl is the (expiring) GLB url

import "server-only";

const DEFAULT_BASE = "https://api.tripo3d.ai/v2/openapi";

function base(): string {
  return (process.env.TRIPO_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
}

function authHeaders(): Record<string, string> {
  const key = process.env.TRIPO_API_KEY;
  if (!key) {
    throw new Error(
      "TRIPO_API_KEY is not set. Add it to .env.local to enable 3D generation.",
    );
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/** Shape of every Tripo OpenAPI envelope. */
interface TripoEnvelope<T> {
  code: number;
  message?: string;
  data: T;
}

async function parseEnvelope<T>(res: Response, context: string): Promise<T> {
  let json: TripoEnvelope<T> | undefined;
  let text = "";
  try {
    text = await res.text();
    json = text ? (JSON.parse(text) as TripoEnvelope<T>) : undefined;
  } catch {
    // fall through to error handling below
  }

  if (!res.ok) {
    const detail = json?.message || text || res.statusText;
    throw new Error(
      `Tripo ${context} failed (HTTP ${res.status}): ${detail || "unknown error"}`,
    );
  }
  if (!json) {
    throw new Error(`Tripo ${context} returned an empty/invalid response.`);
  }
  if (json.code !== 0) {
    throw new Error(
      `Tripo ${context} error (code ${json.code}): ${json.message || "unknown error"}`,
    );
  }
  return json.data;
}

/* -------------------------------------------------------------------------- */
/*  createTextTo3D                                                            */
/* -------------------------------------------------------------------------- */

export interface CreateTextTo3DOptions {
  /** Model version to generate with. Defaults to v2.5-20250123. */
  modelVersion?: string;
  /** Whether to generate textures. Default true. */
  texture?: boolean;
  /** Whether to generate PBR materials. Default true. */
  pbr?: boolean;
  /** Max triangle count — keep web-light. Default 12000. */
  faceLimit?: number;
  /** Texture quality: "standard" (light) | "detailed" (heavy). Default "standard". */
  textureQuality?: string;
  /** Optional negative prompt. */
  negativePrompt?: string;
  /** Optional AbortSignal for cancellation / timeouts. */
  signal?: AbortSignal;
}

/**
 * Create a text-to-3D generation task.
 * @returns the Tripo task id to poll with {@link pollTask}.
 */
export async function createTextTo3D(
  prompt: string,
  opts: CreateTextTo3DOptions = {},
): Promise<string> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error("createTextTo3D: prompt must be a non-empty string.");
  }

  const body: Record<string, unknown> = {
    type: "text_to_model",
    prompt: trimmed,
    model_version: opts.modelVersion ?? "v2.5-20250123",
    texture: opts.texture ?? true,
    pbr: opts.pbr ?? true,
    // Web-light: fewer faces + standard (not 4K) textures, so a whole dream
    // world (3-5 models) loads fast and never blows GPU memory.
    face_limit: opts.faceLimit ?? 12000,
    texture_quality: opts.textureQuality ?? "standard",
  };
  if (opts.negativePrompt) {
    body.negative_prompt = opts.negativePrompt;
  }

  const res = await fetch(`${base()}/task`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal: opts.signal,
    cache: "no-store",
  });

  const data = await parseEnvelope<{ task_id: string }>(res, "createTextTo3D");
  if (!data?.task_id) {
    throw new Error("Tripo createTextTo3D: response did not include a task_id.");
  }
  return data.task_id;
}

/* -------------------------------------------------------------------------- */
/*  pollTask                                                                  */
/* -------------------------------------------------------------------------- */

export interface TripoTaskResult {
  /** e.g. "queued" | "running" | "success" | "failed" | "banned" | "expired" */
  status: string;
  /** 0-100 */
  progress: number;
  /** Present once status === "success"; expiring GLB url. */
  modelUrl?: string;
}

interface TripoTaskData {
  status?: string;
  progress?: number;
  output?: {
    pbr_model?: string;
    model?: string;
    base_model?: string;
    rendered_image?: string;
  };
}

/**
 * Poll a generation task. Call repeatedly until status is terminal
 * ("success" | "failed" | "banned" | "expired" | "cancelled").
 */
export async function pollTask(
  taskId: string,
  signal?: AbortSignal,
): Promise<TripoTaskResult> {
  if (!taskId) {
    throw new Error("pollTask: taskId must be provided.");
  }

  const res = await fetch(`${base()}/task/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: authHeaders(),
    signal,
    cache: "no-store",
  });

  const data = await parseEnvelope<TripoTaskData>(res, "pollTask");

  const status = data.status ?? "unknown";
  const progress =
    typeof data.progress === "number" ? data.progress : status === "success" ? 100 : 0;
  const modelUrl =
    data.output?.pbr_model || data.output?.model || data.output?.base_model;

  return { status, progress, modelUrl: modelUrl || undefined };
}

/* -------------------------------------------------------------------------- */
/*  Convenience: terminal-status helpers                                      */
/* -------------------------------------------------------------------------- */

const TERMINAL = new Set(["success", "failed", "banned", "expired", "cancelled"]);

/** True once a task will not progress further. */
export function isTerminalStatus(status: string): boolean {
  return TERMINAL.has(status);
}

/** True for the single successful terminal state. */
export function isSuccessStatus(status: string): boolean {
  return status === "success";
}
