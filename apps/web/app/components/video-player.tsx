"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaybackUrlResponse } from "@clip-lab/contracts";
import { useAuth } from "../lib/auth-context";
import { TranscriptPanel } from "./transcript-panel";
import { HighlightsPanel } from "./highlights-panel";
import { ClipsPanel } from "./clips-panel";

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
  const [activeRange, setActiveRange] = useState<{
    start: number;
    end: number;
  } | null>(null);

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
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Reproduciendo ${title}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 className="truncate text-sm text-neutral-300">{title}</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-100"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto">
          <div className="flex flex-col md:flex-row">
            {/* Izquierda: video + momentos sugeridos justo debajo */}
            <div className="min-w-0 md:flex-1">
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
                      className="max-h-[55vh] w-full"
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
                  <p className="p-10 text-center text-sm text-neutral-500">
                    Cargando…
                  </p>
                )}
              </div>
              <div className="border-t border-neutral-800">
                <HighlightsPanel
                  videoId={videoId}
                  currentTime={currentTime}
                  onSeek={seek}
                  onHoverRange={setActiveRange}
                />
              </div>
            </div>

            {/* Derecha: transcript como panel lateral (scroll propio) */}
            <aside className="border-t border-neutral-800 md:max-h-[75vh] md:w-80 md:shrink-0 md:overflow-y-auto md:border-l md:border-t-0">
              <TranscriptPanel
                videoId={videoId}
                currentTime={currentTime}
                onSeek={seek}
                activeRange={activeRange}
              />
            </aside>
          </div>

          {/* Clips generados: sección al final, ancho completo */}
          <div className="border-t border-neutral-800">
            <ClipsPanel videoId={videoId} />
          </div>
        </div>
      </div>
    </div>
  );
}
