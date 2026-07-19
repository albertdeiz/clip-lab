"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Button, ErrorBanner, Input } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isRegister) await register(email, password);
      else await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "No se pudo completar la solicitud",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isRegister ? "Crear cuenta" : "Iniciar sesión"}
        </h1>
        <p className="text-sm text-neutral-500">
          {isRegister
            ? "Empieza a convertir tus videos en clips."
            : "Bienvenido de vuelta a ClipLab."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Contraseña"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={isRegister ? 10 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {isRegister && (
          <p className="text-xs text-neutral-600">Mínimo 10 caracteres.</p>
        )}
        {error && <ErrorBanner message={error} />}
        <Button type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading
            ? "Procesando…"
            : isRegister
              ? "Crear cuenta"
              : "Entrar"}
        </Button>
      </form>

      <div className="relative text-center">
        <span className="bg-neutral-950 px-2 text-xs uppercase tracking-widest text-neutral-600">
          o
        </span>
      </div>

      <a href={`${API_URL}/auth/oauth/google`} className="block">
        <Button variant="ghost" style={{ width: "100%" }} type="button">
          Continuar con Google
        </Button>
      </a>

      <p className="text-center text-sm text-neutral-500">
        {isRegister ? (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-neutral-200 underline">
              Inicia sesión
            </Link>
          </>
        ) : (
          <>
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="text-neutral-200 underline">
              Regístrate
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
