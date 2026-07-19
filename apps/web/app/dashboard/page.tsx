"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Video, VideoListResponse } from "@clip-lab/contracts";
import { useAuth } from "../lib/auth-context";
import { Button } from "../components/ui";
import { Uploader } from "../components/uploader";
import { VideoGrid } from "../components/video-grid";
import { VideoPlayer } from "../components/video-player";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function Dashboard() {
  const { status, user, logout, authedFetch } = useAuth();
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState<Video | null>(null);
  const [storageUsed, setStorageUsed] = useState(0);

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (user) setStorageUsed(Number(user.storageUsed));
  }, [user]);

  const loadVideos = useCallback(async () => {
    const res = await authedFetch<VideoListResponse>("/videos?limit=50");
    setVideos(res.items);
    setLoaded(true);
  }, [authedFetch]);

  useEffect(() => {
    if (status === "authed") void loadVideos();
  }, [status, loadVideos]);

  const onUploaded = useCallback((v: Video) => {
    setVideos((prev) => [v, ...prev]);
    setStorageUsed((prev) => prev + (v.sizeBytes ?? 0));
  }, []);

  const onDelete = useCallback(
    async (v: Video) => {
      await authedFetch(`/videos/${v.id}`, { method: "DELETE" });
      setVideos((prev) => prev.filter((x) => x.id !== v.id));
      if (v.status === "READY") setStorageUsed((prev) => prev - (v.sizeBytes ?? 0));
    },
    [authedFetch],
  );

  if (status !== "authed" || !user) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="text-sm text-neutral-500">Cargando…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <span className="font-semibold tracking-tight">ClipLab</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-neutral-400">{user.email}</span>
          <Button variant="ghost" onClick={() => void logout()}>
            Salir
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Tu biblioteca
            </h1>
            <p className="text-sm text-neutral-500">
              {videos.length} video{videos.length === 1 ? "" : "s"} ·{" "}
              {formatBytes(storageUsed)} usados
            </p>
          </div>
          <Uploader onUploaded={onUploaded} />
        </div>

        {!loaded ? (
          <p className="text-sm text-neutral-500">Cargando videos…</p>
        ) : videos.length === 0 ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-neutral-800 py-20 text-center">
            <div className="space-y-2">
              <p className="text-neutral-300">Aún no tienes videos</p>
              <p className="text-sm text-neutral-600">
                Sube tu primer video (MP4, MOV, MKV o WebM, hasta 2 GB).
              </p>
            </div>
          </div>
        ) : (
          <VideoGrid videos={videos} onPlay={setPlaying} onDelete={onDelete} />
        )}
      </main>

      {playing && (
        <VideoPlayer
          videoId={playing.id}
          title={playing.title}
          onClose={() => setPlaying(null)}
        />
      )}
    </div>
  );
}
