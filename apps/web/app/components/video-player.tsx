"use client";

import { useRef, useState } from "react";
import { ClipEditorProvider, useClipEditor } from "../lib/clip-editor-context";
import { TranscriptEditor } from "./transcript-editor";
import { Composer } from "./composer";

/**
 * Shell del editor: monta el provider y el layout transcript-first con video
 * PiP flotante. Toda la lógica vive en <ClipEditorProvider> (useClipEditor).
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
          <FloatingVideo />
        </ClipEditorProvider>
      </div>
    </div>
  );
}

function EditorBody() {
  const { words, transcript, transcribing, detecting } = useClipEditor();
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
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

      <aside className="flex min-h-0 border-t border-neutral-800 md:w-[360px] md:shrink-0 md:border-l md:border-t-0">
        <Composer />
      </aside>
    </div>
  );
}

/**
 * Video flotante (PiP) arrastrable dentro del modal. Arranca abajo-izquierda;
 * se mueve tomándolo de su barra superior. El elemento <video> se enlaza al
 * videoRef del editor para compartir seek/tiempo con transcript y composer.
 */
function FloatingVideo() {
  const { videoRef, url, loadError, setCurrentTime, setDuration } = useClipEditor();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const dragging = useRef<{ dx: number; dy: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  function onPointerDown(e: React.PointerEvent) {
    const rect = boxRef.current!.getBoundingClientRect();
    dragging.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    boxRef.current!.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    setPos({ x: e.clientX - dragging.current.dx, y: e.clientY - dragging.current.dy });
  }
  function onPointerUp(e: React.PointerEvent) {
    dragging.current = null;
    boxRef.current!.releasePointerCapture(e.pointerId);
  }

  return (
    <div
      ref={boxRef}
      className="fixed z-10 w-56 overflow-hidden rounded-lg border border-neutral-700 bg-black shadow-2xl md:w-64"
      style={pos ? { left: pos.x, top: pos.y } : { left: 24, bottom: 24, position: "absolute" }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex cursor-move items-center gap-1 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-500"
      >
        <span>⋮⋮</span>
        <span>preview</span>
      </div>
      {loadError ? (
        <p className="p-4 text-center text-xs text-red-300">{loadError}</p>
      ) : url ? (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            src={url}
            controls
            preload="metadata"
            className="w-full rounded-b-lg"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onError={() => setPlaybackError("Formato/códec no reproducible en el navegador.")}
          />
          {playbackError && (
            <p className="px-2 py-1 text-center text-[11px] text-amber-300">
              {playbackError}
            </p>
          )}
        </>
      ) : (
        <p className="p-4 text-center text-xs text-neutral-500">Cargando…</p>
      )}
    </div>
  );
}
