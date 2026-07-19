import type {
  CreateUploadResponse,
  SignPartResponse,
  Video,
  VideoStatus,
} from "@clip-lab/contracts";

const ALLOWED = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
]);

type AuthedFetch = <T>(
  path: string,
  init?: { method?: string; body?: unknown },
) => Promise<T>;

interface Manifest {
  videoId: string;
  partSizeBytes: number;
  parts: Record<number, string>; // partNumber -> etag
}

function manifestKey(file: File): string {
  return `clip-upload:${file.name}:${file.size}:${file.lastModified}`;
}

function loadManifest(file: File): Manifest | null {
  try {
    const raw = localStorage.getItem(manifestKey(file));
    return raw ? (JSON.parse(raw) as Manifest) : null;
  } catch {
    return null;
  }
}

function saveManifest(file: File, m: Manifest): void {
  try {
    localStorage.setItem(manifestKey(file), JSON.stringify(m));
  } catch {
    /* localStorage lleno o no disponible: la reanudación se degrada */
  }
}

function clearManifest(file: File): void {
  try {
    localStorage.removeItem(manifestKey(file));
  } catch {
    /* noop */
  }
}

export interface UploadCallbacks {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Sube un video con multipart directo a S3/MinIO, reanudable. Las partes ya
 * subidas (con ETag en el manifest de localStorage) se saltan al reintentar.
 */
export async function uploadVideo(
  file: File,
  authedFetch: AuthedFetch,
  cb: UploadCallbacks = {},
): Promise<Video> {
  const contentType = file.type || "video/mp4";
  if (!ALLOWED.has(contentType)) {
    throw new Error(
      "Formato no soportado. Usa MP4, MOV, MKV o WebM.",
    );
  }

  // Reutiliza una subida previa del mismo archivo si existe.
  let manifest = loadManifest(file);
  if (!manifest) {
    const created = await authedFetch<CreateUploadResponse>("/uploads", {
      method: "POST",
      body: { filename: file.name, sizeBytes: file.size, contentType },
    });
    manifest = {
      videoId: created.videoId,
      partSizeBytes: created.partSizeBytes,
      parts: {},
    };
    saveManifest(file, manifest);
  }

  const { videoId, partSizeBytes } = manifest;
  const totalParts = Math.max(1, Math.ceil(file.size / partSizeBytes));
  let uploadedBytes = Object.keys(manifest.parts).length * partSizeBytes;

  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    if (cb.signal?.aborted) throw new DOMException("Abortado", "AbortError");
    if (manifest.parts[partNumber]) continue; // ya subida

    const start = (partNumber - 1) * partSizeBytes;
    const end = Math.min(start + partSizeBytes, file.size);
    const blob = file.slice(start, end);

    const { url } = await authedFetch<SignPartResponse>(
      `/uploads/${videoId}/parts`,
      { method: "POST", body: { partNumber } },
    );

    const res = await fetch(url, {
      method: "PUT",
      body: blob,
      signal: cb.signal,
    });
    if (!res.ok) {
      throw new Error(`Falló la subida de la parte ${partNumber}`);
    }
    const etag = res.headers.get("ETag");
    if (!etag) {
      throw new Error(
        "No se pudo leer el ETag de la parte (revisa CORS de S3/MinIO).",
      );
    }

    manifest.parts[partNumber] = etag;
    saveManifest(file, manifest);
    uploadedBytes += end - start;
    cb.onProgress?.(Math.min(100, Math.round((uploadedBytes / file.size) * 100)));
  }

  const parts = Object.entries(manifest.parts)
    .map(([n, etag]) => ({ partNumber: Number(n), etag }))
    .sort((a, b) => a.partNumber - b.partNumber);

  const video = await authedFetch<Video>(`/uploads/${videoId}/complete`, {
    method: "POST",
    body: { parts },
  });

  clearManifest(file);
  cb.onProgress?.(100);
  return video;
}

export const VIDEO_STATUS_LABEL: Record<VideoStatus, string> = {
  UPLOADING: "Subiendo",
  PROCESSING: "Procesando",
  READY: "Listo",
  FAILED: "Error",
};
