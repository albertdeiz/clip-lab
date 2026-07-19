import type { Video } from "@clip-lab/db";
import type { Video as VideoDto } from "@clip-lab/contracts";

export function toVideoDto(v: Video): VideoDto {
  return {
    id: v.id,
    title: v.title,
    status: v.status,
    durationSec: v.durationSec,
    width: v.width,
    height: v.height,
    fps: v.fps,
    codec: v.codec,
    container: v.container,
    sizeBytes: v.sizeBytes === null ? null : Number(v.sizeBytes),
    failReason: v.failReason,
    createdAt: v.createdAt.toISOString(),
  };
}
