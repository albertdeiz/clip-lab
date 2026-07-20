/**
 * Segmentación en frases y ajuste (snap) de rangos a límites de frase.
 * Determinístico (sin IA): usa puntuación + pausas de los timestamps word-level.
 * Compartido por el worker (generación) y la API (limpieza de highlights).
 */

export interface SnapWord {
  w: string;
  start: number;
  end: number;
}

export interface Sentence {
  start: number;
  end: number;
  text: string;
}

const TERMINAL = /[.!?…]$/;

/**
 * Agrupa palabras en frases: corta al encontrar puntuación terminal o una
 * pausa mayor que `pauseSec` entre palabras consecutivas.
 */
export function buildSentences(
  words: SnapWord[],
  pauseSec = 0.8,
): Sentence[] {
  const sentences: Sentence[] = [];
  let cur: SnapWord[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    sentences.push({
      start: cur[0]!.start,
      end: cur[cur.length - 1]!.end,
      text: cur.map((w) => w.w).join("").trim(),
    });
    cur = [];
  };
  for (const w of words) {
    if (cur.length > 0 && w.start - cur[cur.length - 1]!.end > pauseSec) {
      flush();
    }
    cur.push(w);
    if (TERMINAL.test(w.w.trim())) flush();
  }
  flush();
  return sentences;
}

function nearest(
  sentences: Sentence[],
  t: number,
  edge: "start" | "end",
): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < sentences.length; i++) {
    const d = Math.abs(sentences[i]![edge] - t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Ajusta [start,end] a límites de frase y respeta duración [minSec,maxSec]
 * extendiendo/recortando por frases completas. Devuelve el rango limpio.
 */
export function snapRange(
  start: number,
  end: number,
  sentences: Sentence[],
  minSec = 15,
  maxSec = 90,
): { start: number; end: number } {
  if (sentences.length === 0) return { start, end };

  let si = sentences.findIndex((s) => s.start <= start && start < s.end);
  if (si < 0) si = nearest(sentences, start, "start");
  let ei = sentences.findIndex((s) => s.start < end && end <= s.end);
  if (ei < 0) ei = nearest(sentences, end, "end");
  if (ei < si) ei = si;

  const dur = () => sentences[ei]!.end - sentences[si]!.start;
  // extender hasta el mínimo (primero hacia adelante, luego hacia atrás)
  while (dur() < minSec) {
    if (ei < sentences.length - 1) ei++;
    else if (si > 0) si--;
    else break;
  }
  // recortar hasta el máximo (por frases completas, sin bajar de una)
  while (ei > si && dur() > maxSec) ei--;

  return { start: sentences[si]!.start, end: sentences[ei]!.end };
}
