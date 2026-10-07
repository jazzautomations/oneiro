// @/app/api/share/route.ts
// Publish & resolve shared dream worlds.
//
//   POST { world }    -> persist the world and return { id, url: "/gift/<id>" }
//   GET  ?id=<id>     -> the stored World as JSON, or 404 if unknown
//
// Server-only: saveWorld / loadWorld read & write under the project's public/
// dir. The incoming world is run through serialize/deserialize so a malformed
// client payload is normalized (and rejected) before it ever hits disk.

import { saveWorld, loadWorld } from "@/lib/storage";
import {
  deserializeWorld,
  serializeWorld,
  type World,
} from "@/lib/world";

export const runtime = "nodejs";
// Reads/writes per-request state on disk; never cache.
export const dynamic = "force-dynamic";

/**
 * Normalize an untrusted `world` payload into a valid World, or null if it
 * cannot be coerced. Round-tripping through serialize -> deserialize reuses the
 * single source of truth for shape validation in @/lib/world.
 */
function normalizeWorld(value: unknown): World | null {
  if (!value || typeof value !== "object") return null;
  try {
    return deserializeWorld(serializeWorld(value as World));
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  let world: World | null;

  try {
    const body = (await request.json()) as unknown;
    const raw =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).world
        : undefined;
    world = normalizeWorld(raw);
  } catch {
    return Response.json(
      { error: "Invalid JSON body. Expected { world }." },
      { status: 400 },
    );
  }

  if (!world) {
    return Response.json(
      { error: "world is required and must be a valid World object." },
      { status: 400 },
    );
  }

  try {
    await saveWorld(world);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save world.";
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json(
    { id: world.id, url: `/gift/${world.id}` },
    { status: 200 },
  );
}

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id");

  if (!id || !id.trim()) {
    return Response.json(
      { error: "id query parameter is required." },
      { status: 400 },
    );
  }

  let world: World | null;
  try {
    world = await loadWorld(id);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load world.";
    return Response.json({ error: message }, { status: 500 });
  }

  if (!world) {
    return Response.json(
      { error: `No world found for id "${id}".` },
      { status: 404 },
    );
  }

  return Response.json(world, { status: 200 });
}
