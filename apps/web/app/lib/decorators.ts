import type { TranscriptWord } from "@clip-lab/contracts";
import { colorOf, wordInClip, type EditClip } from "./editor";

/**
 * Modelo de decorators (inspirado en Draft.js, pero nativo y para texto fijo):
 * cada decorator aporta clases a una palabra del transcript según el estado del
 * editor. Es el mecanismo extensible para pintar capas sobre el texto —hoy los
 * clips y el cabezal de reproducción; mañana karaoke de captions, hablantes,
 * muletillas— sin tocar el renderer.
 *
 * - `background`: capa de fondo excluyente. Gana el PRIMER decorator (por orden)
 *   que devuelva clases; evita conflictos de `bg-*` de Tailwind.
 * - `accent`: capa aditiva. Se concatenan todas (rings, subrayados, etc.).
 */
export type DecoratorKind = "background" | "accent";

export interface DecoratorCtx {
  clips: EditClip[];
  activeId: string | null;
  currentTime: number;
}

export interface WordDecorator {
  id: string;
  kind: DecoratorKind;
  /** Clases para esta palabra, o "" si no aplica. */
  classesFor(word: TranscriptWord, index: number, ctx: DecoratorCtx): string;
}

/** Palabra en reproducción (cabezal). Máxima prioridad de fondo. */
export const playheadDecorator: WordDecorator = {
  id: "playhead",
  kind: "background",
  classesFor(word, _i, { currentTime }) {
    return currentTime >= word.start && currentTime < word.end
      ? "bg-neutral-100 text-neutral-900"
      : "";
  },
};

/** Colorea las palabras que caen dentro de un clip; el activo, más intenso. */
export const clipSpansDecorator: WordDecorator = {
  id: "clip-spans",
  kind: "background",
  classesFor(word, _i, { clips, activeId }) {
    const activeIdx = clips.findIndex((c) => c._id === activeId);
    if (activeIdx >= 0 && wordInClip(word, clips[activeIdx]!)) {
      return colorOf(activeIdx).spanActive;
    }
    const idx = clips.findIndex((c) => wordInClip(word, c));
    return idx >= 0 ? colorOf(idx).span : "";
  },
};

/** Orden = prioridad para la capa de fondo (el cabezal gana al clip). */
export const DEFAULT_DECORATORS: WordDecorator[] = [
  playheadDecorator,
  clipSpansDecorator,
];

const BASE_WORD = "text-neutral-300 hover:bg-neutral-800";

/**
 * Resuelve las clases finales de una palabra: base + primer fondo que aplique
 * (o base) + todos los acentos. Determinístico, sin conflictos de Tailwind.
 */
export function decorateWord(
  word: TranscriptWord,
  index: number,
  ctx: DecoratorCtx,
  decorators: WordDecorator[] = DEFAULT_DECORATORS,
): string {
  let background = "";
  const accents: string[] = [];
  for (const d of decorators) {
    const cls = d.classesFor(word, index, ctx);
    if (!cls) continue;
    if (d.kind === "background") {
      if (!background) background = cls;
    } else {
      accents.push(cls);
    }
  }
  return ["rounded px-0.5 transition", background || BASE_WORD, ...accents].join(
    " ",
  );
}
