import { spawn } from "node:child_process";
import path from "node:path";
import type { TranscriptionProvider, TranscriptionResult } from "./types.js";

const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";
// python/transcribe.py está en la raíz del app (apps/worker/python).
const PY_SCRIPT = path.join(__dirname, "..", "..", "..", "python", "transcribe.py");

/** Whisper self-hosted (faster-whisper vía subproceso Python, CPU/GPU). */
export class FasterWhisperProvider implements TranscriptionProvider {
  readonly name = "faster-whisper";
  constructor(private readonly model: string) {}

  get modelLabel(): string {
    return `faster-whisper:${this.model}`;
  }

  transcribe(audioPath: string): Promise<TranscriptionResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn(PYTHON_BIN, [PY_SCRIPT, audioPath, this.model]);
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error("faster-whisper timeout"));
      }, 600_000);
      proc.stdout.on("data", (d) => (stdout += d));
      proc.stderr.on("data", (d) => (stderr += d));
      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`faster-whisper exit ${code}: ${stderr}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout) as TranscriptionResult & {
            error?: string;
          };
          if (parsed.error) reject(new Error(parsed.error));
          else resolve(parsed);
        } catch {
          reject(new Error("No se pudo parsear la salida de faster-whisper"));
        }
      });
    });
  }
}
