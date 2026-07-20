import type { Highlight, TranscriptWord } from "@clip-lab/contracts";
import { buildSentences, snapRange, type Sentence } from "@clip-lab/contracts";

/**
 * Modelo de edición en el cliente: un clip es un highlight con un id local
 * estable (para keys de React y para marcar el clip activo). En el Slice 1 cada
 * clip es un único rango [start,end]; el multi-segmento llega en el Slice 2.
 */
export interface EditClip {
  _id: string;
  start: number;
  end: number;
  score: number;
  title: string;
  reason: string;
}

let counter = 0;
function localId(): string {
  counter += 1;
  return `c${counter}`;
}

export function toEditClips(items: Highlight[]): EditClip[] {
  return items.map((h) => ({ _id: localId(), ...h }));
}

/** Quita el id local antes de persistir vía PATCH. */
export function toHighlights(clips: EditClip[]): Highlight[] {
  return clips.map(({ _id, ...h }) => {
    void _id;
    return h;
  });
}

export function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function dur(c: { start: number; end: number }): number {
  return Math.max(0, c.end - c.start);
}

/**
 * Paleta de colores por clip. Clases literales completas para que Tailwind las
 * incluya en el build (no se construyen dinámicamente).
 */
export interface ClipColor {
  dot: string;
  text: string;
  border: string;
  span: string;
  spanActive: string;
  grip: string;
}

export const PALETTE: ClipColor[] = [
  {
    dot: "bg-violet-400",
    text: "text-violet-300",
    border: "border-violet-500/60",
    span: "bg-violet-500/20 text-violet-100",
    spanActive: "bg-violet-500/40 text-white ring-1 ring-violet-400/60",
    grip: "bg-violet-400",
  },
  {
    dot: "bg-sky-400",
    text: "text-sky-300",
    border: "border-sky-500/60",
    span: "bg-sky-500/20 text-sky-100",
    spanActive: "bg-sky-500/40 text-white ring-1 ring-sky-400/60",
    grip: "bg-sky-400",
  },
  {
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    border: "border-emerald-500/60",
    span: "bg-emerald-500/20 text-emerald-100",
    spanActive: "bg-emerald-500/40 text-white ring-1 ring-emerald-400/60",
    grip: "bg-emerald-400",
  },
  {
    dot: "bg-amber-400",
    text: "text-amber-300",
    border: "border-amber-500/60",
    span: "bg-amber-500/20 text-amber-100",
    spanActive: "bg-amber-500/40 text-white ring-1 ring-amber-400/60",
    grip: "bg-amber-400",
  },
  {
    dot: "bg-pink-400",
    text: "text-pink-300",
    border: "border-pink-500/60",
    span: "bg-pink-500/20 text-pink-100",
    spanActive: "bg-pink-500/40 text-white ring-1 ring-pink-400/60",
    grip: "bg-pink-400",
  },
  {
    dot: "bg-teal-400",
    text: "text-teal-300",
    border: "border-teal-500/60",
    span: "bg-teal-500/20 text-teal-100",
    spanActive: "bg-teal-500/40 text-white ring-1 ring-teal-400/60",
    grip: "bg-teal-400",
  },
];

export function colorOf(index: number): ClipColor {
  return PALETTE[index % PALETTE.length]!;
}

export function sentencesOf(words: TranscriptWord[]): Sentence[] {
  return buildSentences(words as unknown as Parameters<typeof buildSentences>[0]);
}

/** Ajusta un rango a frases completas (cortes limpios), determinístico. */
export function snap(
  start: number,
  end: number,
  sentences: Sentence[],
): { start: number; end: number } {
  return snapRange(start, end, sentences);
}

/** ¿La palabra cae dentro del rango [start,end)? (solape temporal). */
export function wordInRange(
  word: TranscriptWord,
  range: { start: number; end: number },
): boolean {
  return word.start < range.end && word.end > range.start;
}
