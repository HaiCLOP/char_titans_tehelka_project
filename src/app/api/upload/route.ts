import { randomUUID } from "node:crypto";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, type UploadResult } from "@/lib/domain";
import { fail, ok, requireUser } from "@/lib/api";

const EXT: Record<(typeof ALLOWED_IMAGE_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Checks the file's magic bytes so a renamed non-image is rejected even if the browser lies about its type. */
function sniff(b: Uint8Array): (typeof ALLOWED_IMAGE_TYPES)[number] | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Sniffs metadata in PNG/JPEG/WebP headers to detect AI generator signatures. */
function isAIGeneratedMetadata(b: Uint8Array): boolean {
  const sampleSize = Math.min(b.length, 65536);
  // Check the head (where PNG text chunks and JPEG EXIF usually live) and tail
  const head = String.fromCharCode(...b.subarray(0, sampleSize));
  const tail = b.length > sampleSize ? String.fromCharCode(...b.subarray(b.length - Math.min(b.length - sampleSize, 16384))) : "";
  const text = head + " " + tail;

  const patterns = [
    /parameters\s*:\s*[^\x00]{10,}/i,
    /Negative\s+prompt\s*:/i,
    /Steps\s*:\s*\d+,\s*Sampler\s*:/i,
    /Software[\x00-\x20]+(Stable\s*Diffusion|Midjourney|NovelAI|DALL[-·]?E)/i,
    /comfyui|civitai\.com|dreamstudio|invokeai/i,
    /prompt[\x00-\x20]*:\s*\{"class_type"/i,
  ];

  return patterns.some((p) => p.test(text));
}

// Complaint photo → complaint-photos/{uid}/{uuid}.{ext}, written with the user's client (storage RLS: folder = uid).
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const { user, supabase } = auth;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("VALIDATION_ERROR", "Field 'file' with an image is required");
  if (file.size === 0) return fail("VALIDATION_ERROR", "Empty file");
  if (file.size > MAX_UPLOAD_BYTES) return fail("VALIDATION_ERROR", "Image must be 5 MB or smaller");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type || !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type) || type !== file.type) {
    return fail("VALIDATION_ERROR", "Only JPEG, PNG or WebP images are allowed");
  }

  // Reject AI-generated images with generator metadata
  if (isAIGeneratedMetadata(bytes)) {
    return fail("VALIDATION_ERROR", "AI-generated or synthetic images are not permitted. Please upload an authentic photo of the campus issue.");
  }

  const path = `${user.id}/${randomUUID()}.${EXT[type]}`;
  const { error } = await supabase.storage
    .from("complaint-photos")
    .upload(path, bytes, { contentType: type, upsert: false });
  if (error) {
    console.error("[upload] storage error", error.message);
    return fail("INTERNAL", "Could not store the image");
  }
  return ok<UploadResult>({ path });
}
