# --- build ---
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @clip-lab/db generate
RUN pnpm --filter @clip-lab/worker build

# --- runtime ---
FROM node:22-bookworm-slim AS runtime
# Python + faster-whisper (motor de transcripción self-hosted).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip \
    && pip3 install --no-cache-dir --break-system-packages faster-whisper \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production
# WHISPER_MODEL puede sobreescribirse; en prod con GPU usar 'medium'/'large-v3'
ENV WHISPER_MODEL=base
COPY --from=build /repo ./
WORKDIR /repo/apps/worker
CMD ["node", "dist/main.js"]
