/** Browser-only image helpers (canvas). Do not import from server code. */

export type CompressOptions = {
  /** Target upper bound for the output size. Default 400 KB (PRD S05). */
  maxBytes?: number;
  /** Longest side in pixels before quality steps kick in. Default 1600. */
  maxDimension?: number;
};

async function loadBitmap(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // fall through to <img> (e.g. HEIC on some browsers fails here and below)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Resizes and re-encodes a photo to WebP (JPEG if the browser cannot encode WebP) at or under `maxBytes`.
 * Steps quality down first, then shrinks dimensions. Strips EXIF (incl. GPS) as a side effect.
 */
export async function compressImage(file: Blob, opts: CompressOptions = {}): Promise<Blob> {
  const maxBytes = opts.maxBytes ?? 400_000;
  let maxDim = opts.maxDimension ?? 1600;
  const bmp = await loadBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unsupported");
    let best: Blob | null = null;
    for (let round = 0; round < 6; round++) {
      const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      ctx.drawImage(bmp.source, 0, 0, canvas.width, canvas.height);
      for (const q of [0.82, 0.72, 0.62, 0.52]) {
        let out = await toBlob(canvas, "image/webp", q);
        if (!out || out.type !== "image/webp") out = await toBlob(canvas, "image/jpeg", q);
        if (!out) continue;
        if (!best || out.size < best.size) best = out;
        if (out.size <= maxBytes) return out;
      }
      maxDim = Math.round(maxDim * 0.75);
    }
    if (!best) throw new Error("could not encode image");
    return best;
  } finally {
    bmp.close();
  }
}

/** Blob → `data:` URL (what `POST /api/ai/analyze` expects in `images[]`). */
export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
