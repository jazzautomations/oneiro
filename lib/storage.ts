// @/lib/storage.ts
// SERVER-ONLY asset persistence. Works in dev / Node by writing to the local
// public/ directory. Designed to be swappable for a cloud blob store in prod
// (see the Vercel Blob plug-in points marked below).

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  deserializeWorld,
  serializeWorld,
  type World,
} from "@/lib/world";

// Resolve against the runtime working directory. Next runs the server from the
// project root, so this works on the dev box AND any other host (the public
// demo included) — unlike a hardcoded absolute path, which only exists here.
const PROJECT_ROOT = process.env.ONEIRO_ROOT || process.cwd();
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const MODELS_DIR = path.join(PUBLIC_DIR, "models");
const WORLDS_DIR = path.join(PUBLIC_DIR, "worlds");

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/* -------------------------------------------------------------------------- */
/*  rehostModel                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Download a GLB from an expiring Tripo URL and persist it locally so the
 * world keeps working after the remote link dies.
 *
 * @param remoteUrl expiring Tripo model URL
 * @param id        element id, used for the on-disk filename
 * @returns a public, app-relative path like "/models/<id>.glb"
 *
 * PROD SWAP: replace the fs.writeFile below with
 *   import { put } from "@vercel/blob";
 *   const { url } = await put(`models/${id}.glb`, buffer, { access: "public" });
 *   return url;
 */
export async function rehostModel(
  remoteUrl: string,
  id: string,
): Promise<string> {
  if (!remoteUrl) {
    throw new Error("rehostModel: remoteUrl must be provided.");
  }
  const safeId = sanitizeId(id);

  const res = await fetch(remoteUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `rehostModel: failed to download model (HTTP ${res.status}) from ${remoteUrl}`,
    );
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new Error("rehostModel: downloaded model was empty.");
  }

  await ensureDir(MODELS_DIR);
  const filePath = path.join(MODELS_DIR, `${safeId}.glb`);
  await fs.writeFile(filePath, buffer);

  return `/models/${safeId}.glb`;
}

/* -------------------------------------------------------------------------- */
/*  saveWorld / loadWorld                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Persist a world as JSON at public/worlds/<id>.json.
 *
 * PROD SWAP: replace with
 *   await put(`worlds/${world.id}.json`, serializeWorld(world),
 *     { access: "public", contentType: "application/json" });
 */
export async function saveWorld(world: World): Promise<void> {
  if (!world?.id) {
    throw new Error("saveWorld: world.id must be set.");
  }
  const safeId = sanitizeId(world.id);
  await ensureDir(WORLDS_DIR);
  const filePath = path.join(WORLDS_DIR, `${safeId}.json`);
  await fs.writeFile(filePath, serializeWorld(world), "utf8");
}

/**
 * Load a world by id from public/worlds/<id>.json, or null if it does not
 * exist. Malformed files are normalized by deserializeWorld.
 *
 * PROD SWAP: fetch the blob URL / query the store instead of reading fs.
 */
export async function loadWorld(id: string): Promise<World | null> {
  if (!id) return null;
  const safeId = sanitizeId(id);
  const filePath = path.join(WORLDS_DIR, `${safeId}.json`);
  try {
    const data = await fs.readFile(filePath, "utf8");
    return deserializeWorld(data);
  } catch (err: unknown) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*  helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Strip anything that could escape the target directory or break a filename. */
function sanitizeId(id: string): string {
  const clean = String(id).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!clean) {
    throw new Error("storage: id resolved to an empty/invalid filename.");
  }
  return clean;
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
