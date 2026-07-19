import { spawn } from "node:child_process";
import { chmodSync } from "node:fs";
import { Inject, Injectable } from "@nestjs/common";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import type { Env } from "@clip-lab/config";
import { ENV } from "../config/config.module.js";

export interface ProbedMetadata {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string | null;
  container: string | null;
  bitrate: number | null;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

const PRESIGN_TTL_SEC = 900; // 15 min

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    // El binario empaquetado puede quedar sin bit de ejecución si pnpm omite
    // los build scripts; garantizamos que sea ejecutable (idempotente).
    try {
      chmodSync(ffprobeInstaller.path, 0o755);
    } catch {
      /* en Docker el ffmpeg del sistema o permisos ya correctos */
    }
    this.bucket = env.S3_BUCKET;
    this.s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true, // requerido por MinIO
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    });
  }

  async createMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<string> {
    const res = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!res.UploadId) throw new Error("S3 no devolvió UploadId");
    return res.UploadId;
  }

  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
  ): Promise<string> {
    return getSignedUrl(
      this.s3,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: PRESIGN_TTL_SEC },
    );
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts
            .slice()
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.s3.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  presignGetObject(key: string): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: PRESIGN_TTL_SEC },
    );
  }

  get presignTtlSec(): number {
    return PRESIGN_TTL_SEC;
  }

  /**
   * Extrae metadata con ffprobe (binario empaquetado por npm) leyendo solo los
   * headers del objeto vía URL firmada. Lanza si el archivo no es video válido.
   */
  async probe(url: string): Promise<ProbedMetadata> {
    const json = await this.runFfprobe(url);
    const format = json.format ?? {};
    const streams = json.streams ?? [];
    const video = streams.find((s) => s.codec_type === "video");
    if (!video) throw new Error("El archivo no contiene stream de video");

    return {
      durationSec: format.duration ? Number(format.duration) : null,
      width: video.width ?? null,
      height: video.height ?? null,
      fps: parseFps(video.r_frame_rate),
      codec: video.codec_name ?? null,
      container: format.format_name ?? null,
      bitrate: format.bit_rate ? Number(format.bit_rate) : null,
    };
  }

  private runFfprobe(url: string): Promise<FfprobeOutput> {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffprobeInstaller.path, [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        url,
      ]);
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error("ffprobe timeout"));
      }, 15_000);

      proc.stdout.on("data", (d) => (stdout += d));
      proc.stderr.on("data", (d) => (stderr += d));
      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`ffprobe salió con código ${code}: ${stderr}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout) as FfprobeOutput);
        } catch {
          reject(new Error("No se pudo parsear la salida de ffprobe"));
        }
      });
    });
  }
}

interface FfprobeOutput {
  format?: {
    duration?: string;
    format_name?: string;
    bit_rate?: string;
  };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
  }>;
}

function parseFps(rate: string | undefined): number | null {
  if (!rate) return null;
  const [num, den] = rate.split("/").map(Number);
  if (!num || !den) return null;
  return Math.round((num / den) * 1000) / 1000;
}
