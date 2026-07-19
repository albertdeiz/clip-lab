"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./lib/auth-context";

export default function Home() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authed") router.replace("/dashboard");
    else if (status === "anon") router.replace("/login");
  }, [status, router]);

  return (
    <main className="grid min-h-screen place-items-center">
      <p className="text-sm text-neutral-500">Cargando…</p>
    </main>
  );
}
