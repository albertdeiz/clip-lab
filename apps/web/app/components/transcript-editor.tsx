"use client";

import { useMemo, useRef } from "react";
import { colorOf, fmt, wordInRange } from "../lib/editor";
import { decorateWord } from "../lib/decorators";
import { useClipEditor } from "../lib/clip-editor-context";

type Drag =
  | { kind: "select" }
  | { kind: "trim"; edge: "start" | "end" }
  | null;

/**
 * Transcript interactivo: el texto ES el timeline y la superficie de edición.
 *  - click en palabra → saltar (seek)
 *  - arrastrar sobre palabras → seleccionar un rango (→ crear/fijar clip)
 *  - arrastrar las manijas del clip activo → recortar inicio/fin palabra a palabra
 * Las capas visuales (clips, cabezal, …) las aporta el registro de decorators.
 */
export function TranscriptEditor() {
  const editor = useClipEditor();
  const {
    words,
    clips,
    activeId,
    currentTime,
    language,
    decorators,
    selection,
    setSelection,
    seek,
    trim,
    createFromSelection,
    fixSelectionToActive,
  } = editor;

  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>(null);
  const moved = useRef(false);

  const activeIdx = clips.findIndex((c) => c._id === activeId);
  // Primer/última palabra del clip activo, para colocar las manijas de recorte.
  const { activeStart, activeEnd } = useMemo(() => {
    if (activeIdx < 0) return { activeStart: -1, activeEnd: -1 };
    let s = -1;
    let e = -1;
    words.forEach((w, i) => {
      if (wordInRange(w, clips[activeIdx]!)) {
        if (s < 0) s = i;
        e = i;
      }
    });
    return { activeStart: s, activeEnd: e };
  }, [words, clips, activeIdx]);

  function idxAtPoint(x: number, y: number): number | null {
    const el = document
      .elementFromPoint(x, y)
      ?.closest("[data-idx]") as HTMLElement | null;
    if (!el?.dataset.idx) return null;
    return Number(el.dataset.idx);
  }

  function onPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    const handle = target.closest("[data-handle]") as HTMLElement | null;
    if (handle && activeIdx >= 0) {
      drag.current = { kind: "trim", edge: handle.dataset.handle as "start" | "end" };
      containerRef.current?.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    const wordEl = target.closest("[data-idx]") as HTMLElement | null;
    if (!wordEl?.dataset.idx) return;
    const idx = Number(wordEl.dataset.idx);
    drag.current = { kind: "select" };
    moved.current = false;
    setSelection({ a: idx, b: idx });
    containerRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const idx = idxAtPoint(e.clientX, e.clientY);
    if (idx == null) return;
    if (drag.current.kind === "select") {
      setSelection(selection ? { a: selection.a, b: idx } : { a: idx, b: idx });
      if (selection && idx !== selection.a) moved.current = true;
    } else {
      const w = words[idx]!;
      trim(drag.current.edge, drag.current.edge === "start" ? w.start : w.end);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    containerRef.current?.releasePointerCapture(e.pointerId);
    if (d?.kind === "select" && selection) {
      if (!moved.current && selection.a === selection.b) {
        seek(words[selection.a]!.start);
        setSelection(null);
      }
      // si hubo arrastre real, se mantiene la selección → barra de acciones
    }
  }

  const sel = selection
    ? { a: Math.min(selection.a, selection.b), b: Math.max(selection.a, selection.b) }
    : null;

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="select-none p-4 text-[15px] leading-8"
      style={{ touchAction: "none" }}
    >
      <div className="mb-3 flex items-center gap-2 text-xs text-neutral-600">
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 uppercase">
          {language ?? "?"}
        </span>
        <span>
          Arrastra para seleccionar · click para saltar · manijas del clip activo
          para recortar
        </span>
      </div>
      <p className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {words.map((word, i) => {
          const isActiveClip = activeIdx >= 0 && wordInRange(word, clips[activeIdx]!);
          const selected = !!sel && i >= sel.a && i <= sel.b;
          const cls = [
            "cursor-text",
            decorateWord(word, i, { clips, activeId, currentTime }, decorators),
            selected ? "ring-2 ring-white/70" : "",
          ].join(" ");
          const gripColor = activeIdx >= 0 ? colorOf(activeIdx).grip : "";

          return (
            <span key={i} className="inline-flex items-center">
              {isActiveClip && i === activeStart && (
                <span
                  data-handle="start"
                  title="Recortar inicio"
                  className={`mr-0.5 h-5 w-1.5 cursor-ew-resize rounded-full ${gripColor}`}
                />
              )}
              <button data-idx={i} onClick={(e) => e.preventDefault()} className={cls}>
                {word.w.trim()}
              </button>
              {isActiveClip && i === activeEnd && (
                <span
                  data-handle="end"
                  title="Recortar fin"
                  className={`ml-0.5 h-5 w-1.5 cursor-ew-resize rounded-full ${gripColor}`}
                />
              )}
            </span>
          );
        })}
      </p>

      {sel && (
        <div className="sticky bottom-2 mt-3 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900/95 px-2 py-1 text-xs shadow-lg">
            <span className="px-1 text-neutral-400">
              {fmt(words[sel.a]!.start)}–{fmt(words[sel.b]!.end)} ·{" "}
              {Math.round(words[sel.b]!.end - words[sel.a]!.start)}s
            </span>
            <button
              onClick={createFromSelection}
              className="rounded-full bg-neutral-100 px-2.5 py-1 font-medium text-neutral-900 hover:bg-white"
            >
              + Nuevo clip <span className="text-neutral-500">C</span>
            </button>
            {activeId && (
              <button
                onClick={fixSelectionToActive}
                className="rounded-full border border-neutral-700 px-2.5 py-1 text-neutral-200 hover:bg-neutral-800"
              >
                Fijar en activo <span className="text-neutral-600">F</span>
              </button>
            )}
            <button
              onClick={() => setSelection(null)}
              className="rounded-full px-2 py-1 text-neutral-500 hover:text-neutral-200"
              aria-label="Cancelar selección"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
