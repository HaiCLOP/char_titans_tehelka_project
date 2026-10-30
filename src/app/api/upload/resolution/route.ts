import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, type UploadResult } from "@/lib/domain";
import { fail, failFrom, ok, requireUser } from "@/lib/api";
import { uploadResolutionPhoto } from "@/lib/admin";
import { sniffImage } from "@/lib/image-sniff";

// After photo -> resolution-photos/{complaint_id}/{uuid}.{ext}. Multipart fields: `file`, `complaint_id`.
// Only the ticket's assignee or its admins. Written with the service role after that check, because the
// storage policy only lets admins upload to this bucket (field staff could not otherwise).
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const complaintId = form?.get("complaint_id");
  if (typeof complaintId !== "string" || !complaintId) return fail("VALIDATION_ERROR", "Field 'complaint_id' is required");
  if (!(file instanceof File)) return fail("VALIDATION_ERROR", "Field 'file' with an image is required");
  if (file.size === 0) return fail("VALIDATION_ERROR", "Empty file");
  if (file.size > MAX_UPLOAD_BYTES) return fail("VALIDATION_ERROR", "Image must be 5 MB or smaller");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type || !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type) || type !== file.type) {
    return fail("VALIDATION_ERROR", "Only JPEG, PNG or WebP images are allowed");
  }
  try {
    const path = await uploadResolutionPhoto(auth.supabase, { id: auth.user.id, profile: auth.profile }, complaintId, bytes, type);
    return ok<UploadResult>({ path }, { status: 201 });
  } catch (e) {
    return failFrom(e, "store the image");
  }
}
