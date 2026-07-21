/**
 * Utilidades del pipeline de highlights. El troceo por tiempo fijo se retiró en
 * favor del análisis de una sola pasada (ver detector.ts); aquí quedan el tipo
 * de palabra y un helper de concurrencia usado por el fallback de secciones.
 */

export interface Word {
  w: string;
  start: number;
  end: number;
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
