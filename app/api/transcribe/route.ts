// @/app/api/transcribe/route.ts
// POST multipart/form-data with an "audio" file -> { text } transcript via
// Groq Whisper. Server-only; never exposes GROQ_API_KEY.

import { transcribeAudio } from "@/lib/groq";

export const runtime = "nodejs";
// Transcription uploads audio and calls Whisper at request time; never cache.
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "Invalid multipart form data. Expected an 'audio' file field." },
      { status: 400 },
    );
  }

  const audio =
    formData.get("audio") ?? formData.get("file") ?? formData.get("dream");

  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json(
      { error: "An 'audio' file field is required." },
      { status: 400 },
    );
  }

  try {
    const text = await transcribeAudio(audio);
    return Response.json({ text }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to transcribe audio.";
    return Response.json({ error: message }, { status: 500 });
  }
}
