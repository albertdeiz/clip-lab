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
import { reframeFilter } from "./reframe.js";

const env = loadEnv();

interface HighlightItem {
  start: number;
  end: number;
  score: number;
  title: string;
  reason: string;
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
    const filter = reframeFilter(
      env.CLIP_REFRAME,
      env.CLIP_WIDTH,
      env.CLIP_HEIGHT,
    );

    for (let i = 0; i < items.length; i++) {
      const h = items[i]!;
      const clipId = randomUUID();
      const key = `users/${userId}/clips/${clipId}.mp4`;
      const out = path.join(dir, `${clipId}.mp4`);
      const duration = Math.max(0.5, h.end - h.start);

      const clip = await prisma.clip.create({
        data: {
          id: clipId,
          videoId,
          index: i,
          title: h.title,
          startSec: h.start,
          endSec: h.end,
          aspectRatio: "9:16",
          status: "RENDERING",
        },
      });

      try {
        await ffmpeg(
          [
            "-y",
            "-ss", String(h.start),
            "-i", source,
            "-t", String(duration),
            "-vf", filter,
            "-r", "30",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-movflags", "+faststart",
            out,
          ],
          300_000,
        );
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
