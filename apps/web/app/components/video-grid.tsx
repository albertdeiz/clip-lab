"use client";

import type { Video, VideoStatus } from "@clip-lab/contracts";
import { VIDEO_STATUS_LABEL } from "../lib/uploader";

const STATUS_STYLE: Record<VideoStatus, string> = {
  READY: "bg-emerald-950/60 text-emerald-300 border-emerald-900/60",
  PROCESSING: "bg-amber-950/60 text-amber-300 border-amber-900/60",
  UPLOADING: "bg-sky-950/60 text-sky-300 border-sky-900/60",
  FAILED: "bg-red-950/60 text-red-300 border-red-900/60",
};

function formatDuration(sec: number | null): string {
  if (sec === null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoGrid({
  videos,
  onPlay,
  onDelete,
}: {
  videos: Video[];
  onPlay: (v: Video) => void;
  onDelete: (v: Video) => void;
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((v) => (
        <li
          key={v.id}
          className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-medium" title={v.title}>
              {v.title}
            </h3>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[v.status]}`}
            >
              {VIDEO_STATUS_LABEL[v.status]}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-y-1 text-xs text-neutral-500">
            <dt>Duración</dt>
            <dd className="text-right text-neutral-300">
              {formatDuration(v.durationSec)}
            </dd>
            <dt>Resolución</dt>
            <dd className="text-right text-neutral-300">
              {v.width && v.height ? `${v.width}×${v.height}` : "—"}
            </dd>
            <dt>Códec</dt>
            <dd className="text-right text-neutral-300">{v.codec ?? "—"}</dd>
          </dl>

          {v.status === "FAILED" && v.failReason && (
            <p className="text-xs text-red-400">{v.failReason}</p>
          )}

          <div className="mt-auto flex gap-2 pt-2">
            <button
              onClick={() => onPlay(v)}
              disabled={v.status !== "READY"}
              className="flex-1 rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reproducir
            </button>
            <button
              onClick={() => onDelete(v)}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition hover:bg-neutral-800"
              aria-label={`Eliminar ${v.title}`}
            >
              Eliminar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
