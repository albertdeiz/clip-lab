"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { Button } from "../components/ui";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function Dashboard() {
  const { status, user, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);

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

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Tu biblioteca
            </h1>
            <p className="text-sm text-neutral-500">
              Almacenamiento usado: {formatBytes(Number(user.storageUsed))}
            </p>
          </div>
          <Button disabled title="Disponible en la siguiente iteración">
            Subir video
          </Button>
        </div>

        <div className="grid place-items-center rounded-xl border border-dashed border-neutral-800 py-20 text-center">
          <div className="space-y-2">
            <p className="text-neutral-300">Aún no tienes videos</p>
            <p className="text-sm text-neutral-600">
              La subida de videos llega en la siguiente iteración (Upload
              multipart resumible).
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
