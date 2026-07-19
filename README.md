# ClipLab

An OpusClip competitor built in vertical iterations (each phase leaves the
product working E2E). pnpm + Turborepo monorepo.

## Stack

- **Frontend**: Next.js 15 · React 19 · TypeScript · Tailwind
- **Backend**: NestJS 10 on Fastify · TypeScript
- **Data**: PostgreSQL (Prisma 6) · Redis
- **Storage**: S3-compatible (MinIO in dev)
- **Messaging**: RabbitMQ (event bus + queues)
- **Video/AI**: FFmpeg · Whisper (self-hosted) · LLM (Claude) for reasoning

## Structure

```
apps/
  api/         NestJS + Fastify (auth, uploads, videos, outbox relay)
  web/         Next.js (dashboard, uploader, player, transcript & highlights)
  worker/      Transcription (Whisper) + highlight detection (LLM)
packages/
  contracts/   API and event contracts (Zod) — FE/BE source of truth
  db/          Prisma schema + client
  config/      Env schema validated with Zod
infra/
  docker-compose.yml   postgres · redis · rabbitmq · minio
```

## Getting started (dev)

```bash
# 1. Requirements: Node >=22, pnpm 10, Docker, python3
cp .env.example .env

# 2. Local infra (Postgres, Redis, RabbitMQ, MinIO + private bucket)
pnpm infra:up

# 3. Dependencies
pnpm install
pip3 install faster-whisper       # transcription worker prerequisite

# 4. Prisma client + migrations
pnpm db:generate
pnpm db:deploy

# 5. Start everything (api + web + worker)
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000 · Health: `/health/ready` · OpenAPI docs: `/docs`
- MinIO console: http://localhost:9001 (cliplab / cliplab-secret)
- RabbitMQ console: http://localhost:15672 (cliplab / cliplab)

To enable AI highlight detection, set `ANTHROPIC_API_KEY` in `.env`.

## Roadmap

1. **Ingestion** (auth, multipart upload, metadata, player) — done
2. **Transcription** (Whisper + RabbitMQ) — done
3. **Highlight detection** (hierarchical LLM) — done
4. Clip generation (FFmpeg + 9:16 reframe)
5. Animated captions
6. Export & download
