# Iteration 2 — Automatic transcription

**Objective:** when a video is uploaded, it is transcribed automatically with
Whisper and the user sees the **word-level** transcript synced with the player
(click a word → seek the video), with visible progress.

**Status:** implemented and verified E2E (upload → outbox → RabbitMQ → worker →
FFmpeg → faster-whisper → transcript `DONE` with timestamps; synced UI).

---

## 1. PRD
- **US:** as a user I want my videos transcribed automatically and to see the
  synced text to navigate the content.
- **Criteria:** word-level transcript with timestamps + autodetected language;
  states `QUEUED → TRANSCRIBING → DONE/FAILED`; clicking a word seeks; idempotent
  (does not re-transcribe a video already `DONE`); failure → `FAILED` + reason.

## 2. Technical design
- **Real event-driven bus:** the `VideoUploaded` that Phase 1 already wrote to
  the **outbox** is now published to RabbitMQ via a **relay** (`@Interval`),
  lighting up the consumer. Topic exchange `clip.events` + DLX + DLQ.
- **Self-hosted worker** (`apps/worker`, separate Node process): consumes
  `VideoUploaded`, downloads the S3 object, extracts audio (FFmpeg 16kHz mono),
  transcribes with **faster-whisper** (Python subprocess, CTranslate2, CPU in dev
  / GPU in prod), persists `Transcript` and publishes `TranscriptGenerated`.
- **Progress:** the client **polls** `GET /videos/:id/transcript` (the DB is the
  source of truth). *Deliberate deviation vs. the roadmap's WebSocket:* polling
  delivers the same outcome (visible progress) with far less complexity and is
  verifiable; SSE/WS remains an enhancement.

## 3-4. Architecture
```
Upload(complete) ─outbox─▶ OutboxRelay ─▶ RabbitMQ(clip.events)
   │                                          │ routing: VideoUploaded
   ▼                                          ▼
 Video READY                        transcription.jobs ─▶ Worker
                                                            │ S3 get → ffmpeg wav → faster-whisper
                                                            ▼
                                             Transcript(DONE) + TranscriptGenerated
```
The worker scales horizontally (prefetch 1 per instance); independent GPU in prod.

## 5. Data model
`Transcript` (1–1 with `Video`): `status`, `language`, `model`, `text`,
`words` (word-level JSON `{w,start,end}`), `contentHash` (cache/incremental),
`failReason`. Migration `20260719203309_transcript`.

## 6. API
`GET /videos/:id/transcript` → `{ status, language, model, text, words[], failReason }`
(owner-based authorization). Zod contracts in `packages/contracts`.

## 7. Events
`VideoUploaded` (producer: outbox relay) → **consumer: worker**.
`TranscriptGenerated` (producer: worker) → no consumer yet (Phase 3).
At-least-once; idempotency by `videoId`/`eventId`; `nack`→DLX→`transcription.dlq`.

## 8. E2E flow
complete → outbox `VideoUploaded` → relay publishes → worker consumes → download +
audio + Whisper → `Transcript DONE` (+ `TranscriptGenerated`) → UI (polling) shows
status and then the synced transcript.

## 9. Tests
Verified E2E with a real speech clip (TTS): `DONE`, language `en`, text + words
with timestamps. Failure path → `FAILED`. (Automated suite: at phase close.)

## 10-13. Cross-cutting
- **Observability:** worker logs per job; states in DB; DLQ for failures.
- **Security:** worker exposes no HTTP; credentials via env; temporary audio in
  `tmp` deleted after the job.
- **Scalability:** N workers with prefetch 1; the relay publishes in batches.
- **Deploy:** `apps/worker/Dockerfile` (Node + python3 + faster-whisper). In prod
  with GPU use `medium`/`large-v3` models.

## 14. AI cost
**$0 LLM** in this phase (transcription uses no LLM). Whisper runs on own infra →
cost = compute (CPU/GPU), not per-token inference. `contentHash` enables caching
and incremental reprocessing (don't re-transcribe what's already done).

## 15. Deliverables
Event/topology contracts · `Transcript` migration · outbox relay ·
`MessagingModule` · transcription worker · transcript endpoint · synced transcript
UI · worker Dockerfile · this spec.
