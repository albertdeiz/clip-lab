export interface Word {
  w: string;
  start: number;
  end: number;
}

export interface Chunk {
  index: number;
  start: number;
  end: number;
  text: string;
}

/**
 * Segmenta el transcript en ventanas de tiempo solapadas (determinístico, sin
 * IA). Ventanas de ~chunkSeconds con overlapSeconds de solape para no perder
 * momentos que cruzan el límite. Justificación en docs/COST.md.
 */
export function buildChunks(
  words: Word[],
  chunkSeconds: number,
  overlapSeconds: number,
): Chunk[] {
  if (words.length === 0) return [];
  const total = words[words.length - 1]!.end;
  const chunks: Chunk[] = [];
  let winStart = 0;
  let index = 0;

  while (winStart < total) {
    const winEnd = winStart + chunkSeconds;
    const inWin = words.filter((w) => w.end > winStart && w.start < winEnd);
    if (inWin.length > 0) {
      chunks.push({
        index,
        start: Math.max(winStart, inWin[0]!.start),
        end: Math.min(winEnd, inWin[inWin.length - 1]!.end),
        text: inWin
          .map((w) => w.w)
          .join("")
          .trim(),
      });
      index++;
    }
    if (winEnd >= total) break;
    winStart = Math.max(winEnd - overlapSeconds, winStart + 1);
  }
  return chunks;
}

export interface Candidate {
  start: number;
  end: number;
  score: number;
  hook: string;
  reason: string;
}

function overlapRatio(a: Candidate, b: Candidate): number {
  const inter = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const minDur = Math.max(1, Math.min(a.end - a.start, b.end - b.start));
  return inter / minDur;
}

/**
 * Ordena por score y elimina solapados (>50%), quedándose con el de mayor
 * score. Determinístico, sin IA. Devuelve hasta `limit` candidatos.
 */
export function aggregate(candidates: Candidate[], limit: number): Candidate[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const kept: Candidate[] = [];
  for (const c of sorted) {
    if (c.end <= c.start) continue;
    if (kept.some((k) => overlapRatio(k, c) > 0.5)) continue;
    kept.push(c);
    if (kept.length >= limit) break;
  }
  return kept;
}

/** Ejecuta `fn` sobre items con concurrencia limitada. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}
