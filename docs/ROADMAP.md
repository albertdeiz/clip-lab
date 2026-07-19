# Roadmap

Each phase is a deployable **Vertical Slice**: Frontend → API → Persistence →
Processing → Visible result. Moving on with something incomplete is forbidden.
Scoring scale: **1 = low, 5 = high**.

Order by the value critical path: `upload → transcribe → detect → cut →
caption → export`. Auth/infra/bus first by dependency; billing and scaling
(K8s/Kafka) last because they are optimizations that need real traction.

---

## Phase 1 — Video ingestion (E2E foundation) — done
- **Objective:** register, upload a long video, and view/play it.
- **Success:** upload 2 GB without timeout; resume; see metadata; play; all behind login.

| Feature | Value | Crit. | Compl. | Deps | Est. |
|---|---|---|---|---|---|
| Auth (email + Google OAuth) | 4 | 5 | 2 | — | 3 d |
| Monorepo + local infra + CI | 3 | 5 | 3 | — | 3 d |
| Resumable presigned multipart upload | 5 | 5 | 3 | Auth, infra | 4 d |
| Metadata + probe (ffprobe) | 4 | 4 | 2 | Upload | 2 d |
| Dashboard + Player | 4 | 4 | 2 | Upload | 3 d |

## Phase 2 — Automatic transcription (first worker + first event) — done
- **Objective:** transcribe every video and show a synced transcript.
- **Success:** word-level with timestamps; click seeks the video; language autodetected.

| Feature | Value | Crit. | Compl. | Deps | Est. |
|---|---|---|---|---|---|
| RabbitMQ event bus + DLQ + outbox relay | 5 | 5 | 3 | Phase 1 | 3 d |
| Transcription Worker (Whisper) | 5 | 5 | 4 | Bus | 4 d |
| Live progress | 4 | 3 | 3 | Bus | 3 d |
| Synced transcript UI | 4 | 4 | 3 | Worker | 3 d |

## Phase 3 — AI highlight detection — done
- **Objective:** the LLM proposes viral moments with score and reason (hierarchical pipeline).
- **Success:** ≥5 highlights per 30-min video with score, title and justification.

| Feature | Value | Crit. | Compl. | Deps | Est. |
|---|---|---|---|---|---|
| Highlight Worker (hierarchical LLM) | 5 | 5 | 4 | Phase 2 | 5 d |
| Highlights data model + AI artifact | 4 | 4 | 2 | — | 2 d |
| Highlights UI | 5 | 4 | 3 | Worker | 4 d |

## Phase 4 — Clip generation (FFmpeg + 9:16 reframe) — done
| Feature | Value | Crit. | Compl. | Deps | Est. |
|---|---|---|---|---|---|
| Clip Worker (FFmpeg, precise cut) | 5 | 5 | 4 | Phase 3 | 5 d |
| Auto-reframe 9:16 (subject detection) | 4 | 3 | 4 | Clip Worker | 4 d |
| Clips UI | 4 | 4 | 2 | Worker | 3 d |

## Phase 5 — Animated captions (word-level karaoke)
| Feature | Value | Crit. | Compl. | Deps | Est. |
|---|---|---|---|---|---|
| Caption rendering (ASS/libass) | 5 | 4 | 4 | Phase 4 + transcript | 5 d |
| Style templates + editor | 4 | 3 | 3 | — | 4 d |

## Phase 6 — Export & download / share
| Feature | Value | Crit. | Compl. | Deps | Est. |
|---|---|---|---|---|---|
| Render Worker (NVENC) | 5 | 5 | 4 | Phase 5 | 4 d |
| Download + share link | 4 | 4 | 2 | Render | 2 d |

## Later backlog
Virality refinement (feedback loop) · B-roll · Brand kit/templates ·
Multi-format (1:1, 16:9) · Scheduled publishing to social · Billing/plans +
quotas · Teams/collaboration · Kafka + analytics/event sourcing · K8s +
GPU autoscaling.
