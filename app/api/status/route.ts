// @/app/api/status/route.ts
// POST { tasks: [{ taskId, name }] } -> poll each Tripo task once and report
// its status/progress. When a task has reached "success" with a (expiring)
// model URL, rehost the GLB locally and return the LOCAL url instead, so the
// world keeps working after Tripo's link dies.
//
// Returns [{ name, status, progress, modelUrl? }] — one entry per input task,
// in input order. Server-only: pollTask reads TRIPO_API_KEY, rehostModel
// writes under public/. Partial failures must not sink the batch; a task that
// throws comes back as status "failed" with progress 0.

import { pollTask, isSuccessStatus } from "@/lib/tripo";
import { rehostModel } from "@/lib/storage";

export const runtime = "nodejs";
// Polls remote task state at request time; never cache.
export const dynamic = "force-dynamic";

interface TaskInput {
  taskId: string;
  name: string;
}

interface StatusResult {
  name: string;
  status: string;
  progress: number;
  modelUrl?: string;
}

function parseTasks(value: unknown): TaskInput[] | null {
  if (!Array.isArray(value)) return null;
  const out: TaskInput[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const { taskId, name } = raw as Record<string, unknown>;
    if (typeof taskId !== "string") return null;
    out.push({
      taskId: taskId.trim(),
      name: typeof name === "string" ? name : "",
    });
  }
  return out;
}

async function resolveTask(task: TaskInput): Promise<StatusResult> {
  // A task that never got a real id (e.g. creation failed upstream) is terminal.
  if (!task.taskId) {
    return { name: task.name, status: "failed", progress: 0 };
  }

  const { status, progress, modelUrl } = await pollTask(task.taskId);

  // Once generation succeeds, rehost the expiring GLB to a stable local url.
  if (isSuccessStatus(status) && modelUrl) {
    try {
      const localUrl = await rehostModel(modelUrl, task.taskId);
      return { name: task.name, status, progress, modelUrl: localUrl };
    } catch {
      // Rehost failed — still report success with the remote url as a fallback
      // so the scene can render from the (short-lived) original.
      return { name: task.name, status, progress, modelUrl };
    }
  }

  return { name: task.name, status, progress };
}

export async function POST(request: Request): Promise<Response> {
  let tasks: TaskInput[] | null;

  try {
    const body = (await request.json()) as unknown;
    const raw =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).tasks
        : undefined;
    tasks = parseTasks(raw);
  } catch {
    return Response.json(
      { error: "Invalid JSON body. Expected { tasks: [{ taskId, name }] }." },
      { status: 400 },
    );
  }

  if (!tasks) {
    return Response.json(
      {
        error:
          "tasks is required and must be an array of { taskId, name }.",
      },
      { status: 400 },
    );
  }

  // Poll all tasks in parallel; a single failure never fails the batch.
  const settled = await Promise.allSettled(tasks.map(resolveTask));

  const results: StatusResult[] = settled.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    return { name: tasks![i].name, status: "failed", progress: 0 };
  });

  return Response.json(results, { status: 200 });
}
