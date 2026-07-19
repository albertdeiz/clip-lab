"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";

/**
 * Página a la que Google redirige tras el callback del backend. La cookie de
 * refresh ya está puesta; el bootstrap del AuthProvider restaura la sesión y
 * aquí solo redirigimos según el estado.
 */
export default function OAuthCallback() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authed") router.replace("/dashboard");
    else if (status === "anon") router.replace("/login?error=oauth");
  }, [status, router]);

  return (
    <main className="grid min-h-screen place-items-center">
      <p className="text-sm text-neutral-500">Completando inicio de sesión…</p>
    </main>
  );
}
