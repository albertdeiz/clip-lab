"use client";

import { useState } from "react";
import { ClipEditorProvider, useClipEditor } from "../lib/clip-editor-context";
import { TranscriptEditor } from "./transcript-editor";
import { Composer } from "./composer";

/**
 * Shell del editor: monta el provider y el layout con el video arriba y la
 * transcripción (superficie de edición) debajo; el composer a la derecha.
 * Toda la lógica vive en <ClipEditorProvider> (useClipEditor).
 */
export function VideoPlayer({
  videoId,
  title,
  onClose,
}: {
  videoId: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Editando ${title}`}
      onClick={onClose}
    >
      <div
        className="relative flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950"
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

        <ClipEditorProvider videoId={videoId}>
          <EditorBody />
        </ClipEditorProvider>
      </div>
    </div>
  );
}

function EditorBody() {
  const { words, transcript, transcribing, detecting } = useClipEditor();
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* Columna principal: video arriba + transcript debajo */}
      <div className="flex min-h-0 flex-1 flex-col">
        <VideoStage />
        <main className="min-h-0 flex-1 overflow-y-auto">
          {transcript?.status === "FAILED" ? (
            <p className="p-6 text-sm text-red-400">
              {transcript.failReason ?? "No se pudo transcribir"}
            </p>
          ) : transcribing ? (
            <p className="flex items-center gap-2 p-6 text-sm text-neutral-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              Transcribiendo audio…
            </p>
          ) : words.length === 0 ? (
            <p className="p-6 text-sm text-neutral-500">
              {transcript?.text || "Sin diálogo detectado."}
            </p>
          ) : (
            <>
              {detecting && (
                <p className="flex items-center gap-2 border-b border-neutral-800 px-4 py-2 text-xs text-neutral-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
                  Detectando momentos sugeridos…
                </p>
              )}
              <TranscriptEditor />
            </>
          )}
        </main>
      </div>

      <aside className="flex min-h-0 border-t border-neutral-800 md:w-[360px] md:shrink-0 md:border-l md:border-t-0">
        <Composer />
      </aside>
    </div>
  );
}

/**
 * Sección de video, fija en la parte superior de la columna principal. El
 * <video> se enlaza al videoRef del editor para compartir seek/tiempo con
 * transcript y composer.
 */
function VideoStage() {
  const { videoRef, url, loadError, activeId, clips, clearActive, handleTimeUpdate, setDuration } =
    useClipEditor();
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const active = clips.find((c) => c._id === activeId) ?? null;

  return (
    <div className="relative shrink-0 border-b border-neutral-800 bg-black">
      {/* Indicador del timeline gobernado + salir a video completo */}
      {active && (
        <div className="absolute left-2 top-2 z-10 flex items-center gap-2 rounded-full bg-black/70 px-2.5 py-1 text-xs text-neutral-200 backdrop-blur">
          <span className="truncate max-w-[45vw] md:max-w-xs">
            ▶ {active.title}
            {active.segments.length > 1 ? ` · ${active.segments.length} tramos` : ""}
          </span>
          <button
            onClick={clearActive}
            className="rounded-full border border-neutral-600 px-2 py-0.5 text-neutral-300 hover:bg-neutral-700"
          >
            Ver video completo
          </button>
        </div>
      )}
      {loadError ? (
        <p className="p-10 text-center text-sm text-red-300">{loadError}</p>
      ) : url ? (
        <>
          {/* Sin autoPlay: el play nativo (gesto del usuario) reproduce con audio. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            src={url}
            controls
            preload="metadata"
            className="mx-auto max-h-[42vh] w-full"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget.currentTime)}
            onError={() =>
              setPlaybackError("Tu navegador no puede reproducir este formato o códec.")
            }
          />
          {playbackError && (
            <p className="p-2 text-center text-sm text-amber-300">{playbackError}</p>
          )}
        </>
      ) : (
        <p className="p-10 text-center text-sm text-neutral-500">Cargando…</p>
      )}
    </div>
  );
}
