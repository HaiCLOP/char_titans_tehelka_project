import { generateText, Output } from "ai";
import { z } from "zod";
import { fail, ok, requireUser } from "@/lib/api";
import { runAI } from "@/lib/ai/router";

const Schema = z.object({ transcript: z.string().max(5000), useful_info: z.string().max(2000), language: z.enum(["Assamese", "English", "Hindi", "Other"]) });
const MAX_BYTES = 40 * 1024 * 1024;
const MIME = /^(video\/(mp4|webm|quicktime)|audio\/(webm|ogg|mp4|mpeg|wav|m4a))$/;

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const lang = String(form?.get("language") ?? "English");
  const mediaType = file instanceof File ? file.type.split(";")[0] : "";
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES || !MIME.test(mediaType)) {
    return fail("VALIDATION_ERROR", "Choose a supported audio or video file up to 40 MB");
  }
  try {
    const { result } = await runAI("media_extract", async ({ languageModel, abortSignal }) => {
      const { output } = await generateText({
        model: languageModel(),
        system: `Transcribe spoken words faithfully. Expected language: ${lang}. Also extract concise, useful visual or spoken details relevant to a campus maintenance/civic issue. Do not invent facts; state uncertainty. Return empty transcript if speech is absent.`,
        messages: [{ role: "user", content: [
          { type: "text", text: "Transcribe this media and summarize only useful observable issue details." },
          { type: "file", data: new Uint8Array(await file.arrayBuffer()), mediaType },
        ] }],
        output: Output.object({ schema: Schema }),
        abortSignal,
      });
      return output;
    }, { requireCaps: [file.type.startsWith("video/") ? "video" : "audio"], timeoutMs: 60_000 });
    return ok(result);
  } catch (error) {
    console.error("[media-extract] failed", error instanceof Error ? error.message : error);
    return fail("INTERNAL", "AI could not process this media. You can still submit the report manually.");
  }
}
