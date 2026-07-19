import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type {
  CreateUploadInput,
  CreateUploadResponse,
  CompleteUploadInput,
  Video as VideoDto,
} from "@clip-lab/contracts";
import { EventType } from "@clip-lab/contracts";
import type { Env } from "@clip-lab/config";
import { ENV } from "../config/config.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";
import { toVideoDto } from "../video/video.mapper.js";

const DEFAULT_PART_SIZE = 16 * 1024 * 1024; // 16 MB
const MAX_PARTS = 10_000;
const MIN_PART_SIZE = 5 * 1024 * 1024; // límite S3 para partes no finales

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private computePartSize(sizeBytes: number): number {
    let part = DEFAULT_PART_SIZE;
    if (Math.ceil(sizeBytes / part) > MAX_PARTS) {
      part = Math.ceil(sizeBytes / MAX_PARTS);
    }
    return Math.max(part, MIN_PART_SIZE);
  }

  async createUpload(
    userId: string,
    input: CreateUploadInput,
  ): Promise<CreateUploadResponse> {
    if (input.sizeBytes > this.env.MAX_UPLOAD_SIZE) {
      throw new UnprocessableEntityException({
        code: "FILE_TOO_LARGE",
        message: `El archivo supera el máximo de ${this.env.MAX_UPLOAD_SIZE} bytes`,
      });
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.storageUsed + BigInt(input.sizeBytes) > BigInt(this.env.MAX_STORAGE_PER_USER)) {
      throw new HttpException(
        {
          code: "STORAGE_QUOTA_EXCEEDED",
          message: "Has superado tu cuota de almacenamiento",
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const videoId = randomUUID();
    const ext = path.extname(input.filename).slice(0, 10) || ".mp4";
    const key = `users/${userId}/videos/${videoId}${ext}`;
    const s3UploadId = await this.storage.createMultipartUpload(
      key,
      input.contentType,
    );
    const partSizeBytes = this.computePartSize(input.sizeBytes);

    await this.prisma.video.create({
      data: {
        id: videoId,
        userId,
        title: input.filename,
        status: "UPLOADING",
        storageKey: key,
        sizeBytes: BigInt(input.sizeBytes),
        upload: { create: { s3UploadId, partSizeBytes } },
      },
    });

    return { videoId, uploadId: s3UploadId, partSizeBytes };
  }

  private async loadOwned(userId: string, videoId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: { upload: true },
    });
    if (!video || video.userId !== userId || !video.upload) {
      // 404 en no-propietario para no filtrar existencia
      throw new NotFoundException({
        code: "VIDEO_NOT_FOUND",
        message: "Video no encontrado",
      });
    }
    return video;
  }

  async signPart(
    userId: string,
    videoId: string,
    partNumber: number,
  ): Promise<{ url: string; expiresInSec: number }> {
    const video = await this.loadOwned(userId, videoId);
    if (video.status !== "UPLOADING") {
      throw new ForbiddenException({
        code: "UPLOAD_NOT_ACTIVE",
        message: "La subida ya no está activa",
      });
    }
    const url = await this.storage.presignUploadPart(
      video.storageKey,
      video.upload!.s3UploadId,
      partNumber,
    );
    return { url, expiresInSec: this.storage.presignTtlSec };
  }

  async complete(
    userId: string,
    videoId: string,
    input: CompleteUploadInput,
  ): Promise<VideoDto> {
    const video = await this.loadOwned(userId, videoId);
    if (video.status === "READY") return toVideoDto(video); // idempotente
    if (video.status !== "UPLOADING") {
      throw new UnprocessableEntityException({
        code: "UPLOAD_NOT_ACTIVE",
        message: "La subida no puede completarse en su estado actual",
      });
    }

    await this.storage.completeMultipartUpload(
      video.storageKey,
      video.upload!.s3UploadId,
      input.parts,
    );

    // Extrae metadata; si falla, marca FAILED y limpia el objeto.
    let metadata;
    try {
      const url = await this.storage.presignGetObject(video.storageKey);
      metadata = await this.storage.probe(url);
    } catch (err) {
      this.logger.warn(`ffprobe falló para ${videoId}: ${String(err)}`);
      await this.prisma.video.update({
        where: { id: videoId },
        data: { status: "FAILED", failReason: "Archivo de video inválido" },
      });
      await this.storage.deleteObject(video.storageKey).catch(() => undefined);
      throw new UnprocessableEntityException({
        code: "INVALID_VIDEO",
        message: "El archivo no es un video válido",
      });
    }

    const occurredAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const v = await tx.video.update({
        where: { id: videoId },
        data: {
          status: "READY",
          durationSec: metadata.durationSec,
          width: metadata.width,
          height: metadata.height,
          fps: metadata.fps,
          codec: metadata.codec,
          container: metadata.container,
          bitrate: metadata.bitrate,
          upload: { update: { completedAt: occurredAt } },
        },
        include: { upload: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: { storageUsed: { increment: video.sizeBytes ?? BigInt(0) } },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: "Video",
          aggregateId: videoId,
          type: EventType.VideoUploaded,
          payload: {
            eventId: randomUUID(),
            type: EventType.VideoUploaded,
            videoId,
            userId,
            storageKey: video.storageKey,
            sizeBytes: Number(video.sizeBytes ?? 0),
            durationSec: metadata.durationSec,
            container: metadata.container,
            codec: metadata.codec,
            occurredAt: occurredAt.toISOString(),
          },
        },
      });
      return v;
    });

    return toVideoDto(updated);
  }

  async abort(userId: string, videoId: string): Promise<void> {
    const video = await this.loadOwned(userId, videoId);
    await this.storage
      .abortMultipartUpload(video.storageKey, video.upload!.s3UploadId)
      .catch(() => undefined);
    await this.prisma.video.delete({ where: { id: videoId } });
  }
}
