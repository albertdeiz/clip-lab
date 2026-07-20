import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  VideoListResponse,
  Video as VideoDto,
  PlaybackUrlResponse,
  TranscriptResponse,
  TranscriptWord,
  HighlightsResponse,
  Highlight,
  UpdateHighlightsInput,
  ClipListResponse,
  SnapWord,
  Segment,
} from "@clip-lab/contracts";
import { EventType, buildSentences, snapRange } from "@clip-lab/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";
import { toVideoDto } from "./video.mapper.js";

@Injectable()
export class VideoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<VideoListResponse> {
    const take = Math.min(Math.max(limit, 1), 50);
    const rows = await this.prisma.video.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return {
      items: items.map(toVideoDto),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  private async loadOwned(userId: string, id: string) {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video || video.userId !== userId) {
      throw new NotFoundException({
        code: "VIDEO_NOT_FOUND",
        message: "Video no encontrado",
      });
    }
    return video;
  }

  async get(userId: string, id: string): Promise<VideoDto> {
    return toVideoDto(await this.loadOwned(userId, id));
  }

  async playbackUrl(
    userId: string,
    id: string,
  ): Promise<PlaybackUrlResponse> {
    const video = await this.loadOwned(userId, id);
    if (video.status !== "READY") {
      throw new NotFoundException({
        code: "VIDEO_NOT_READY",
        message: "El video aún no está listo",
      });
    }
    const url = await this.storage.presignGetObject(video.storageKey);
    return { url, expiresInSec: this.storage.presignTtlSec };
  }

  async transcript(userId: string, id: string): Promise<TranscriptResponse> {
    await this.loadOwned(userId, id); // authz
    const t = await this.prisma.transcript.findUnique({
      where: { videoId: id },
    });
    if (!t) {
      // Aún no encolado/creado por el worker.
      return {
        status: "QUEUED",
        language: null,
        model: null,
        text: null,
        words: [],
        failReason: null,
      };
    }
    return {
      status: t.status,
      language: t.language,
      model: t.model,
      text: t.text,
      words: Array.isArray(t.words) ? (t.words as TranscriptWord[]) : [],
      failReason: t.failReason,
    };
  }

  async highlights(userId: string, id: string): Promise<HighlightsResponse> {
    await this.loadOwned(userId, id); // authz
    const set = await this.prisma.highlightSet.findUnique({
      where: { videoId: id },
    });
    if (!set) {
      return {
        status: "QUEUED",
        model: null,
        costUsd: null,
        items: [],
        failReason: null,
      };
    }
    return {
      status: set.status,
      model: set.model,
      costUsd: set.costUsd === null ? null : Number(set.costUsd),
      items: Array.isArray(set.items) ? (set.items as Highlight[]) : [],
      failReason: set.failReason,
    };
  }

