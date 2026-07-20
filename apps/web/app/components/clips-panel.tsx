"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClipListResponse, Clip, PlaybackUrlResponse } from "@clip-lab/contracts";
import { useAuth } from "../lib/auth-context";

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ClipCard({ videoId, clip }: { videoId: string; clip: Clip }) {
  const { authedFetch } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const getUrl = useCallback(async (): Promise<string> => {
    if (url) return url;
    const res = await authedFetch<PlaybackUrlResponse>(
      `/videos/${videoId}/clips/${clip.id}/playback-url`,
    );
    setUrl(res.url);
    return res.url;
  }, [url, authedFetch, videoId, clip.id]);

  async function download() {
    const u = await getUrl();
    const a = document.createElement("a");
    a.href = u;
    a.download = `${clip.title}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium">{clip.title}</span>
        <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
          {clip.segments && clip.segments.length > 1
            ? `${clip.segments.length} tramos`
            : fmt(clip.startSec)}
        </span>
      </div>

      {clip.status === "READY" ? (
        <>
          {playing && url ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={url} controls autoPlay className="mx-auto max-h-80 rounded-lg" />
          ) : (
            <button
              onClick={() => void getUrl().then(() => setPlaying(true))}
              className="grid aspect-[9/16] max-h-80 place-items-center rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-500 transition hover:text-neutral-200"
              aria-label={`Reproducir ${clip.title}`}
            >
              ▶ 9:16
            </button>
          )}
          <button
            onClick={() => void download()}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition hover:bg-neutral-800"
          >
            Descargar
          </button>
        </>
      ) : clip.status === "FAILED" ? (
        <p className="text-xs text-red-400">{clip.failReason ?? "Falló el render"}</p>
      ) : (
        <p className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
          Renderizando…
        </p>
      )}
    </li>
  );
}

export function ClipsPanel({
  videoId,
  compact = false,
  showGenerate = true,
  reloadKey = 0,
}: {
  videoId: string;
  /** Columna angosta (1 col) para el composer lateral. */
  compact?: boolean;
  /** Muestra el botón de generar propio (off cuando el composer lo controla). */
  showGenerate?: boolean;
  /** Cambia este valor para forzar un refetch (p. ej. tras generar). */
  reloadKey?: number;
}) {
  const { authedFetch } = useAuth();
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    const res = await authedFetch<ClipListResponse>(`/videos/${videoId}/clips`);
    setClips(res.items);
    return res.items;
  }, [authedFetch, videoId]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const items = await load();
        if (!active) return;
        const pending = items.some(
          (c) => c.status === "QUEUED" || c.status === "RENDERING",
        );
        if (pending) timer = setTimeout(poll, 3000);
      } catch {
        /* reintenta al remontar */
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load, reloadKey]);

  async function generate() {
    setGenerating(true);
    try {
      await authedFetch(`/videos/${videoId}/clips/retry`, { method: "POST" });
      await load();
    } catch {
      /* noop */
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-neutral-500">
          Clips generados
        </span>
        {showGenerate && (
          <button
            onClick={() => void generate()}
            disabled={generating}
            className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {generating ? "Generando…" : clips && clips.length ? "Regenerar" : "Generar clips"}
          </button>
        )}
      </div>
      {!clips ? (
        <p className="text-sm text-neutral-500">Cargando clips…</p>
      ) : clips.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Aún no hay clips. Ármalos desde el transcript y pulsa «Generar».
        </p>
      ) : (
        <ul
          className={
            compact
              ? "grid grid-cols-1 gap-3"
              : "grid grid-cols-2 gap-3 sm:grid-cols-3"
          }
        >
          {clips.map((c) => (
            <ClipCard key={c.id} videoId={videoId} clip={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
