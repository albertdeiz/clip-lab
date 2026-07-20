"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  HighlightsResponse,
  PlaybackUrlResponse,
  Sentence,
  TranscriptResponse,
  TranscriptWord,
} from "@clip-lab/contracts";
import { useAuth } from "./auth-context";
import {
  sentencesOf,
  snap,
  toEditClips,
  toHighlights,
  type EditClip,
} from "./editor";
import { DEFAULT_DECORATORS, type WordDecorator } from "./decorators";

const MIN_CLIP_SEC = 1;
const SEEK_STEP = 5;

/** Selección de texto en curso, por índices de palabra (inclusivo). */
export interface WordSelection {
  a: number;
  b: number;
}

export interface ClipEditorValue {
  videoId: string;
  // playback
  videoRef: RefObject<HTMLVideoElement | null>;
  url: string | null;
  loadError: string | null;
  currentTime: number;
  duration: number;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  seek: (sec: number) => void;
  togglePlay: () => void;
  // transcript
  transcript: TranscriptResponse | null;
  words: TranscriptWord[];
  sentences: Sentence[];
  language: string | null;
  transcribing: boolean;
  detecting: boolean;
  // clips
  clips: EditClip[];
  activeId: string | null;
  dirty: boolean;
  saving: boolean;
  generating: boolean;
  generatedKey: number;
  setActive: (id: string) => void;
  createClip: (range: { start: number; end: number }) => void;
  replaceActive: (range: { start: number; end: number }) => void;
  trim: (edge: "start" | "end", sec: number) => void;
  addClipAtCursor: () => void;
  setTitle: (id: string, title: string) => void;
  deleteClip: (id: string) => void;
  deleteActive: () => void;
  snapAll: () => void;
  save: () => Promise<boolean>;
  generate: () => Promise<void>;
  // selección (compartida entre transcript, barra de acciones y atajos)
  selection: WordSelection | null;
  setSelection: (s: WordSelection | null) => void;
  selectionRange: () => { start: number; end: number } | null;
  createFromSelection: () => void;
  fixSelectionToActive: () => void;
  // decorators
  decorators: WordDecorator[];
}

const Ctx = createContext<ClipEditorValue | null>(null);

export function useClipEditor(): ClipEditorValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useClipEditor debe usarse dentro de <ClipEditorProvider>");
  return ctx;
}

/**
 * Provider central del editor de clips (patrón useEditor + Context): concentra
 * el estado y las operaciones para que transcript, composer, PiP y atajos
 * compartan una sola fuente de verdad, sin prop-drilling.
 */
