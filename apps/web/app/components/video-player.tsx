"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaybackUrlResponse } from "@clip-lab/contracts";
import { useAuth } from "../lib/auth-context";
import { TranscriptPanel } from "./transcript-panel";

export function VideoPlayer({
  videoId,
  title,
  onClose,
}: {
  videoId: string;
  title: string;
  onClose: () => void;
}) {
  const { authedFetch } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await authedFetch<PlaybackUrlResponse>(
          `/videos/${videoId}/playback-url`,
        );
        if (active) setUrl(res.url);
      } catch {
        if (active) setError("No se pudo cargar el video");
      }
    })();
    return () => {
      active = false;
    };
  }, [videoId, authedFetch]);

  const seek = (sec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = sec;
      void videoRef.current.play().catch(() => undefined);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Reproduciendo ${title}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="truncate text-sm text-neutral-300">{title}</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-100"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="bg-black">
          {error ? (
            <p className="p-10 text-center text-sm text-red-300">{error}</p>
          ) : url ? (
            <>
              {/* Sin autoPlay: el play nativo (gesto del usuario) reproduce con audio. */}
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoRef}
                src={url}
                controls
                preload="metadata"
                className="max-h-[60vh] w-full"
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onError={() =>
                  setPlaybackError(
                    "Tu navegador no puede reproducir este formato o códec.",
                  )
                }
              />
              {playbackError && (
                <p className="p-3 text-center text-sm text-amber-300">
                  {playbackError}
                </p>
              )}
            </>
          ) : (
            <p className="p-10 text-center text-sm text-neutral-500">Cargando…</p>
          )}
        </div>

        <div className="border-t border-neutral-800">
          <TranscriptPanel
            videoId={videoId}
            currentTime={currentTime}
            onSeek={seek}
          />
        </div>
      </div>
    </div>
  );
}
