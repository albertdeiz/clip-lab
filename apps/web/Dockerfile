# --- build ---
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @clip-lab/web build

# --- runtime ---
FROM node:22-bookworm-slim AS runtime
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo ./
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
