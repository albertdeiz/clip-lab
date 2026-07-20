export type ReframeMode = "crop" | "blur" | "fit";

/**
 * Construye el filtro -vf de FFmpeg para reencuadrar a WxH (9:16).
 * - crop: escala para cubrir y recorta centrado (full-bleed vertical).
 * - fit:  escala para caber y rellena con barras negras.
 * - blur: video centrado sobre un fondo del mismo video desenfocado.
 * (El seguimiento de sujeto por visión queda como mejora futura.)
 */
export function reframeFilter(
  mode: ReframeMode,
  width: number,
  height: number,
): string {
  const cover = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  const contain = `scale=${width}:${height}:force_original_aspect_ratio=decrease`;
  switch (mode) {
    case "crop":
      return cover;
    case "fit":
      return `${contain},pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
    case "blur":
      return `split[a][b];[a]${cover},gblur=sigma=20[bg];[b]${contain}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;
  }
}

/**
 * Igual que `reframeFilter` pero como fragmento de `filter_complex`: toma un pad
 * de entrada etiquetado y produce uno de salida. Se usa para encadenar el
 * reencuadre después de un `concat` (clips multi-segmento).
 */
export function reframeGraph(
  mode: ReframeMode,
  width: number,
  height: number,
  inLabel: string,
  outLabel: string,
): string {
  const cover = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  const contain = `scale=${width}:${height}:force_original_aspect_ratio=decrease`;
  const i = `[${inLabel}]`;
  const o = `[${outLabel}]`;
  switch (mode) {
    case "crop":
      return `${i}${cover}${o}`;
    case "fit":
      return `${i}${contain},pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2${o}`;
    case "blur":
      return `${i}split[rfa][rfb];[rfa]${cover},gblur=sigma=20[rfbg];[rfb]${contain}[rffg];[rfbg][rffg]overlay=(W-w)/2:(H-h)/2${o}`;
  }
}
