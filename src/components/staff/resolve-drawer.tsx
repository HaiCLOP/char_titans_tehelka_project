"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toLocaleDigits } from "@/lib/utils";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import type { ComplaintUpdateResult, UploadResult } from "@/lib/domain";
import { Button, Drawer, PhotoDropzone, Textarea, type PhotoItem } from "@/components/ui";
import { apiFetch, isApiError, uploadWithProgress } from "@/components/api-client";

/**
 * "Mark resolved" sheet (S12 / S15): note + after photo → POST /api/upload/resolution → POST /resolve.
 * The photo is required for field staff and optional for admins.
 */
export function ResolveDrawer({
  complaintId,
  code,
  open,
  onOpenChange,
  requirePhoto,
  onDone,
}: {
  complaintId: string;
  code: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  requirePhoto: boolean;
  onDone: (r: ComplaintUpdateResult) => void;
}) {
  const t = useTranslations("staff.resolve");
  const locale = useLocale();
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [errors, setErrors] = useState<{ note?: string; photo?: string }>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setNote("");
    setPhotos([]);
    setErrors({});
    setProgress(null);
  };

  async function submit() {
    const next: typeof errors = {};
    if (note.trim().length < 3) next.note = t("noteRequired");
    if (requirePhoto && photos.length === 0) next.photo = t("photoRequired");
    setErrors(next);
    if (next.note || next.photo) return;
    setBusy(true);
    try {
      let photo_path: string | null = null;
      if (photos[0]) {
        const form = new FormData();
        form.append("complaint_id", complaintId);
        form.append("file", photos[0].blob, photos[0].name);
        setProgress(0);
        photo_path = (await uploadWithProgress<UploadResult>("/api/upload/resolution", form, setProgress)).path;
      }
      const r = await apiFetch<ComplaintUpdateResult>(`/api/complaints/${encodeURIComponent(complaintId)}/resolve`, {
        method: "POST",
        json: { note: note.trim(), photo_path },
      });
      toast.success(t("done", { code }));
      reset();
      onOpenChange(false);
      onDone(r);
    } catch (e) {
      toast.error(isApiError(e, "INVALID_TRANSITION") ? t("changed") : isApiError(e, "FORBIDDEN") ? t("forbidden") : t("failed"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
      title={t("title")}
      description={t("body", { code })}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} loading={busy}>
            {!busy && <CheckCircle2 aria-hidden />}
            {progress !== null && progress < 100 ? t("uploading", { pct: toLocaleDigits(progress, locale) }) : t("submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Textarea
          id={`resolve-note-${complaintId}`}
          label={t("noteLabel")}
          hint={t("noteHint")}
          required
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setErrors((x) => ({ ...x, note: undefined }));
          }}
          maxLength={1000}
          showCount
          rows={4}
          error={errors.note}
        />
        <PhotoDropzone
          id={`resolve-photo-${complaintId}`}
          value={photos}
          onChange={(p) => {
            setPhotos(p);
            setErrors((x) => ({ ...x, photo: undefined }));
          }}
          max={1}
          label={requirePhoto ? t("photoLabel") : t("photoLabelOptional")}
          hint={t("photoHint")}
          error={errors.photo}
          disabled={busy}
        />
      </div>
    </Drawer>
  );
}
