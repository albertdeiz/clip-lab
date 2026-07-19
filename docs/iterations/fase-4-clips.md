# Iteration 4 — Clip generation

**Objective:** turn each detected highlight into a short **9:16 clip** — precise
cut + reframe with FFmpeg — playable and downloadable from the UI.

**Status:** implemented and verified E2E against a real video (5 highlights → 5
clips `READY`, h264 **1080×1920**, aac audio, ~27s each).

## 1. Technical design
- **Clip Worker** (new consumer of `HighlightsDetected`): downloads the source
  once, then per highlight does a precise cut + 9:16 reframe with FFmpeg,
  uploads the clip to S3 and marks the `Clip` `READY`. Idempotent (regenerates:
  deletes previous clips + their S3 objects). A per-clip failure marks that clip
  `FAILED` and continues with the rest.
- **Reframe** (`CLIP_REFRAME`, deterministic FFmpeg — no ML): `crop` (center
  fill, default), `blur` (blurred background), `fit` (letterbox). Subject-tracking
  reframe (a specialized vision model) is a future enhancement.
- Output `CLIP_WIDTH`×`CLIP_HEIGHT` (default 1080×1920), h264 + aac, faststart.

## 2. Data
`Clip` (N per Video): `index`, `title`, `startSec`, `endSec`, `aspectRatio`,
`status` (QUEUED/RENDERING/READY/FAILED), `storageKey`, `sizeBytes`, `width`,
`height`, `durationSec`, `failReason`. Migration `20260719233247_clips`.

## 3. API / Events
- `GET /videos/:id/clips` · `GET /videos/:id/clips/:clipId/playback-url` (signed)
  · `DELETE /videos/:id/clips/:clipId` · `POST /videos/:id/clips/retry`
  (re-publishes `HighlightsDetected` via the outbox → regenerates).
- `HighlightsDetected` (producer: highlights job) → **consumer: clip worker** →
  `ClipGenerated` per clip (no consumer yet; export phase). DLQ `clips.dlq`.

## 4. UI
Clips panel in the player: grid of 9:16 clips with status; when `READY`, inline
play (signed URL) + download; "Generate/Regenerate clips" button. Status polling.

## 14. AI cost
**$0 LLM** — clip generation is pure FFmpeg (deterministic) + compute. No tokens.

## Deliverables
`Clip` model + migration · `ClipGenerated` contract + topology · reframe filter ·
clip worker (cut + reframe + upload) · third worker consumer · clips endpoints +
retry · clips UI (play/download) · this spec.
