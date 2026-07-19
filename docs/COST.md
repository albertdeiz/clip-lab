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
| Transcript chunking / segmentation | ❌ | Algorithm |
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

## 3. Hierarchical pipeline

```
Transcript → context reduction (algorithm: drop silences/filler/repetition)
          → chunker (2–3 min, ~20s overlap, cut on pauses)
          → PARALLEL local per-chunk analysis (Haiku)  →  candidates+score+hook
          → aggregate + rank + dedup via embeddings (algorithm)
          → top candidates (compact representation)
          → global analysis, 1 call (Sonnet)  →  final highlights JSON
```

**Chunk rationale (2–3 min, ~20s overlap, cut on pauses):** a viral clip lasts
20–90s; the window contains a complete "moment" without fragmenting it while
keeping per-call context minimal. The overlap avoids losing moments at the edge;
cutting on pauses (detected by FFmpeg) avoids splitting sentences. Configurable
(`chunk_seconds`, `overlap_seconds`).

---

## 4. AI artifact persistence and caching

Every AI result is stored and reused (an AI artifact carries): `entity_type`,
`entity_id`, `version`, `model`, `prompt_hash`, `content_hash`, `payload`,
`cost_usd`, `created_at`. Indexed by `(content_hash, prompt_hash, model)`.

- **No redundancy:** before calling, look up the key; if it exists → reuse (cost $0).
- **Incremental:** if a portion of the video changes, only the `content_hash` of
  the affected chunks changes → only those are reprocessed, not the whole video.

---

## 5. Per-feature cost model (§14 template — e.g. highlights, 40-min video)

| Stage | Calls | in/out approx | Model | Cost |
|---|---|---|---|---|
| Local analysis | 16 chunks | 900 / 300 | Haiku 4.5 | ~$0.038 |
| Global rerank | 1 | 2,000 / 800 | Sonnet 5 | ~$0.012 |
| Titles/hooks | 1 (batch) | 1,500 / 600 | Sonnet 5 | ~$0.009 |
| **Total LLM / video** | | | | **≈ $0.06** (≈ $0.03–0.04 with batch+cache) |

At 150k videos/month: ~$9,000/month unoptimized, ~$4,500 with batch+cache. GPU
compute (Whisper + render) dominates, so the LLM stays a small fraction.

**Every iteration that uses AI includes this table** (tokens, calls, cost/video,
cost/month, alternatives, caching, incremental).