export function ClipEditorProvider({
  videoId,
  children,
}: {
  videoId: string;
  children: ReactNode;
}) {
  const { authedFetch } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(Infinity);

  const [transcript, setTranscript] = useState<TranscriptResponse | null>(null);
  const [highlights, setHighlights] = useState<HighlightsResponse | null>(null);
  const [clips, setClips] = useState<EditClip[]>([]);
  const [baseline, setBaseline] = useState("[]");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selection, setSelection] = useState<WordSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState(0);
  const initialized = useRef(false);

  const words = transcript?.words ?? [];
  const sentences = useMemo(() => sentencesOf(words), [words]);
  const dirty = useMemo(
    () => JSON.stringify(toHighlights(clips)) !== baseline,
    [clips, baseline],
  );

  // --- carga de datos ---
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await authedFetch<PlaybackUrlResponse>(
          `/videos/${videoId}/playback-url`,
        );
        if (active) setUrl(res.url);
      } catch {
        if (active) setLoadError("No se pudo cargar el video");
      }
    })();
    return () => {
      active = false;
    };
  }, [videoId, authedFetch]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const t = await authedFetch<TranscriptResponse>(
          `/videos/${videoId}/transcript`,
        );
        if (!active) return;
        setTranscript(t);
        if (t.status === "QUEUED" || t.status === "TRANSCRIBING") {
          timer = setTimeout(poll, 2500);
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
  }, [videoId, authedFetch]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const h = await authedFetch<HighlightsResponse>(
          `/videos/${videoId}/highlights`,
        );
        if (!active) return;
        setHighlights(h);
        if (!initialized.current && (h.status === "DONE" || h.status === "FAILED")) {
          initialized.current = true;
          const ec = toEditClips(h.items);
          setClips(ec);
          setBaseline(JSON.stringify(h.items));
          if (ec[0]) setActiveId(ec[0]._id);
        }
        if (h.status === "QUEUED" || h.status === "DETECTING") {
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
  }, [videoId, authedFetch]);

  // --- playback ---
  const seek = useCallback((sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, sec);
    void v.play().catch(() => undefined);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);

  // --- clips ---
  const patch = useCallback(
    (id: string, p: Partial<EditClip>) =>
      setClips((prev) => prev.map((c) => (c._id === id ? { ...c, ...p } : c))),
    [],
  );

  const setActive = useCallback(
    (id: string) => {
      setActiveId(id);
      setClips((prev) => {
        const c = prev.find((x) => x._id === id);
        if (c) seek(c.start);
        return prev;
      });
    },
    [seek],
  );

  const createClip = useCallback((range: { start: number; end: number }) => {
    const ec = toEditClips([
      { ...range, score: 0.5, title: "Nuevo clip", reason: "" },
    ])[0]!;
    setClips((prev) => [...prev, ec]);
    setActiveId(ec._id);
  }, []);

  const replaceActive = useCallback(
    (range: { start: number; end: number }) => {
      if (activeId) patch(activeId, range);
    },
    [activeId, patch],
  );

  const trim = useCallback(
    (edge: "start" | "end", sec: number) => {
      if (!activeId) return;
      setClips((prev) =>
        prev.map((c) => {
          if (c._id !== activeId) return c;
          return edge === "start"
            ? { ...c, start: Math.max(0, Math.min(sec, c.end - MIN_CLIP_SEC)) }
            : { ...c, end: Math.max(sec, c.start + MIN_CLIP_SEC) };
        }),
      );
    },
    [activeId],
  );

  const addClipAtCursor = useCallback(() => {
    const start = Math.floor(currentTime);
    const end = Math.min(start + 30, isFinite(duration) ? duration : start + 30);
    createClip({ start, end });
  }, [currentTime, duration, createClip]);

  const setTitle = useCallback((id: string, title: string) => patch(id, { title }), [patch]);

  const deleteClip = useCallback((id: string) => {
    setClips((prev) => prev.filter((c) => c._id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);

  const deleteActive = useCallback(() => {
    if (activeId) deleteClip(activeId);
  }, [activeId, deleteClip]);

  const snapAll = useCallback(() => {
    if (sentences.length === 0) return;
    setClips((prev) =>
      prev.map((c) => {
        const s = snap(c.start, c.end, sentences);
        return { ...c, start: s.start, end: s.end };
      }),
    );
  }, [sentences]);

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await authedFetch<HighlightsResponse>(
        `/videos/${videoId}/highlights`,
        { method: "PATCH", body: { items: toHighlights(clips) } },
      );
      setBaseline(JSON.stringify(res.items));
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, [authedFetch, videoId, clips]);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      if (dirty && !(await save())) return;
      await authedFetch(`/videos/${videoId}/clips/retry`, { method: "POST" });
      setGeneratedKey((k) => k + 1);
    } catch {
      /* noop */
    } finally {
      setGenerating(false);
    }
  }, [dirty, save, authedFetch, videoId]);

  // --- selección ---
  const selectionRange = useCallback((): { start: number; end: number } | null => {
    if (!selection || words.length === 0) return null;
    const a = Math.min(selection.a, selection.b);
    const b = Math.max(selection.a, selection.b);
    return { start: words[a]!.start, end: words[b]!.end };
  }, [selection, words]);

  const createFromSelection = useCallback(() => {
    const r = selectionRange();
    if (r) createClip(r);
    setSelection(null);
  }, [selectionRange, createClip]);

  const fixSelectionToActive = useCallback(() => {
    const r = selectionRange();
    if (r && activeId) replaceActive(r);
    setSelection(null);
  }, [selectionRange, activeId, replaceActive]);

  // --- atajos de teclado (capa de comandos) ---
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seek(currentTime - SEEK_STEP);
          break;
        case "ArrowRight":
          e.preventDefault();
          seek(currentTime + SEEK_STEP);
          break;
        case "c":
        case "C":
          createFromSelection();
          break;
        case "f":
        case "F":
          fixSelectionToActive();
          break;
        case "[":
          if (activeId) trim("start", currentTime);
          break;
        case "]":
          if (activeId) trim("end", currentTime);
          break;
        case "Backspace":
        case "Delete":
          if (activeId) {
            e.preventDefault();
            deleteActive();
          }
          break;
        case "Escape":
          if (selection) setSelection(null);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    save,
    togglePlay,
    seek,
    currentTime,
    createFromSelection,
    fixSelectionToActive,
    activeId,
    trim,
    deleteActive,
    selection,
  ]);

  const transcribing =
    !transcript ||
    transcript.status === "QUEUED" ||
    transcript.status === "TRANSCRIBING";
  const detecting =
    highlights?.status === "QUEUED" || highlights?.status === "DETECTING";

  const value = useMemo<ClipEditorValue>(
    () => ({
      videoId,
      videoRef,
      url,
      loadError,
      currentTime,
      duration,
      setCurrentTime,
      setDuration,
      seek,
      togglePlay,
      transcript,
      words,
      sentences,
      language: transcript?.language ?? null,
      transcribing,
      detecting,
      clips,
      activeId,
      dirty,
      saving,
      generating,
      generatedKey,
      setActive,
      createClip,
      replaceActive,
      trim,
      addClipAtCursor,
      setTitle,
      deleteClip,
      deleteActive,
      snapAll,
      save,
      generate,
      selection,
      setSelection,
      selectionRange,
      createFromSelection,
      fixSelectionToActive,
      decorators: DEFAULT_DECORATORS,
    }),
    [
      videoId,
      url,
      loadError,
      currentTime,
      duration,
      seek,
      togglePlay,
      transcript,
      words,
      sentences,
      transcribing,
      detecting,
      clips,
      activeId,
      dirty,
      saving,
      generating,
      generatedKey,
      setActive,
      createClip,
      replaceActive,
      trim,
      addClipAtCursor,
      setTitle,
      deleteClip,
      deleteActive,
      snapAll,
      save,
      generate,
      selection,
      selectionRange,
      createFromSelection,
      fixSelectionToActive,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
