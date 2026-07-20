import type { Highlight, Segment, TranscriptWord } from "@clip-lab/contracts";
import { buildSentences, snapRange, type Sentence } from "@clip-lab/contracts";

/**
 * Modelo de edición en el cliente: un clip es una lista ORDENADA de tramos
 * (segments) del video, más metadatos. 1 tramo = corte simple; N tramos = clip
 * "resumen" cosido de varios momentos (línea de pensamiento). `start/end` como
 * campo se derivan de la envolvente (ver clipStart/clipEnd).
 */
export interface EditClip {
  _id: string;
  segments: Segment[]; // ≥1, en orden de reproducción
  score: number;
  title: string;
  reason: string;
  summary?: boolean; // clip resumen del video (recap cosido)
}

export const SUMMARY_TITLE = "Resumen del video";

let counter = 0;
function localId(): string {
  counter += 1;
  return `c${counter}`;
}

export function toEditClips(items: Highlight[]): EditClip[] {
  return items.map((h) => ({
    _id: localId(),
    segments:
      h.segments && h.segments.length > 0
        ? h.segments.map((s) => ({ start: s.start, end: s.end }))
        : [{ start: h.start, end: h.end }],
    score: h.score,
    title: h.title,
    reason: h.reason,
    ...(h.summary ? { summary: true } : {}),
  }));
}

/** Serializa a Highlight[] para PATCH: envolvente + segments (solo si N>1). */
export function toHighlights(clips: EditClip[]): Highlight[] {
  return clips.map((c) => ({
    start: clipStart(c),
    end: clipEnd(c),
    score: c.score,
    title: c.title,
    reason: c.reason,
    ...(c.segments.length > 1 ? { segments: c.segments } : {}),
    ...(c.summary ? { summary: true } : {}),
  }));
}

export function clipStart(c: EditClip): number {
  return Math.min(...c.segments.map((s) => s.start));
}

export function clipEnd(c: EditClip): number {
  return Math.max(...c.segments.map((s) => s.end));
}

/** Duración real del clip = suma de sus tramos. */
export function clipDur(c: EditClip): number {
  return c.segments.reduce((a, s) => a + Math.max(0, s.end - s.start), 0);
}

export function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function segDur(s: Segment): number {
  return Math.max(0, s.end - s.start);
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

/** ¿La palabra solapa el rango [start,end)? */
export function wordInRange(
  word: TranscriptWord,
  range: { start: number; end: number },
): boolean {
  return word.start < range.end && word.end > range.start;
}

/** ¿La palabra cae en ALGÚN tramo del clip? */
export function wordInClip(word: TranscriptWord, clip: EditClip): boolean {
  return clip.segments.some((s) => wordInRange(word, s));
}

/**
 * Ventana líder de un rango: desde el inicio de su primera frase, acumulando
 * frases completas hasta ~capSec (el "gancho" del momento). Alineada a frases.
 */
export function leadWindow(
  range: { start: number; end: number },
  sentences: Sentence[],
  capSec: number,
): Segment {
  const within = sentences.filter((s) => s.start < range.end && s.end > range.start);
  if (within.length === 0) {
    return { start: range.start, end: Math.min(range.end, range.start + capSec) };
  }
  const start = within[0]!.start;
  let end = within[0]!.end;
  for (const s of within) {
    if (s.end - start <= capSec) end = s.end;
    else break;
  }
  return { start, end };
}

export interface SummaryOptions {
  targetSec?: number; // duración total objetivo del resumen
  capSec?: number; // tope por tramo (ventana líder)
}

/**
 * Compone un resumen determinístico (sin IA): toma la ventana líder de cada
 * momento, prioriza por score sumando hasta ~targetSec y las ordena
 * cronológicamente para que el recap fluya en el tiempo del video.
 */
export function buildSummary(
  clips: EditClip[],
  sentences: Sentence[],
  opts: SummaryOptions = {},
): Segment[] {
  const targetSec = opts.targetSec ?? 45;
  const capSec = opts.capSec ?? 12;
  const ranked = clips
    .filter((c) => !c.summary)
    .sort((a, b) => b.score - a.score);
  const picked: Segment[] = [];
  let total = 0;
  for (const c of ranked) {
    const w = leadWindow({ start: clipStart(c), end: clipEnd(c) }, sentences, capSec);
    const d = w.end - w.start;
    if (d <= 0) continue;
    if (total + d > targetSec && picked.length > 0) continue;
    picked.push(w);
    total += d;
    if (total >= targetSec) break;
  }
  // Orden cronológico + fusión de ventanas adyacentes/solapadas (< 0.6s de hueco)
  // para que el recap no quede partido en tramos contiguos.
  const ordered = picked.sort((a, b) => a.start - b.start);
  const merged: Segment[] = [];
  for (const s of ordered) {
    const last = merged[merged.length - 1];
    if (last && s.start - last.end <= 0.6) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  return merged;
}
