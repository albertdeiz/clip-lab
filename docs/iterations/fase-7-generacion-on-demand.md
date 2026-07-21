# Iteration 7 — On-demand, parameterized generation (single-pass lines of thought)

**Objective:** replace the automatic, chunk-based highlight pipeline with a
**user-triggered, parameterized** generation that studies the **whole
transcript in a single pass** and returns complete, self-contained **lines of
thought** (each sentence-aligned and possibly multi-segment). This reworks the
Phase 3 pipeline; the editor and multi-segment clips (Iterations 5–6 of the
editor work) stay as-is.

**Status:** designed (this spec). Supersedes the auto-cascade and the
`chunk → per-chunk Haiku → aggregate → global rerank` pipeline of
[`fase-3-highlights.md`](./fase-3-highlights.md).

## 1. What changes and why

- **On-demand, not automatic.** Uploading a video still auto-transcribes (the
  transcript is the editing canvas and costs no LLM), but **moments are only
  generated when the user asks**, with parameters. The `TranscriptGenerated →
  highlights` cascade is removed.
- **Parameterized.** Behavioral knobs that were env-only move to a
  `GenerationConfig` sent per request (env stays as defaults). Provider/model/
  keys remain **server-side** (never exposed to the browser).
- **Whole-video analysis.** Equal-time chunking fragmented ideas across >2
  pieces. Modern context windows (Sonnet/Opus ~1M tokens) hold an entire
  transcript (10 min ≈ ~2k tokens; 2 h ≈ ~30k), so we analyze it in **one pass**
  and let the model define natural idea boundaries.

## 2. Technical design

```
Transcript(words) ─▶ sentence segmentation (algorithm, existing snap.ts)
                  ─▶ token budget check
       ┌── within budget (default) ──▶ single-pass analysis (1 LLM call)
       │                                 → lines of thought (ranked, sentence-aligned,
       │                                   optionally multi-segment) + titles/reasons
       └── over budget (long video) ──▶ semantic sectioning (algorithm: topic/pause
                                          boundaries, NOT fixed time) → per-section
                                          single pass → light global merge/dedup
                  ─▶ deterministic post: sentence-snap, dedup, duration enforcement
                  ─▶ HighlightSet(DONE) + HighlightsGenerated
```

- **Only reasoning in the LLM.** Segmentation, sectioning, snapping, dedup and
  duration enforcement stay deterministic (per the cost policy).
- **Lines of thought.** The model returns complete ideas with natural start/end
  and may assemble non-contiguous parts (`segments[]`) — reusing the
  multi-segment clip model. Structured output via forced tool use / json_schema,
  validated with Zod.
- **Sectioning fallback** only triggers over a token threshold; sections are cut
  at natural boundaries (long pauses / topic shifts) so ideas stay whole.

## 3. Data

- **`GenerationConfig`** (new Zod contract, persisted on the `HighlightSet` as
  the config used): `targetCount`, `minSec`, `maxSec`, `granularity`
  (`few-long`…`many-short`), `style` (e.g. educational / viral-hooks / quotes),
  `titleLanguage` (`auto|es|en|…`), `allowMultiSegment`, `includeSummary`.
- **`HighlightSet`** gains `status = IDLE` (initial, before first request) and a
  `config` JSON (how it was generated). Existing artifact fields stay
  (`model`, `promptHash`, `contentHash`, `costUsd`). Cache key becomes
  `(contentHash, promptHash, model, configHash)`.
- Obsolete env vars removed: `CHUNK_SECONDS`, `CHUNK_OVERLAP_SECONDS`.
  `HIGHLIGHTS_TARGET`, `HIGHLIGHT_MIN_SEC`, `HIGHLIGHT_MAX_SEC`,
  `SENTENCE_PAUSE_SEC` become `GenerationConfig` defaults.

## 4. API / Events

- **`POST /videos/:id/highlights/generate`** — body: `GenerationConfig` (partial;
  merged over defaults). Sets `HighlightSet.status = QUEUED` and publishes
  **`HighlightsRequested`** (carrying the resolved config). Replaces the
  overloaded `/highlights/retry`.
- Highlights worker consumes `HighlightsRequested` (not `TranscriptGenerated`).
- On success → `HighlightsGenerated` (Phase 4 clip worker consumes it, unchanged).
- `GET /videos/:id/highlights` also returns the `config` and `IDLE` status.

## 5. UI

- When `status = IDLE`: the composer shows a **"Generate moments"** CTA instead
  of an empty list.
- **Generation settings panel** (behavioral only): target count, min/max
  duration, granularity, style, title language, multi-segment, include summary.
  Pre-filled from the last used config for that video.
- Regenerating **warns/confirms** if there are unsaved manual edits (dirty),
  to avoid clobbering the user's work.

## 14. AI cost (updated model)

One structured call over the full transcript. Input is dominated by the
transcript (sent once); output is the ranked moments JSON.

| Video | Approx transcript | Calls | Model | Approx cost |
|---|---|---|---|---|
| 10 min | ~2k tok | 1 | Sonnet 5 | ~$0.02 |
| 40 min | ~8k tok | 1 | Sonnet 5 | ~$0.05 (Haiku ~$0.02) |
| 2 h (fallback) | ~30k tok | ~3–5 sections + merge | Sonnet 5 | scales with sections |

- **Cheaper and better** than the old Haiku fan-out + rerank for typical videos
  (one call, global coherence). Model tier is a server-side choice.
- **Cache/incremental:** `(contentHash, configHash)` → same transcript + same
  config → reuse (cost $0). Changing only the config re-runs; changing the video
  re-transcribes.
- Real cost stored per generation in `HighlightSet.costUsd`.

## Resilience (retries)

- Transient errors (network, rate limit, timeout) retry with exponential backoff
  via the TTL wait queue (unchanged).
- Non-retryable (missing key, invalid data) → DLQ with a clear reason.
- Re-generation is idempotent by `(videoId, configHash)`.

## Config to run

A configured highlight provider server-side (`HIGHLIGHT_*_PROVIDER/MODEL` +
key). Behavioral defaults via env; per-request overrides via the panel. Without
a key the job ends `FAILED` (or use the manual workaround in
[`manual-highlights.md`](../manual-highlights.md)).

## Deliverables

`GenerationConfig` contract + `HighlightsRequested`/`HighlightsGenerated`
contracts · `HighlightSet.config` + `IDLE` status (migration) · decouple the
transcript cascade · `POST /highlights/generate` · single-pass detector +
semantic-sectioning fallback (removes chunker) · generation settings panel +
on-demand CTA + dirty-guard · updated COST/DESIGN/ROADMAP · this spec.
