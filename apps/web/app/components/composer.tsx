"use client";

import { colorOf, dur, fmt } from "../lib/editor";
import { useClipEditor } from "../lib/clip-editor-context";
import { ClipsPanel } from "./clips-panel";

/**
 * Composer: la lista de clips que se están armando. Cada fila es seleccionable
 * (marca el clip "activo", resaltado en el transcript y objetivo de las
 * ediciones). Debajo, los clips 9:16 ya renderizados. Toda su data sale del
 * context del editor (sin props).
 */
export function Composer() {
  const {
    videoId,
    clips,
    activeId,
    dirty,
    saving,
    generating,
    generatedKey,
    setActive,
    setTitle,
    deleteClip,
    addClipAtCursor,
    snapAll,
    save,
    generate,
  } = useClipEditor();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-4 py-3">
        <span className="text-xs uppercase tracking-widest text-neutral-500">
          Composer ({clips.length})
        </span>
        <button
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-900 hover:bg-white disabled:opacity-40"
        >
          {saving ? "Guardando…" : dirty ? "Guardar" : "Guardado"}
        </button>
      </div>

      <div className="flex gap-1.5 border-b border-neutral-800 px-4 py-2 text-xs">
        <button
          onClick={addClipAtCursor}
          className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-800"
        >
          + Clip aquí
        </button>
        <button
          onClick={snapAll}
          disabled={clips.length === 0}
          className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
          title="Ajustar todos los cortes a frases completas"
        >
          Cortes limpios
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div>
          {clips.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">
              Selecciona texto en el transcript y pulsa «Nuevo clip» (o tecla C), o
              usa «+ Clip aquí».
            </p>
          ) : (
            <ul className="space-y-2 p-3">
              {clips.map((c, i) => {
                const color = colorOf(i);
                const active = c._id === activeId;
                return (
                  <li
                    key={c._id}
                    onClick={() => setActive(c._id)}
                    className={`cursor-pointer rounded-lg border bg-neutral-900/40 p-2 transition ${
                      active
                        ? `${color.border} bg-neutral-900`
                        : "border-neutral-800 hover:border-neutral-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.dot}`} />
                      <input
                        value={c.title}
                        onChange={(e) => setTitle(c._id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm text-neutral-100 outline-none focus:bg-neutral-800"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteClip(c._id);
                        }}
                        className="shrink-0 text-neutral-500 hover:text-red-400"
                        aria-label="Eliminar clip"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-2 pl-4 text-xs text-neutral-500">
                      <span className={color.text}>
                        {fmt(c.start)}–{fmt(c.end)}
                      </span>
                      <span>· {Math.round(dur(c))}s</span>
                      <span className="ml-auto">{Math.round(c.score * 100)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-neutral-800">
          <ClipsPanel
            videoId={videoId}
            compact
            showGenerate={false}
            reloadKey={generatedKey}
          />
        </div>
      </div>

      <div className="border-t border-neutral-800 p-3">
        <button
          onClick={() => void generate()}
          disabled={generating || clips.length === 0}
          className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
        >
          {generating ? "Generando…" : "Generar clips 9:16"}
        </button>
      </div>
    </div>
  );
}
