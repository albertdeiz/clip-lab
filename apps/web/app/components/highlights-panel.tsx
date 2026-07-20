"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HighlightsResponse, Highlight } from "@clip-lab/contracts";
import { useAuth } from "../lib/auth-context";

export interface Range {
  start: number;
  end: number;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function HighlightsPanel({
  videoId,
  currentTime,
  onSeek,
  onHoverRange,
}: {
  videoId: string;
  currentTime: number;
  onSeek: (sec: number) => void;
  onHoverRange: (range: Range | null) => void;
}) {
  const { authedFetch } = useAuth();
  const [data, setData] = useState<HighlightsResponse | null>(null);
  const [items, setItems] = useState<Highlight[]>([]);
  const [baseline, setBaseline] = useState<string>("[]");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await authedFetch<HighlightsResponse>(
          `/videos/${videoId}/highlights`,
        );
        if (!active) return;
        setData(res);
        setItems(res.items);
        setBaseline(JSON.stringify(res.items));
        if (res.status === "QUEUED" || res.status === "DETECTING") {
          timer = setTimeout(poll, 3000);
        }
      } catch {
        /* reintenta al remontar */
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [videoId, authedFetch, nonce]);

  const dirty = useMemo(() => JSON.stringify(items) !== baseline, [items, baseline]);

  const patch = (i: number, patch: Partial<Highlight>) =>
    setItems((prev) => prev.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));
  const del = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  const add = () =>
    setItems((prev) => [
      ...prev,
      {
        start: Math.floor(currentTime),
        end: Math.floor(currentTime) + 30,
        score: 0.5,
        title: "Nuevo momento",
        reason: "",
      },
    ]);
  const mergeSelected = () => {
    const idx = [...selected].sort((a, b) => a - b);
    if (idx.length < 2) return;
    const chosen = idx.map((i) => items[i]!);
    const merged: Highlight = {
      start: Math.min(...chosen.map((h) => h.start)),
      end: Math.max(...chosen.map((h) => h.end)),
      score: Math.max(...chosen.map((h) => h.score)),
      title: chosen[0]!.title,
      reason: chosen.map((h) => h.reason).filter(Boolean).join(" · "),
    };
    setItems((prev) => [...prev.filter((_, i) => !selected.has(i)), merged]);
    setSelected(new Set());
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await authedFetch<HighlightsResponse>(
        `/videos/${videoId}/highlights`,
        { method: "PATCH", body: { items } },
      );
      setItems(res.items);
      setBaseline(JSON.stringify(res.items));
      setSelected(new Set());
    } catch {
      /* deja el estado editado para reintentar */
    } finally {
      setSaving(false);
    }
  }, [authedFetch, videoId, items]);

  async function retry() {
    try {
      await authedFetch(`/videos/${videoId}/highlights/retry`, { method: "POST" });
      setData(null);
      setNonce((n) => n + 1);
    } catch {
      /* noop */
    }
  }

  async function snapCuts() {
    try {
      const res = await authedFetch<HighlightsResponse>(
        `/videos/${videoId}/highlights/snap`,
        { method: "POST" },
      );
      setItems(res.items);
      setBaseline(JSON.stringify(res.items));
    } catch {
      /* noop */
    }
  }

  if (!data) return <p className="p-4 text-sm text-neutral-500">Cargando…</p>;

  if (data.status === "QUEUED" || data.status === "DETECTING") {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-neutral-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
        {data.status === "QUEUED" ? "En cola…" : "Detectando momentos…"}
      </p>
    );
  }

  if (data.status === "FAILED" && items.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="text-sm text-red-400">
          {data.failReason ?? "No se pudieron detectar highlights"}
        </p>
        <button
          onClick={() => void retry()}
          className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="uppercase tracking-widest text-neutral-500">
          Momentos sugeridos ({items.length})
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={() => void snapCuts()}
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-800"
            title="Ajustar inicio/fin a frases completas"
          >
            Cortes limpios
          </button>
          <button
            onClick={add}
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-800"
          >
            + Añadir
          </button>
          <button
            onClick={mergeSelected}
            disabled={selected.size < 2}
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
          >
            Combinar ({selected.size})
          </button>
          <button
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="rounded bg-neutral-100 px-2 py-1 font-medium text-neutral-900 hover:bg-white disabled:opacity-40"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {items.map((h, i) => (
          <li
            key={i}
            onMouseEnter={() => onHoverRange({ start: h.start, end: h.end })}
            onFocusCapture={() => onHoverRange({ start: h.start, end: h.end })}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-2"
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={(e) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(i);
                    else next.delete(i);
                    return next;
                  })
                }
                aria-label="Seleccionar para combinar"
              />
              <input
                value={h.title}
                onChange={(e) => patch(i, { title: e.target.value })}
                className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm text-neutral-100 outline-none focus:bg-neutral-800"
              />
              <button
                onClick={() => del(i)}
                className="shrink-0 text-neutral-500 hover:text-red-400"
                aria-label="Eliminar"
              >
                ✕
              </button>
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
              <button
                onClick={() => onSeek(h.start)}
                className="rounded px-1 text-neutral-300 hover:bg-neutral-800"
                title="Ir al inicio"
              >
                ▶ {fmt(h.start)}–{fmt(h.end)}
              </button>
              <button
                onClick={() => patch(i, { start: Math.floor(currentTime) })}
                className="rounded px-1 hover:bg-neutral-800"
              >
                fijar inicio
              </button>
              <button
                onClick={() => patch(i, { end: Math.floor(currentTime) })}
                className="rounded px-1 hover:bg-neutral-800"
              >
                fijar fin
              </button>
              <span className="ml-auto">{Math.round(h.score * 100)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
