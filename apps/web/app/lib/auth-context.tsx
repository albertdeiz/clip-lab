"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AuthTokens } from "@clip-lab/contracts";
import { apiFetch, ApiRequestError } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  storageUsed: string;
  createdAt: string;
}

type Status = "loading" | "authed" | "anon";

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** fetch autenticado con auto-refresh ante 401 (para features siguientes). */
  authedFetch: <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const accessToken = useRef<string | null>(null);

  const loadUser = useCallback(async (): Promise<void> => {
    const me = await apiFetch<AuthUser>("/auth/me", {
      accessToken: accessToken.current,
    });
    setUser(me);
    setStatus("authed");
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const tokens = await apiFetch<AuthTokens>("/auth/refresh", {
        method: "POST",
        credentials: true,
      });
      accessToken.current = tokens.accessToken;
      return true;
    } catch {
      accessToken.current = null;
      return false;
    }
  }, []);

  // Bootstrap: intenta restaurar sesión desde la cookie de refresh.
  useEffect(() => {
    void (async () => {
      if (await refresh()) {
        try {
          await loadUser();
        } catch {
          accessToken.current = null;
          setUser(null);
          setStatus("anon");
        }
      } else {
        setStatus("anon");
      }
    })();
  }, [refresh, loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await apiFetch<AuthTokens>("/auth/login", {
        method: "POST",
        body: { email, password },
        credentials: true,
      });
      accessToken.current = tokens.accessToken;
      await loadUser();
    },
    [loadUser],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const tokens = await apiFetch<AuthTokens>("/auth/register", {
        method: "POST",
        body: { email, password },
        credentials: true,
      });
      accessToken.current = tokens.accessToken;
      await loadUser();
    },
    [loadUser],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST", credentials: true });
    } finally {
      accessToken.current = null;
      setUser(null);
      setStatus("anon");
    }
  }, []);

  const authedFetch = useCallback(
    async <T,>(
      path: string,
      init?: { method?: string; body?: unknown },
    ): Promise<T> => {
      try {
        return await apiFetch<T>(path, {
          method: init?.method,
          body: init?.body,
          accessToken: accessToken.current,
        });
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 401) {
          if (await refresh()) {
            return apiFetch<T>(path, {
              method: init?.method,
              body: init?.body,
              accessToken: accessToken.current,
            });
          }
          setStatus("anon");
          setUser(null);
        }
        throw e;
      }
    },
    [refresh],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout, authedFetch }),
    [status, user, login, register, logout, authedFetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
