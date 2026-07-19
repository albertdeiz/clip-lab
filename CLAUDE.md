# CLAUDE.md — Working guide for ClipLab

Operating context for working in this repository. Also read [`DESIGN.md`](./DESIGN.md)
(architecture), [`docs/ROADMAP.md`](./docs/ROADMAP.md) (phases) and
[`docs/COST.md`](./docs/COST.md) (AI cost efficiency).

## What it is

ClipLab is an OpusClip competitor: it turns long videos into short viral clips
(AI detection, reframing, captions, export). It is built in **vertical
iterations** — each phase leaves the product working end-to-end.

## Current status

- **Phases 1–3 done and verified E2E**: ingestion (auth + resumable multipart
  upload + ffprobe metadata + player), automatic transcription (Whisper +
  RabbitMQ), and AI highlight detection (hierarchical LLM pipeline). Plus
  retries (auto backoff + manual).
- **Next**: Phase 4 — Clip generation (FFmpeg: precise cut per highlight +
  9:16 reframe). See [`docs/ROADMAP.md`](./docs/ROADMAP.md).

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

> The **worker** needs `python3` + `faster-whisper` (self-hosted Whisper) and uses
> the npm-bundled `ffmpeg`. Model configurable via `WHISPER_MODEL`
> (`tiny.en`/`base` in dev; `medium`/`large-v3` with GPU in prod).
>
> **Highlight detection** (Phase 3) requires `ANTHROPIC_API_KEY` in `.env`.
> Without it, the highlights job ends `FAILED` with a clear reason. Configurable
> models: `HIGHLIGHT_LOCAL_MODEL` (Haiku), `HIGHLIGHT_GLOBAL_MODEL` (Sonnet).

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
