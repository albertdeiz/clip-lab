# CLAUDE.md — Working guide for ClipLab

Operating context for working in this repository. Also read [`DESIGN.md`](./DESIGN.md)
(architecture), [`docs/ROADMAP.md`](./docs/ROADMAP.md) (phases) and
[`docs/COST.md`](./docs/COST.md) (AI cost efficiency).

## What it is

ClipLab is an OpusClip competitor: it turns long videos into short viral clips
(AI detection, reframing, captions, export). It is built in **vertical
iterations** — each phase leaves the product working end-to-end.

## Current status

- **Phases 1–4 done and verified E2E**: ingestion (auth + resumable multipart
  upload + ffprobe metadata + player), automatic transcription (Whisper +
  RabbitMQ), AI highlight detection, and clip generation (FFmpeg precise cut +
  9:16 reframe, incl. multi-segment "summary" clips). Plus a transcript-centric
  clip editor (decorators + context + shortcuts), retries (auto backoff +
  manual) and a provider-agnostic AI layer.
- **Phase 7 done**: generation is **on-demand and parameterized**
  (`GenerationConfig` + settings panel; `HighlightsRequested` event) and uses
  **single-pass whole-transcript analysis** (complete "lines of thought", with a
  semantic-sectioning fallback for very long videos; equal-time chunking dropped).
  Spec: [`docs/iterations/fase-7-generacion-on-demand.md`](./docs/iterations/fase-7-generacion-on-demand.md).
