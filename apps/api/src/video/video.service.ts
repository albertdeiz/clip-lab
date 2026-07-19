import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  VideoListResponse,
  Video as VideoDto,
  PlaybackUrlResponse,
} from "@clip-lab/contracts";
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
