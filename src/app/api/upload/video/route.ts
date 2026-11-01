import { randomUUID } from "node:crypto";
import { fail, ok, requireUser } from "@/lib/api";
import { MAX_VIDEO_UPLOAD_BYTES } from "@/lib/domain";

const allowed = new Map([["video/mp4", ["mp4", "ftyp"]], ["video/webm", ["webm", "\u001aE\u00df\u00a3"]], ["video/quicktime", ["mov", "ftyp"]]] as const);

function durationSeconds(bytes: Uint8Array, type: string): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type !== "video/webm" && type !== "video/mp4" && type !== "video/quicktime") return null;
  if (type !== "video/webm") {
    for (let i = 4; i + 28 < bytes.length; i++) {
      if (String.fromCharCode(...bytes.subarray(i, i + 4)) !== "mvhd") continue;
      const version = bytes[i + 4];
      const scaleAt = i + (version === 1 ? 24 : 16);
      const durationAt = i + (version === 1 ? 28 : 20);
      const scale = view.getUint32(scaleAt);
      const duration = version === 1 ? Number(view.getBigUint64(durationAt)) : view.getUint32(durationAt);
      if (scale > 0 && duration > 0) return duration / scale;
    }
    return null;
  }
  // WebM Info/Duration (EBML ID 0x4489). Duration uses TimecodeScale units; the default scale is 1 ms.
  for (let i = 0; i + 4 < bytes.length; i++) {
    if (bytes[i] !== 0x44 || bytes[i + 1] !== 0x89) continue;
    const first = bytes[i + 2]; let sizeLen = 1; let mask = 0x80;
    while (sizeLen <= 8 && (first & mask) === 0) { sizeLen++; mask >>= 1; }
    if (sizeLen > 8 || i + 2 + sizeLen >= bytes.length) continue;
    let size = first & (mask - 1);
    for (let n = 1; n < sizeLen; n++) size = size * 256 + bytes[i + 2 + n];
    const start = i + 2 + sizeLen;
    if (size === 4 && start + 4 <= bytes.length) return view.getFloat32(start) / 1000;
    if (size === 8 && start + 8 <= bytes.length) return view.getFloat64(start) / 1000;
  }
  return null;
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("VALIDATION_ERROR", "A video file is required");
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) return fail("VALIDATION_ERROR", "Video must be 40 MB or smaller");
  const spec = allowed.get(file.type as "video/mp4" | "video/webm" | "video/quicktime");
  if (!spec) return fail("VALIDATION_ERROR", "Use MP4, WebM, or MOV video");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = spec[1] === "ftyp"
    ? String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp"
    : String.fromCharCode(...bytes.subarray(0, 4)) === spec[1];
  if (!signature) return fail("VALIDATION_ERROR", "The video file could not be verified");
  const duration = durationSeconds(bytes, file.type);
  if (duration == null) return fail("VALIDATION_ERROR", "Could not verify this video's duration. Use a standard MP4, WebM, or MOV file.");
  if (duration > 60) return fail("VALIDATION_ERROR", "Videos must be 1 minute or shorter");
  const path = `${auth.user.id}/${randomUUID()}.${spec[0]}`;
  const { error } = await auth.supabase.storage.from("complaint-videos").upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) {
    console.error("[upload-video] storage error", error.message);
    return fail("INTERNAL", "Could not store the video");
  }
  return ok({ path });
}