  /**
   * Ajusta los highlights actuales a límites de frase (cortes limpios), usando
   * el transcript. Determinístico, sin IA. Dedup de rangos duplicados.
   */
  async snapHighlights(userId: string, id: string): Promise<HighlightsResponse> {
    await this.loadOwned(userId, id);
    const set = await this.prisma.highlightSet.findUnique({
      where: { videoId: id },
    });
    if (!set || !Array.isArray(set.items) || set.items.length === 0) {
      throw new BadRequestException({
        code: "NO_HIGHLIGHTS",
        message: "No hay highlights que ajustar",
      });
    }
    const transcript = await this.prisma.transcript.findUnique({
      where: { videoId: id },
    });
    const words = (
      transcript && Array.isArray(transcript.words) ? transcript.words : []
    ) as unknown as SnapWord[];
    if (words.length === 0) {
      throw new BadRequestException({
        code: "TRANSCRIPT_NOT_READY",
        message: "La transcripción no está lista",
      });
    }
    const sentences = buildSentences(words);
    const seen = new Set<string>();
    const items = (set.items as Highlight[])
      .map((h) => {
        const raw =
          h.segments && h.segments.length > 0
            ? h.segments
            : [{ start: h.start, end: h.end }];
        const segs = raw
          .map((s) => snapRange(s.start, s.end, sentences))
          .filter((s) => s.end > s.start);
        if (segs.length === 0) return { ...h };
        const start = Math.min(...segs.map((s) => s.start));
        const end = Math.max(...segs.map((s) => s.end));
        return {
          ...h,
          start,
          end,
          segments: segs.length > 1 ? segs : undefined,
        };
      })
      .filter((h) => {
        const key = `${Math.round(h.start)}-${Math.round(h.end)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.score - a.score);

    const updated = await this.prisma.highlightSet.update({
      where: { videoId: id },
      data: { items: items as unknown as object },
    });
    return {
      status: updated.status,
      model: updated.model,
      costUsd: updated.costUsd === null ? null : Number(updated.costUsd),
      items: Array.isArray(updated.items)
        ? (updated.items as Highlight[])
        : [],
      failReason: updated.failReason,
    };
  }

  /** Edición manual: reemplaza la lista de highlights (marca DONE). */
  async updateHighlights(
    userId: string,
    id: string,
    input: UpdateHighlightsInput,
  ): Promise<HighlightsResponse> {
    await this.loadOwned(userId, id);
    const items = input.items
      .map((h) => {
        const segs = (h.segments ?? []).filter((s) => s.end > s.start);
        if (segs.length === 0) return { ...h, segments: undefined };
        const start = Math.min(...segs.map((s) => s.start));
        const end = Math.max(...segs.map((s) => s.end));
        return { ...h, start, end, segments: segs.length > 1 ? segs : undefined };
      })
      .filter((h) => h.end > h.start)
      .sort((a, b) => b.score - a.score);
    const set = await this.prisma.highlightSet.upsert({
      where: { videoId: id },
      create: {
        videoId: id,
        status: "DONE",
        model: "manual",
        items: items as unknown as object,
      },
      update: { status: "DONE", failReason: null, items: items as unknown as object },
    });
    return {
      status: set.status,
      model: set.model,
      costUsd: set.costUsd === null ? null : Number(set.costUsd),
      items: Array.isArray(set.items) ? (set.items as Highlight[]) : [],
      failReason: set.failReason,
    };
  }

  /**
   * Reintenta la detección de highlights: resetea el estado y reencola vía
   * outbox (re-publica TranscriptGenerated). Útil tras arreglar la config
   * (p. ej. añadir ANTHROPIC_API_KEY) o ante un fallo transitorio ya agotado.
   */
  async retryHighlights(userId: string, id: string): Promise<void> {
    await this.loadOwned(userId, id);
    const transcript = await this.prisma.transcript.findUnique({
      where: { videoId: id },
    });
    if (!transcript || transcript.status !== "DONE") {
      throw new BadRequestException({
        code: "TRANSCRIPT_NOT_READY",
        message: "La transcripción aún no está lista",
      });
    }
    const words = Array.isArray(transcript.words) ? transcript.words : [];
    await this.prisma.$transaction(async (tx) => {
      await tx.highlightSet.upsert({
        where: { videoId: id },
        create: { videoId: id, status: "QUEUED" },
        update: { status: "QUEUED", failReason: null },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: "Video",
          aggregateId: id,
          type: EventType.TranscriptGenerated,
          payload: {
            eventId: randomUUID(),
            type: EventType.TranscriptGenerated,
            videoId: id,
            userId,
            language: transcript.language,
            model: transcript.model ?? "unknown",
            wordCount: words.length,
            occurredAt: new Date().toISOString(),
          },
        },
      });
    });
  }

  /**
   * Reintenta la transcripción: resetea y re-publica VideoUploaded vía outbox.
   * (Re-transcribir vuelve a disparar highlights en cascada.)
   */
  async retryTranscript(userId: string, id: string): Promise<void> {
    const video = await this.loadOwned(userId, id);
    if (video.status !== "READY") {
      throw new BadRequestException({
        code: "VIDEO_NOT_READY",
        message: "El video no está listo para transcribir",
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.transcript.upsert({
        where: { videoId: id },
        create: { videoId: id, status: "QUEUED" },
        update: { status: "QUEUED", failReason: null },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: "Video",
          aggregateId: id,
          type: EventType.VideoUploaded,
          payload: {
            eventId: randomUUID(),
            type: EventType.VideoUploaded,
            videoId: id,
            userId,
            storageKey: video.storageKey,
            sizeBytes: Number(video.sizeBytes ?? 0),
            durationSec: video.durationSec,
            container: video.container,
            codec: video.codec,
            occurredAt: new Date().toISOString(),
          },
        },
      });
    });
  }

  async clips(userId: string, id: string): Promise<ClipListResponse> {
    await this.loadOwned(userId, id);
    const clips = await this.prisma.clip.findMany({
      where: { videoId: id },
      orderBy: { index: "asc" },
    });
    return {
      items: clips.map((c) => ({
        id: c.id,
        index: c.index,
        title: c.title,
        startSec: c.startSec,
        endSec: c.endSec,
        aspectRatio: c.aspectRatio,
        status: c.status,
        width: c.width,
        height: c.height,
        durationSec: c.durationSec,
        sizeBytes: c.sizeBytes === null ? null : Number(c.sizeBytes),
        failReason: c.failReason,
        segments: Array.isArray(c.segments) ? (c.segments as Segment[]) : null,
      })),
    };
  }

  private async loadOwnedClip(userId: string, videoId: string, clipId: string) {
    await this.loadOwned(userId, videoId);
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip || clip.videoId !== videoId) {
      throw new NotFoundException({
        code: "CLIP_NOT_FOUND",
        message: "Clip no encontrado",
      });
    }
    return clip;
  }

  async clipPlaybackUrl(
    userId: string,
    videoId: string,
    clipId: string,
  ): Promise<PlaybackUrlResponse> {
    const clip = await this.loadOwnedClip(userId, videoId, clipId);
    if (clip.status !== "READY" || !clip.storageKey) {
      throw new NotFoundException({
        code: "CLIP_NOT_READY",
        message: "El clip aún no está listo",
      });
    }
    const url = await this.storage.presignGetObject(clip.storageKey);
    return { url, expiresInSec: this.storage.presignTtlSec };
  }

  async removeClip(
    userId: string,
    videoId: string,
    clipId: string,
  ): Promise<void> {
    const clip = await this.loadOwnedClip(userId, videoId, clipId);
    if (clip.storageKey) {
      await this.storage.deleteObject(clip.storageKey).catch(() => undefined);
    }
    await this.prisma.clip.delete({ where: { id: clipId } });
  }

  /** (Re)genera los clips: re-publica HighlightsDetected vía outbox. */
  async retryClips(userId: string, id: string): Promise<void> {
    await this.loadOwned(userId, id);
    const set = await this.prisma.highlightSet.findUnique({
      where: { videoId: id },
    });
    if (!set || set.status !== "DONE") {
      throw new BadRequestException({
        code: "HIGHLIGHTS_NOT_READY",
        message: "Los highlights aún no están listos",
      });
    }
    const count = Array.isArray(set.items) ? set.items.length : 0;
    await this.prisma.outboxEvent.create({
      data: {
        aggregateType: "Video",
        aggregateId: id,
        type: EventType.HighlightsDetected,
        payload: {
          eventId: randomUUID(),
          type: EventType.HighlightsDetected,
          videoId: id,
          userId,
          count,
          costUsd: set.costUsd === null ? 0 : Number(set.costUsd),
          occurredAt: new Date().toISOString(),
        },
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const video = await this.loadOwned(userId, id);
    await this.storage.deleteObject(video.storageKey).catch(() => undefined);
    await this.prisma.$transaction(async (tx) => {
      if (video.status === "READY" && video.sizeBytes) {
        await tx.user.update({
          where: { id: userId },
          data: { storageUsed: { decrement: video.sizeBytes } },
        });
      }
      await tx.video.delete({ where: { id } });
    });
  }
}
