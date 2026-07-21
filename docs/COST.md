# AI cost efficiency (functional requirement)

Cost efficiency is a **functional requirement**, not a later optimization. The
system will process thousands of videos/day; LLM cost must stay a small fraction
of total cost.

---

## 1. Decision gate (mandatory before any LLM call)

Question: *"Does this need reasoning over language/semantics, or is it
deterministic?"* If deterministic → algorithm/specialized tool.

| Task | LLM? | Tool |
|---|---|---|
| Extract audio, probe, duration, metadata | ❌ | FFmpeg / ffprobe |
| Transcription (speech→text + timestamps) | ❌ (specialized) | Whisper |
| Silence detection / cut on pauses | ❌ | FFmpeg `silencedetect` |
| Sentence segmentation / semantic sectioning (long videos) | ❌ | Algorithm |
| Cut, scale, concatenate, render | ❌ | FFmpeg / NVENC |
| 9:16 reframe / face tracking | ❌ (specialized vision) | Face detector |
| Semantic search / moment dedup | ❌ (embeddings) | Embeddings + pgvector |
| Sort, filter, compute scores | ❌ | Code |
| **Decide which moment is viral and why** | ✅ | LLM |
| **Title / hook / clip summary** | ✅ | LLM |

Only *virality judgment* and *short text generation* use the LLM.

---

## 2. Model matrix (prices per 1M tokens)

| Model | Input | Output | Use |
|---|---|---|---|
| Whisper (own infra) | — | — | Transcription (does not count as LLM tokens) |
| Embeddings | ~$0.02–0.13 | — | Semantic dedup, search |
| Haiku 4.5 | $1 | $5 | Local per-chunk analysis (scoped extraction) |
| Sonnet 5 (intro $2/$10) | $3 | $15 | Global rerank + titles (cross-video judgment) |
| Opus 4.8 | $5 | $25 | Premium tier / hard cases only (opt-in) |

**Always-on levers:** prompt caching of the stable prefix (reads ~0.1×), Batch
API (−50%) in non-interactive flows, structured JSON outputs.

---

## 3. Generation pipeline (single-pass, on-demand)

```
Transcript → sentence segmentation (algorithm, snap.ts)
          → token budget check
   ├─ within budget (default): single-pass analysis, 1 call → lines of thought
   │                            (ranked, sentence-aligned, optionally multi-segment)
   └─ over budget (long video): semantic sectioning (natural topic/pause bounds,
                                NOT fixed time) → per-section pass → light merge
          → deterministic post: sentence-snap + dedup + duration enforcement
          → final highlights JSON
```

**Why single-pass, not equal-time chunks:** modern context windows (Sonnet/Opus
~1M tokens) hold an entire transcript (10 min ≈ ~2k tokens; 2 h ≈ ~30k), so
fixed-time chunking is unnecessary and actively fragments ideas across >2 pieces.
One pass gives the model a global view → complete, self-contained *lines of
thought* with natural boundaries, better coherence and ranking. Chunking is kept
only as a **long-video fallback**, cut at natural boundaries so ideas stay whole.
Generation is **on-demand and parameterized** (`GenerationConfig`); model tier is
a server-side choice. See [`iterations/fase-7-generacion-on-demand.md`](./iterations/fase-7-generacion-on-demand.md).

---

## 4. AI artifact persistence and caching

Every AI result is stored and reused (an AI artifact carries): `entity_type`,
`entity_id`, `version`, `model`, `prompt_hash`, `content_hash`, `payload`,
`cost_usd`, `created_at`. Indexed by `(content_hash, prompt_hash, model)`.

- **No redundancy:** before calling, look up the key; if it exists → reuse (cost $0).
- **Incremental:** if a portion of the video changes, only the `content_hash` of
  the affected chunks changes → only those are reprocessed, not the whole video.

---

## 5. Per-feature cost model (§14 template — e.g. highlights, single-pass)

One structured call over the full transcript (input dominated by the transcript,
sent once; output = ranked moments JSON):

| Video | Transcript approx | Calls | Model | Cost |
|---|---|---|---|---|
| 10 min | ~2k tok in / ~1k out | 1 | Sonnet 5 | ~$0.02 |
| 40 min | ~8k tok in / ~1.5k out | 1 | Sonnet 5 | ~$0.05 (Haiku ~$0.02) |
| 2 h (fallback) | ~30k tok | ~3–5 sections + merge | Sonnet 5 | scales w/ sections |

Cheaper and better than the old Haiku fan-out + rerank for typical videos (one
call, global coherence). At 150k videos/month (~10-min avg): ≈ $3,000/month,
lower with caching. GPU compute (Whisper + render) still dominates, so the LLM
stays a small fraction.

**Every iteration that uses AI includes this table** (tokens, calls, cost/video,
cost/month, alternatives, caching, incremental).
