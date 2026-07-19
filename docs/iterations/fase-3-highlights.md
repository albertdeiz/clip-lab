# Iteration 3 — AI highlight detection

**Objective:** after a video is transcribed, a **hierarchical LLM pipeline**
proposes the moments with the highest viral potential (with score, title and
reason); the user sees them and jumps to each from the player.

**Status:** implemented and verified E2E except the LLM call itself (requires
`ANTHROPIC_API_KEY`). Verified: pure functions (chunker/dedup), the full event
chain (transcript → `TranscriptGenerated` → highlights job → persistence →
endpoint), build and typecheck. Without a key, the job ends `FAILED` with a clear
reason (not a stub: the feature needs the credential to reason with the LLM).

## 1. Technical design (hierarchical pipeline — see docs/COST.md)
```
Transcript(words) ─▶ chunker (2-3 min, 20s overlap)   [algorithm]
                  ─▶ PARALLEL per-chunk analysis (Haiku 4.5) [LLM, cached rubric]
                  ─▶ aggregate + overlap dedup + top-N        [algorithm]
                  ─▶ global rerank + titles, 1 call (Sonnet 5) [LLM, compact context]
                  ─▶ HighlightSet(DONE) + HighlightsDetected
```
- **Only reasoning in the LLM**; chunking, dedup, ranking and selection are
  algorithms. Structured output via **forced tool use** (stable) validated with Zod.
- **Prompt caching** of the prefix (rubric) in the per-chunk fan-out (~0.1× reads).

## 2. Data
`HighlightSet` (1–1 with Video) = persisted AI artifact (§7 COST): `status`,
`version`, `model`, `localModel`, `promptHash`, `contentHash`, `items` (JSON),
`costUsd`, `failReason`. Migration `20260719204800_highlights`.

## 3. API / Events
`GET /videos/:id/highlights` → `{status, model, costUsd, items[], failReason}`.
`TranscriptGenerated` (producer: transcription worker) → **consumer: highlights
job** → `HighlightsDetected` (no consumer yet; Phase 4). DLQ `highlights.dlq`.

## 4. UI
Highlights panel in the player: ordered list with score, title, range and
reason; click → seek. Status polling (`QUEUED→DETECTING→DONE/FAILED`).

## 14. AI cost (first real LLM cost)
Models: **Haiku 4.5** local per chunk ($1/$5 per 1M), **Sonnet 5** global
($3/$15). 40-min video ≈ 16 chunks:

| Stage | Calls | Model | Approx cost |
|---|---|---|---|
| Local per chunk | 16 | Haiku 4.5 | ~$0.038 |
| Global rerank + titles | 1 | Sonnet 5 | ~$0.012 |
| **Total / video** | | | **≈ $0.05** (≈ $0.03 with cache + Batch) |

- **Cache/incremental:** transcript `contentHash` → if unchanged, no reprocess.
  Idempotent by `videoId`.
- **Avoided alternative:** a single prompt with the whole transcript on
  Sonnet/Opus would cost 3–5× more; the Haiku fan-out + rerank is the
  cost-efficient option.
- Real cost is stored per generation in `HighlightSet.costUsd`.

## Resilience (retries)
- **Automatic:** transient errors (network, LLM rate limit, timeout) retry with
  exponential backoff (5s..5min, 5 attempts) via a wait queue with TTL.
- **Manual:** `POST /videos/:id/highlights/retry` (and `/transcript/retry`)
  reset state and re-enqueue via the outbox; "Retry" button in the UI when FAILED.
- Non-retryable errors (missing key, invalid data) go straight to the DLQ.

## Config to run
`ANTHROPIC_API_KEY` in `.env` (and optionally `HIGHLIGHT_LOCAL_MODEL`,
`HIGHLIGHT_GLOBAL_MODEL`, `CHUNK_SECONDS`, `HIGHLIGHTS_TARGET`).

## Deliverables
`HighlightsDetected` contract + topology · `HighlightSet` migration ·
hierarchical detector (chunker/aggregator/LLM/cost) · second worker consumer ·
highlights endpoint · highlights UI · retries · this spec.
