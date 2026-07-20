"use client";

import { useEffect, useRef, useState } from "react";
import type { TranscriptResponse } from "@clip-lab/contracts";
import { useAuth } from "../lib/auth-context";

export function TranscriptPanel({
  videoId,
  currentTime,
  onSeek,
  activeRange,
}: {
  videoId: string;
  currentTime: number;
  onSeek: (sec: number) => void;
  activeRange?: { start: number; end: number } | null;
}) {
  const { authedFetch } = useAuth();
  const [transcript, setTranscript] = useState<TranscriptResponse | null>(null);
  const [nonce, setNonce] = useState(0);
  const activeRef = useRef<HTMLButtonElement>(null);
  const rangeRef = useRef<HTMLButtonElement>(null);

  // Poll mientras la transcripción está en curso.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const t = await authedFetch<TranscriptResponse>(
          `/videos/${videoId}/transcript`,
        );
        if (!active) return;
        setTranscript(t);
        if (t.status === "QUEUED" || t.status === "TRANSCRIBING") {
          timer = setTimeout(poll, 2000);
        }
      } catch {
        /* reintenta en el próximo montaje */
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
      await authedFetch(`/videos/${videoId}/transcript/retry`, {
        method: "POST",
      });
      setTranscript(null);
      setNonce((n) => n + 1);
    } catch {
      /* seguirá en FAILED */
    }
  }

  // Auto-scroll a la palabra activa (durante reproducción).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentTime]);

  // Al resaltar el rango de una sugerencia, desplázate hasta él.
  useEffect(() => {
    if (activeRange) {
      rangeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeRange]);

  if (!transcript) {
    return <p className="p-4 text-sm text-neutral-500">Cargando transcript…</p>;
  }

  if (transcript.status === "QUEUED" || transcript.status === "TRANSCRIBING") {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-neutral-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        {transcript.status === "QUEUED"
          ? "En cola para transcribir…"
          : "Transcribiendo audio…"}
      </p>
    );
  }

  if (transcript.status === "FAILED") {
    return (
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="text-sm text-red-400">
          {transcript.failReason ?? "No se pudo transcribir"}
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

  if (transcript.words.length === 0) {
    return (
      <p className="p-4 text-sm text-neutral-500">
        {transcript.text || "Sin diálogo detectado."}
      </p>
    );
  }

  return (
    <div className="p-4 text-sm leading-relaxed">
      <div className="mb-2 flex items-center gap-2 text-xs text-neutral-600">
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 uppercase">
          {transcript.language ?? "?"}
        </span>
        <span>Transcript · click en una palabra para saltar</span>
      </div>
      <p className="flex flex-wrap gap-x-1 gap-y-0.5">
        {(() => {
          const firstInRange = activeRange
            ? transcript.words.findIndex(
                (w) => w.start < activeRange.end && w.end > activeRange.start,
              )
            : -1;
          return transcript.words.map((word, i) => {
            const active = currentTime >= word.start && currentTime < word.end;
            const inRange =
              !!activeRange &&
              word.start < activeRange.end &&
              word.end > activeRange.start;
            return (
              <button
                key={i}
                ref={i === firstInRange ? rangeRef : active ? activeRef : undefined}
                onClick={() => onSeek(word.start)}
                className={`rounded px-0.5 transition ${
                  active
                    ? "bg-neutral-100 text-neutral-900"
                    : inRange
                      ? "bg-violet-500/40 text-white ring-1 ring-violet-400/50"
                      : "text-neutral-300 hover:bg-neutral-800"
                }`}
              >
                {word.w.trim()}
              </button>
            );
          });
        })()}
      </p>
    </div>
  );
}
