"use client";

import { useRef, useState } from "react";
import type { Video } from "@clip-lab/contracts";
import { useAuth } from "../lib/auth-context";
import { uploadVideo } from "../lib/uploader";
import { Button, ErrorBanner } from "./ui";

export function Uploader({ onUploaded }: { onUploaded: (v: Video) => void }) {
  const { authedFetch } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    setProgress(0);
    setFileName(file.name);
    try {
      const video = await uploadVideo(file, authedFetch, {
        onProgress: setProgress,
      });
      onUploaded(video);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falló la subida");
    } finally {
      setUploading(false);
      setFileName(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <Button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? "Subiendo…" : "Subir video"}
      </Button>

      {uploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-neutral-500">
            <span className="truncate">{fileName}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-neutral-100 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && <ErrorBanner message={error} />}
    </div>
  );
}
