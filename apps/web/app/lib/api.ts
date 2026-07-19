import type { ApiError } from "@clip-lab/contracts";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  accessToken?: string | null;
  /** Envía la cookie de refresh (endpoints bajo /auth). */
  credentials?: boolean;
}

export async function apiFetch<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.accessToken) headers["authorization"] = `Bearer ${opts.accessToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: opts.credentials ? "include" : "same-origin",
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const err = (json as ApiError | undefined)?.error;
    throw new ApiRequestError(
      res.status,
      err?.code ?? "ERROR",
      err?.message ?? "Error de red",
      err?.details,
    );
  }
  return json as T;
}
