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
