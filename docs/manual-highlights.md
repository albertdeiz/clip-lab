# Manual highlight detection (stopgap without an LLM provider)

A human-in-the-loop workaround to complete Phase 3 for a video when no LLM
provider is configured (no API key, no local Ollama). A person (or an assistant
like Claude in a chat) produces the highlights; a small CLI handles finding the
video and writing the result.

> This is a **temporary** bridge. To run detection automatically for any video,
> configure a provider instead (free local **Ollama**, or an API key) — see
> `CLAUDE.md` → AI providers. The `dump`/`apply` output format matches the real
> `HighlightSet.items`, so the manual result is indistinguishable downstream.

## Prerequisites
- Infra up (`pnpm infra:up`) and the video's transcript already `DONE`.

## Workflow

**1. Dump the time-aligned transcript** (stdout = transcript; metadata → stderr):
```bash
pnpm highlights:manual dump "<userEmail>" "<videoTitle|videoId>"
```

**2. Produce the moments JSON** — an array of objects (same contract as the
on-demand generation):
```json
[
  { "title": "Short, catchy title", "reason": "Why it's a good clip",
    "score": 0.95, "start": 218, "end": 245 },

  { "title": "Summary of the video", "reason": "Recap", "score": 1,
    "summary": true,
    "segments": [ { "start": 22, "end": 31 }, { "start": 206, "end": 217 } ] }
]
```
`score` 0–1, ordered best→worst. Each moment is either a simple cut (`start`/`end`
in seconds) or a stitched clip via `segments` (a line of thought / summary — in
that case `start`/`end` are derived as the envelope). Mark the recap with
`summary: true`. Self-contained clips (~15–90s) with a clear hook. Save to a file
(e.g. `hl.json`).

**3. Apply it** (inserts/updates the `HighlightSet` as `DONE`, `model: manual`,
`costUsd: 0` — idempotent):
```bash
pnpm highlights:manual apply "<userEmail>" "<videoTitle|videoId>" hl.json
# or pipe via stdin:
cat hl.json | pnpm highlights:manual apply "<userEmail>" "<videoTitle|videoId>"
```

Then open the video in the player — the highlights panel shows them; clicking a
highlight seeks the video.

## Working with Claude (the fast path)
Tell Claude the **username** and the **video name**. Claude will:
1. run `dump` to read the transcript,
2. produce the highlights JSON (acting as the detector),
3. run `apply` to insert them.

## Notes
- Video is matched by `userEmail` + title substring (case-insensitive), or by a
  UUID. If several match, the CLI lists them and asks for the exact id.
- `DATABASE_URL` is read from the root `.env` automatically (Node ≥ 20.12).
- Script: `scripts/manual-highlights.cjs`.
