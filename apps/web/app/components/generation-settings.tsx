"use client";

import type { GenerationConfig } from "@clip-lab/contracts";
import { useClipEditor } from "../lib/clip-editor-context";

const GRANULARITY: [GenerationConfig["granularity"], string][] = [
  ["few-long", "Pocas ideas largas"],
  ["balanced", "Equilibrado"],
  ["many-short", "Muchas cortas"],
];
const STYLE: [GenerationConfig["style"], string][] = [
  ["balanced", "Equilibrado"],
  ["educational", "Educativo"],
  ["viral-hooks", "Ganchos virales"],
  ["quotes", "Citas"],
];
const LANG: [string, string][] = [
  ["auto", "Auto (idioma del video)"],
  ["es", "Español"],
  ["en", "English"],
];

const field = "w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-neutral-500";

/**
 * Panel de generación on-demand: parámetros de comportamiento + CTA.
 * Provider/modelo/keys NO se exponen aquí (quedan server-side).
 */
export function GenerationSettings() {
  const {
    genConfig,
    setGenConfig,
    generateMoments,
    momentsStatus,
    momentsGenerating,
    momentsFailReason,
    clips,
    dirty,
  } = useClipEditor();

  const busy =
    momentsGenerating ||
    momentsStatus === "QUEUED" ||
    momentsStatus === "DETECTING";
  const set = (p: Partial<GenerationConfig>) => setGenConfig({ ...genConfig, ...p });
  const isIdle = momentsStatus === "IDLE";

  function onGenerate() {
    if (
      clips.length > 0 &&
      dirty &&
      !window.confirm(
        "Tienes cambios sin guardar. Regenerar reemplazará los momentos actuales. ¿Continuar?",
      )
    ) {
      return;
    }
    void generateMoments();
  }

  return (
    <div className="space-y-2 border-b border-neutral-800 p-3">
      <details open={isIdle}>
        <summary className="cursor-pointer select-none text-xs uppercase tracking-widest text-neutral-500">
          Ajustes de generación
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="col-span-2 flex items-center justify-between gap-2 text-xs text-neutral-400">
            Cantidad de momentos
            <input
              type="number"
              min={1}
              max={30}
              value={genConfig.targetCount}
              onChange={(e) => set({ targetCount: Number(e.target.value) })}
              className="w-16 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-right text-xs text-neutral-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Duración mín (s)
            <input
              type="number"
              min={1}
              value={genConfig.minSec}
              onChange={(e) => set({ minSec: Number(e.target.value) })}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Duración máx (s)
            <input
              type="number"
              min={1}
              value={genConfig.maxSec}
              onChange={(e) => set({ maxSec: Number(e.target.value) })}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Granularidad
            <select
              value={genConfig.granularity}
              onChange={(e) =>
                set({ granularity: e.target.value as GenerationConfig["granularity"] })
              }
              className={field}
            >
              {GRANULARITY.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Estilo
            <select
              value={genConfig.style}
              onChange={(e) =>
                set({ style: e.target.value as GenerationConfig["style"] })
              }
              className={field}
            >
              {STYLE.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-[11px] text-neutral-500">
            Idioma de títulos
            <select
              value={genConfig.titleLanguage}
              onChange={(e) => set({ titleLanguage: e.target.value })}
              className={field}
            >
              {LANG.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-neutral-400">
            <input
              type="checkbox"
              checked={genConfig.allowMultiSegment}
              onChange={(e) => set({ allowMultiSegment: e.target.checked })}
            />
            Multi-segmento
          </label>
          <label className="flex items-center gap-2 text-[11px] text-neutral-400">
            <input
              type="checkbox"
              checked={genConfig.includeSummary}
              onChange={(e) => set({ includeSummary: e.target.checked })}
            />
            Incluir resumen
          </label>
        </div>
      </details>

      {momentsFailReason && (
        <p className="text-xs text-red-400">{momentsFailReason}</p>
      )}

      <button
        onClick={onGenerate}
        disabled={busy}
        className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
      >
        {busy
          ? "Generando momentos…"
          : isIdle
            ? "Generar momentos"
            : "Regenerar momentos"}
      </button>
    </div>
  );
}
