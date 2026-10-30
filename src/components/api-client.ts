import type { ApiError as ApiErrorBody, ErrorCode } from "@/lib/domain";

/** Error thrown by `apiFetch` for non-2xx responses. `code` is the PRD section 10 error code. */
export class ApiError extends Error {
  constructor(public code: ErrorCode | "NETWORK", message: string, public status: number) {
    super(message);
  }
}

/**
 * fetch() wrapper for our JSON API routes (browser only). Throws `ApiError` with the API's error code,
 * or code "NETWORK" when the request never reached the server.
 */
export async function apiFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: json !== undefined ? { "content-type": "application/json", ...headers } : headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("NETWORK", "Network error", 0);
  }
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(err?.code ?? "INTERNAL", err?.message ?? res.statusText, res.status);
  }
  return body as T;
}

export const isApiError = (e: unknown, code?: ApiError["code"]): e is ApiError =>
  e instanceof ApiError && (code === undefined || e.code === code);

/**
 * Multipart upload with progress (XHR, because fetch has no upload progress). Resolves with the JSON body.
 */
export function uploadWithProgress<T>(url: string, form: FormData, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      const body = xhr.response as unknown;
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else {
        const err = (body as ApiErrorBody | null)?.error;
        reject(new ApiError(err?.code ?? "INTERNAL", err?.message ?? "Upload failed", xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError("NETWORK", "Network error", 0));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
