"use client";

import { useEffect, useState } from "react";
import type { HighlightsResponse } from "@clip-lab/contracts";
import { useAuth } from "../lib/auth-context";

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function HighlightsPanel({
  videoId,
  onSeek,
}: {
  videoId: string;
  onSeek: (sec: number) => void;
}) {
  const { authedFetch } = useAuth();
  const [data, setData] = useState<HighlightsResponse | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await authedFetch<HighlightsResponse>(
          `/videos/${videoId}/highlights`,
        );
        if (!active) return;
        setData(res);
        if (res.status === "QUEUED" || res.status === "DETECTING") {
          timer = setTimeout(poll, 3000);
        }
      } catch {
        /* reintenta al remontar */
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [videoId, authedFetch, nonce]);

  async function retry() {
    try {
      await authedFetch(`/videos/${videoId}/highlights/retry`, {
        method: "POST",
      });
      setData(null);
      setNonce((n) => n + 1);
    } catch {
      /* el estado seguirá en FAILED */
    }
  }

  if (!data) {
    return <p className="p-4 text-sm text-neutral-500">Cargando highlights…</p>;
  }

  if (data.status === "QUEUED" || data.status === "DETECTING") {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-neutral-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
        {data.status === "QUEUED"
          ? "En cola para detectar momentos…"
          : "Detectando momentos virales con IA…"}
      </p>
    );
  }

  if (data.status === "FAILED") {
    return (
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="text-sm text-red-400">
          {data.failReason ?? "No se pudieron detectar highlights"}
        </p>
        <button
          onClick={() => void retry()}
          className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition hover:bg-neutral-800"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <p className="p-4 text-sm text-neutral-500">
        No se detectaron momentos destacados.
      </p>
    );
  }

  return (
    <div className="top-0 sticky space-y-2 p-4">
      <div className="flex items-center justify-between text-xs text-neutral-600">
        <span>{data.items.length} momentos sugeridos por IA</span>
        {data.costUsd !== null && <span>${data.costUsd.toFixed(4)}</span>}
      </div>
      {data.items.map((h, i) => (
        <button
          key={i}
          onClick={() => onSeek(h.start)}
          className="flex w-full items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-left transition hover:border-neutral-600"
        >
          <span className="mt-0.5 shrink-0 rounded bg-violet-950/60 px-1.5 py-0.5 text-xs text-violet-300">
            {Math.round(h.score * 100)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-neutral-100">
              {h.title}
            </span>
            <span className="block truncate text-xs text-neutral-500">
              {fmt(h.start)}–{fmt(h.end)} · {h.reason}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
