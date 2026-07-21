"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { colorOf, fmt, wordInRange } from "../lib/editor";
import { decorateWord } from "../lib/decorators";
import { useClipEditor } from "../lib/clip-editor-context";

type Drag =
  | { kind: "select" }
  | { kind: "trim"; edge: "start" | "end"; segIdx: number }
  | null;

interface Mark {
  segIdx: number;
  kind: "start" | "end";
  order: number;
}

/**
 * Transcript interactivo: el texto ES el timeline y la superficie de edición.
 *  - click en palabra → saltar (seek)
 *  - arrastrar sobre palabras → seleccionar rango (→ crear/fijar/añadir a clip)
 *  - arrastrar las manijas de cada tramo del clip activo → recortar ese tramo
 * Un clip multi-tramo muestra un número de orden por tramo (clip resumen).
 */
export function TranscriptEditor() {
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
    trimSegment,
    createFromSelection,
    fixSelectionToActive,
    addSegmentFromSelection,
  } = useClipEditor();

  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>(null);
  const moved = useRef(false);

  // Seguir la reproducción (pin): auto-scroll a la palabra que suena.
  const [follow, setFollow] = useState(true);
  const playingRef = useRef<HTMLButtonElement>(null);
  const playingIdx = useMemo(
    () => words.findIndex((w) => currentTime >= w.start && currentTime < w.end),
    [words, currentTime],
  );
  useEffect(() => {
    if (follow && playingIdx >= 0) {
      playingRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [follow, playingIdx]);

  const activeIdx = clips.findIndex((c) => c._id === activeId);
  const activeClip = activeIdx >= 0 ? clips[activeIdx]! : null;

  // Marcas de manija por palabra: primer/última palabra de cada tramo del activo.
  const marks = useMemo(() => {
    const map = new Map<number, Mark[]>();
    if (!activeClip) return map;
    activeClip.segments.forEach((s, segIdx) => {
      let first = -1;
      let last = -1;
      words.forEach((w, i) => {
        if (wordInRange(w, s)) {
          if (first < 0) first = i;
          last = i;
        }
      });
      if (first < 0) return;
      const add = (idx: number, kind: "start" | "end") => {
        const arr = map.get(idx) ?? [];
        arr.push({ segIdx, kind, order: segIdx + 1 });
        map.set(idx, arr);
      };
      add(first, "start");
      add(last, "end");
    });
    return map;
  }, [activeClip, words]);

  const multi = (activeClip?.segments.length ?? 0) > 1;
  const gripColor = activeIdx >= 0 ? colorOf(activeIdx).grip : "";

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
    if (handle && activeClip) {
      drag.current = {
        kind: "trim",
        edge: handle.dataset.handle as "start" | "end",
        segIdx: Number(handle.dataset.seg),
      };
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
      trimSegment(
        drag.current.segIdx,
        drag.current.edge,
        drag.current.edge === "start" ? w.start : w.end,
      );
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
        <span className="min-w-0 flex-1 truncate">
          Arrastra para seleccionar · click para saltar · manijas para recortar
        </span>
        <button
          onClick={() => setFollow((f) => !f)}
          title={follow ? "Dejar de seguir la reproducción" : "Seguir la reproducción"}
          className={`shrink-0 rounded-full border px-2 py-0.5 ${
            follow
              ? "border-violet-500/60 bg-violet-600/20 text-violet-200"
              : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
          }`}
        >
          {follow ? "📌 Siguiendo" : "📍 Seguir"}
        </button>
      </div>
      <p className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {words.map((word, i) => {
          const selected = !!sel && i >= sel.a && i <= sel.b;
          const cls = [
            "cursor-text",
            decorateWord(word, i, { clips, activeId, currentTime }, decorators),
            selected ? "ring-2 ring-white/70" : "",
          ].join(" ");
          const wordMarks = marks.get(i);
          const starts = wordMarks?.filter((m) => m.kind === "start") ?? [];
          const ends = wordMarks?.filter((m) => m.kind === "end") ?? [];

          return (
            <span key={i} className="inline-flex items-center">
              {starts.map((m) => (
                <span key={`s${m.segIdx}`} className="mr-0.5 inline-flex items-center">
                  {multi && (
                    <span
                      className={`mr-0.5 grid h-4 w-4 place-items-center rounded-full text-[10px] font-semibold text-neutral-950 ${gripColor}`}
                    >
                      {m.order}
                    </span>
                  )}
                  <span
                    data-handle="start"
                    data-seg={m.segIdx}
                    title="Recortar inicio del tramo"
                    className={`h-5 w-1.5 cursor-ew-resize rounded-full ${gripColor}`}
                  />
                </span>
              ))}
              <button
                data-idx={i}
                ref={i === playingIdx ? playingRef : undefined}
                onClick={(e) => e.preventDefault()}
                className={cls}
              >
                {word.w.trim()}
              </button>
              {ends.map((m) => (
                <span
                  key={`e${m.segIdx}`}
                  data-handle="end"
                  data-seg={m.segIdx}
                  title="Recortar fin del tramo"
                  className={`ml-0.5 h-5 w-1.5 cursor-ew-resize rounded-full ${gripColor}`}
                />
              ))}
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
              <>
                <button
                  onClick={addSegmentFromSelection}
                  className="rounded-full border border-violet-600 px-2.5 py-1 text-violet-200 hover:bg-violet-600/20"
                  title="Añadir como tramo al clip activo (clip resumen)"
                >
                  + Añadir a activo <span className="text-violet-400">A</span>
                </button>
                <button
                  onClick={fixSelectionToActive}
                  className="rounded-full border border-neutral-700 px-2.5 py-1 text-neutral-200 hover:bg-neutral-800"
                  title="Reemplazar el clip activo por este único rango"
                >
                  Fijar <span className="text-neutral-600">F</span>
                </button>
              </>
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
