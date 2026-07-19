export interface TranscriptWord {
  w: string;
  start: number;
  end: number;
}

export interface TranscriptionResult {
  language: string | null;
  text: string;
  words: TranscriptWord[];
}

/**
 * Proveedor de transcripción agnóstico. Recibe la ruta de un archivo de audio
 * (WAV 16kHz mono) y devuelve texto + timestamps word-level.
 */
export interface TranscriptionProvider {
  readonly name: string;
  /** Etiqueta de modelo para persistir en Transcript.model. */
  readonly modelLabel: string;
  transcribe(audioPath: string): Promise<TranscriptionResult>;
}
