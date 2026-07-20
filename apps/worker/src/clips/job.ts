import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { prisma } from "@clip-lab/db";
import {
  EventType,
  ROUTING,
  type HighlightsDetectedPayload,
  type ClipGeneratedPayload,
} from "@clip-lab/contracts";
import { loadEnv } from "@clip-lab/config";
import type { PublishFn } from "../transcriber.js";
import { NonRetryableError } from "../errors.js";
import { downloadToFile, uploadFile, deleteObject } from "../storage.js";
import { reframeFilter, reframeGraph } from "./reframe.js";

const env = loadEnv();

interface Segment {
  start: number;
  end: number;
}

interface HighlightItem {
  start: number;
  end: number;
  score: number;
  title: string;
  reason: string;
  segments?: Segment[];
}

/** Tramos efectivos de un highlight: los suyos si existen, o [start,end]. */
function segmentsOf(h: HighlightItem): Segment[] {
  const segs = (h.segments ?? []).filter((s) => s.end > s.start);
  return segs.length > 0 ? segs : [{ start: h.start, end: h.end }];
}

const CODEC_ARGS = [
  "-r", "30",
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-movflags", "+faststart",
];

/**
 * Construye los argumentos de FFmpeg para producir un clip 9:16:
 *  - 1 tramo → corte directo con `-ss/-t` + `-vf` (rápido, seek en la fuente).
 *  - N tramos → `filter_complex`: recorta cada tramo, los concatena en orden y
 *    aplica el reencuadre al resultado (clip "resumen" cosido en una pasada).
 */
function buildCutArgs(
  source: string,
  segments: Segment[],
  vfFilter: string,
  out: string,
): string[] {
  if (segments.length === 1) {
    const s = segments[0]!;
    return [
      "-y",
      "-ss", String(s.start),
      "-i", source,
      "-t", String(Math.max(0.5, s.end - s.start)),
      "-vf", vfFilter,
      ...CODEC_ARGS,
      out,
    ];
  }
  const parts: string[] = [];
  segments.forEach((s, i) => {
    parts.push(
      `[0:v]trim=start=${s.start}:end=${s.end},setpts=PTS-STARTPTS[v${i}]`,
    );
    parts.push(
      `[0:a]atrim=start=${s.start}:end=${s.end},asetpts=PTS-STARTPTS[a${i}]`,
    );
  });
  const concatIn = segments.map((_, i) => `[v${i}][a${i}]`).join("");
  parts.push(`${concatIn}concat=n=${segments.length}:v=1:a=1[vcat][acat]`);
  parts.push(
    reframeGraph(env.CLIP_REFRAME, env.CLIP_WIDTH, env.CLIP_HEIGHT, "vcat", "vout"),
  );
  return [
    "-y",
    "-i", source,
    "-filter_complex", parts.join(";"),
    "-map", "[vout]",
    "-map", "[acat]",
    ...CODEC_ARGS,
    out,
  ];
}

function ffmpeg(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegInstaller.path, args);
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ffmpeg timeout"));
    }, timeoutMs);
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
      else resolve();
    });
  });
}

/**
 * Genera los clips 9:16 de un video a partir de sus highlights. Idempotente:
 * regenera desde cero (borra clips previos + sus objetos S3). Un fallo de un
 * clip lo marca FAILED y continúa con los demás.
 */
export async function generateClips(
  payload: HighlightsDetectedPayload,
  publish: PublishFn,
): Promise<void> {
  const { videoId, userId } = payload;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { highlightSet: true },
  });
  if (!video) throw new NonRetryableError("Video no encontrado");
  const set = video.highlightSet;
  if (!set || set.status !== "DONE" || !Array.isArray(set.items)) {
    throw new NonRetryableError("No hay highlights DONE para generar clips");
  }
  const items = set.items as unknown as HighlightItem[];
  if (items.length === 0) return;

  // Regenerar desde cero: borra clips previos (objetos S3 + filas).
  const previous = await prisma.clip.findMany({ where: { videoId } });
  for (const c of previous) {
    if (c.storageKey) await deleteObject(c.storageKey).catch(() => undefined);
  }
  await prisma.clip.deleteMany({ where: { videoId } });

  const dir = await mkdtemp(path.join(tmpdir(), "clip-cut-"));
  const source = path.join(dir, "source");
  try {
    await downloadToFile(video.storageKey, source);
    const vfFilter = reframeFilter(
      env.CLIP_REFRAME,
      env.CLIP_WIDTH,
      env.CLIP_HEIGHT,
    );

    for (let i = 0; i < items.length; i++) {
      const h = items[i]!;
      const segments = segmentsOf(h);
      const clipId = randomUUID();
      const key = `users/${userId}/clips/${clipId}.mp4`;
      const out = path.join(dir, `${clipId}.mp4`);
      const duration = segments.reduce((a, s) => a + (s.end - s.start), 0);
      const startSec = Math.min(...segments.map((s) => s.start));
      const endSec = Math.max(...segments.map((s) => s.end));

      const clip = await prisma.clip.create({
        data: {
          id: clipId,
          videoId,
          index: i,
          title: h.title,
          startSec,
          endSec,
          segments: segments as unknown as object,
          aspectRatio: "9:16",
          status: "RENDERING",
        },
      });

      try {
        await ffmpeg(buildCutArgs(source, segments, vfFilter, out), 300_000);
        await uploadFile(key, out, "video/mp4");
        const { size } = await stat(out);
        await prisma.clip.update({
          where: { id: clip.id },
          data: {
            status: "READY",
            storageKey: key,
            sizeBytes: BigInt(size),
            width: env.CLIP_WIDTH,
            height: env.CLIP_HEIGHT,
            durationSec: duration,
          },
        });
        const event: ClipGeneratedPayload = {
          eventId: randomUUID(),
          type: EventType.ClipGenerated,
          videoId,
          userId,
          clipId: clip.id,
          index: i,
          occurredAt: new Date().toISOString(),
        };
        await publish(ROUTING.ClipGenerated, event);
      } catch (err) {
        await prisma.clip.update({
          where: { id: clip.id },
          data: { status: "FAILED", failReason: "No se pudo renderizar el clip" },
        });
        // continúa con los demás clips
        void err;
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