- **Later**: Phase 5 — Animated captions (word-level karaoke). See
  [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Monorepo structure

```
apps/
  api/         NestJS 10 + Fastify — auth, uploads, videos, health, outbox relay
  web/         Next.js 15 + React 19 + Tailwind — dashboard, uploader, player
  worker/      Transcription + highlights worker — RabbitMQ → FFmpeg → faster-whisper → LLM
packages/
  contracts/   Zod: API and event contracts (SINGLE SOURCE OF TRUTH FE/BE)
  db/          Prisma schema + client + migrations
  config/      Env schema validated with Zod (fail-fast at boot)
infra/
  docker-compose.yml   postgres · redis · rabbitmq · minio (+ private bucket)
docs/          Roadmap, cost policy, iteration specs
```

Package manager: **pnpm 10** + **Turborepo**. Node **>=22**.

## Commands

```bash
cp .env.example .env       # local variables (dev)
pnpm infra:up              # starts postgres/redis/rabbitmq/minio
pnpm install
pip3 install faster-whisper   # prerequisite for the transcription worker
pnpm db:generate           # generate the Prisma client
pnpm db:migrate            # apply/create migrations (dev)
pnpm dev                   # starts api (4000) + web (3000) + worker
pnpm build                 # build everything in dependency order
pnpm typecheck             # tsc --noEmit across all packages
pnpm db:deploy             # migrate deploy (CI/prod)
```

Ports: web `3000`, api `4000`, postgres `5432`, redis `6379`,
rabbitmq `5672`/`15672`, minio `9000`/`9001`.
Useful endpoints: `GET /health/ready`, Swagger at `/docs`.

### AI providers (generic registry, configurable per process via env)

AI is provider-agnostic and selectable **per process** by env vars — use any
model from any vendor without code changes, and mix vendors across processes.
Abstractions live in `apps/worker/src/ai/`: a common `LlmProvider` /
`TranscriptionProvider` interface, provider kinds `anthropic` (native) and
`openai` (OpenAI-compatible), and a **provider registry** (`ai/registry.ts`).

Known presets — you only set the API key and select by name:
`anthropic`, `openai`, `deepseek`, `kimi`/`moonshot`, `qwen`/`dashscope`,
`groq`, `openrouter`, `together`, `ollama`. Each reads its own key var
(`DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY`, `DASHSCOPE_API_KEY`, `GROQ_API_KEY`, …).

Any other vendor / self-hosted / tunneled (ngrok, vLLM) → use a free name plus
the **per-process** `<PROCESS>_BASE_URL` + `<PROCESS>_API_KEY` (these also
override a preset's base/key for that process).

```bash
# preset credentials (set only the ones you use)
ANTHROPIC_API_KEY=...
DEEPSEEK_API_KEY=...
MOONSHOT_API_KEY=...        # kimi
DASHSCOPE_API_KEY=...       # qwen

# process: transcription  (faster-whisper local, or any openai-compatible name)
TRANSCRIPTION_PROVIDER=faster-whisper        # faster-whisper | openai | groq | custom-name
WHISPER_MODEL=base                           # faster-whisper (tiny.en/base dev; medium/large-v3 prod GPU)
TRANSCRIPTION_MODEL=whisper-large-v3         # for API providers
# TRANSCRIPTION_BASE_URL / TRANSCRIPTION_API_KEY  → override or custom endpoint

# process: highlights local  (e.g. DeepSeek) and global  (e.g. Kimi) — different vendors OK
HIGHLIGHT_LOCAL_PROVIDER=deepseek
HIGHLIGHT_LOCAL_MODEL=deepseek-chat
HIGHLIGHT_GLOBAL_PROVIDER=kimi
HIGHLIGHT_GLOBAL_MODEL=moonshot-v1-8k
# HIGHLIGHT_GLOBAL_BASE_URL / HIGHLIGHT_GLOBAL_API_KEY  → override or custom endpoint

# example custom / self-hosted via ngrok:
# HIGHLIGHT_GLOBAL_PROVIDER=my-vllm
# HIGHLIGHT_GLOBAL_BASE_URL=https://abc123.ngrok.app/v1
# HIGHLIGHT_GLOBAL_API_KEY=local
# HIGHLIGHT_GLOBAL_MODEL=qwen2.5-32b-instruct
```

> The **worker** needs `python3` + `faster-whisper` only when
> `TRANSCRIPTION_PROVIDER=faster-whisper`; it uses the npm-bundled `ffmpeg`. If a
> selected process's credential/base URL is missing, its job ends `FAILED` with a
> clear reason (non-retryable). Add a new preset by adding one line to
> `ai/registry.ts`; arbitrary endpoints need no code change.

## Conventions

- **Strict TypeScript** across the repo (`tsconfig.base.json`).
- **`packages/contracts` is the single source of truth** for request/response
  and event payloads. FE and BE import from it; do not redefine equivalent types.
- **Internal packages compile to `dist` (CommonJS)** and are consumed via their
  `exports`. Never point `main` at `src` (breaks at runtime).
- **API errors** use the uniform shape `{ error: { code, message, details? } }`.
- **Env validated with Zod** at startup (`@clip-lab/config`); if a critical
  variable is missing, the process fails fast.
- **Event-driven via transactional outbox**: domain events are written to
  `OutboxEvent` in the same transaction that mutates state. A relay publishes
  them to RabbitMQ.

## Hard rules (non-negotiable)

1. **Vertical E2E slices**: every feature goes Frontend → API → Persistence →
   Processing → Visible result. Do not move on if the previous one isn't done.
2. **Forbidden** to ship `TODO`, `pending`, `mock`, `stub`, or
   "we'll do this later". Everything ships production-ready.
3. **AI cost efficiency = functional requirement**, not a later optimization.
   Before any LLM call, apply the *decision gate* in
   [`docs/COST.md`](./docs/COST.md). The LLM only reasons; deterministic work
   goes to algorithms/FFmpeg/Whisper.
4. **Verify by running, not just compiling**: changes with a runtime surface are
   tested by starting what's affected and observing behavior.
5. **Commits without AI references**: conventional commit messages, no mention
   of AI/models nor co-authorship trailers.
6. **Iteration-based work with approval**: at the end of an iteration, wait for
   the user's approval before continuing the next.

## Stack (summary; detail in DESIGN.md)

Next.js · React · TypeScript · Tailwind · NestJS (on Fastify) · PostgreSQL
(Prisma) · Redis · RabbitMQ · S3-compatible (MinIO in dev) · FFmpeg · Whisper ·
LLM (Claude) for reasoning · embeddings for semantic search.
