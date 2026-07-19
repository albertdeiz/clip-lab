import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { prisma, type Prisma } from "@clip-lab/db";
import {
  EventType,
  ROUTING,
  type VideoUploadedPayload,
  type TranscriptGeneratedPayload,
} from "@clip-lab/contracts";
import { loadEnv } from "@clip-lab/config";

const env = loadEnv();
const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";
const PY_SCRIPT = path.join(__dirname, "..", "python", "transcribe.py");

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

interface WhisperResult {
  language: string | null;
  text: string;
  words: Array<{ w: string; start: number; end: number }>;
}

async function downloadToFile(key: string, dest: string): Promise<void> {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
  );
  await pipeline(res.Body as Readable, createWriteStream(dest));
}

function run(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`${cmd} timeout`));
    }, timeoutMs);
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${cmd} exit ${code}: ${stderr}`));
      else resolve({ stdout, stderr });
    });
  });
}

async function extractAudio(input: string, output: string): Promise<void> {
  await run(
    ffmpegInstaller.path,
    ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", output],
    120_000,
  );
}

async function runWhisper(wav: string): Promise<WhisperResult> {
  const { stdout } = await run(
    PYTHON_BIN,
    [PY_SCRIPT, wav, env.WHISPER_MODEL],
    600_000,
  );
  const parsed = JSON.parse(stdout) as WhisperResult & { error?: string };
  if (parsed.error) throw new Error(parsed.error);
  return parsed;
}

export type PublishFn = (
  routingKey: string,
  payload: unknown,
) => Promise<void> | void;

/**
 * Procesa un job de transcripción. Idempotente: si el transcript ya está DONE
 * para el video, no reprocesa.
 */
export async function transcribe(
  payload: VideoUploadedPayload,
  publish: PublishFn,
): Promise<void> {
  const { videoId, userId, storageKey } = payload;

  const existing = await prisma.transcript.findUnique({ where: { videoId } });
  if (existing?.status === "DONE") return; // idempotencia

  await prisma.transcript.upsert({
    where: { videoId },
    create: { videoId, status: "TRANSCRIBING", model: env.WHISPER_MODEL },
    update: { status: "TRANSCRIBING", failReason: null },
  });

  const dir = await mkdtemp(path.join(tmpdir(), "clip-tx-"));
  const videoPath = path.join(dir, "input");
  const wavPath = path.join(dir, "audio.wav");
  try {
    await downloadToFile(storageKey, videoPath);
    const contentHash = createHash("sha256")
      .update(await readFile(videoPath))
      .digest("hex");
    await extractAudio(videoPath, wavPath);
    const result = await runWhisper(wavPath);

    await prisma.transcript.update({
      where: { videoId },
      data: {
        status: "DONE",
        language: result.language,
        model: env.WHISPER_MODEL,
        text: result.text,
        words: result.words as unknown as Prisma.InputJsonValue,
        contentHash,
      },
    });

    const event: TranscriptGeneratedPayload = {
      eventId: randomUUID(),
      type: EventType.TranscriptGenerated,
      videoId,
      userId,
      language: result.language,
      model: env.WHISPER_MODEL,
      wordCount: result.words.length,
      occurredAt: new Date().toISOString(),
    };
    await publish(ROUTING.TranscriptGenerated, event);
  } catch (err) {
    await prisma.transcript.update({
      where: { videoId },
      data: {
        status: "FAILED",
        failReason: "No se pudo transcribir el audio",
      },
    });
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
