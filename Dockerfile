# SEC-INFRA-002 + SEC-INFRA-AGENT13-003 (2026-05-09): digest-pin base image.
# Tag-pinning alone is mutable - the same tag can point to a different image
# at any time. Digest-pinning makes the build immutable; bump digest
# intentionally when upgrading Node. Captured 2026-05-10 from registry-1.docker.io.
FROM node:22-slim@sha256:9f6d5975c7dca860947d3915877f85607946403fc55349f39b4bc3688448bb6e AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

# ── pgvector build stage ─────────────────────────────────────────────────────
# node:22-slim is Debian bookworm-slim. postgresql-server-dev-all is available
# via the official Debian bookworm postgresql packages. We compile pgvector
# v0.8.0 from source and install it so the embedded Postgres instance can load
# the extension with CREATE EXTENSION vector.
#
# Note: this build stage is separate so the build tools are not present in the
# final production image — only the compiled .so and sql/control files are
# copied across.
FROM base AS pgvector-build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    postgresql-server-dev-all \
    git \
  && git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git /tmp/pgvector \
  && cd /tmp/pgvector && make && make install \
  && apt-get purge -y build-essential git \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/* /tmp/pgvector

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY cli/package.json cli/
COPY server/package.json server/
COPY ui/package.json ui/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/adapter-utils/package.json packages/adapter-utils/
COPY packages/mcp-client/package.json packages/mcp-client/
COPY packages/adapters/anthropic-api/package.json packages/adapters/anthropic-api/
COPY packages/adapters/claude-local/package.json packages/adapters/claude-local/
COPY packages/adapters/codex-local/package.json packages/adapters/codex-local/
COPY packages/adapters/cursor-local/package.json packages/adapters/cursor-local/
COPY packages/adapters/gemini-local/package.json packages/adapters/gemini-local/
COPY packages/adapters/openai-api/package.json packages/adapters/openai-api/
COPY packages/adapters/openclaw-gateway/package.json packages/adapters/openclaw-gateway/
COPY packages/adapters/opencode-local/package.json packages/adapters/opencode-local/
COPY packages/adapters/openrouter-api/package.json packages/adapters/openrouter-api/
COPY packages/adapters/pi-local/package.json packages/adapters/pi-local/
COPY packages/adapters/poe-api/package.json packages/adapters/poe-api/
COPY patches/ patches/

RUN pnpm install --no-frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app /app
COPY . .
RUN pnpm --filter @ironworksai/shared build
RUN pnpm --filter @ironworksai/db build
RUN pnpm --filter @ironworksai/ui build
RUN pnpm --filter @ironworksai/server build
RUN test -f server/dist/index.js || (echo "ERROR: server build output missing" && exit 1)

FROM base AS production
WORKDIR /app
COPY --chown=node:node --from=build /app /app
# AI CLI tools — versions pinned for supply-chain safety; bump intentionally when upgrading
RUN npm install --global --omit=dev @anthropic-ai/claude-code@2.1.92 @openai/codex@0.118.0 @google/gemini-cli@0.39.0 opencode-ai@0.3.1 \
  && mkdir -p /ironworks \
  && chown node:node /ironworks

# Copy pgvector extension files from the build stage into the system Postgres
# extension directory. The embedded Postgres instance will pick these up when
# CREATE EXTENSION vector is called. The postgresql-server-dev-all install above
# put them under /usr/share/postgresql/<version>/extension and
# /usr/lib/postgresql/<version>/lib - we copy both trees.
#
# We also need libpq at runtime (already present in node:22-slim via libpq5 dep
# of postgresql-client). The .so file requires postgresql-common at runtime;
# install only the runtime dependency here (no dev headers).
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-common openssh-client jq \
  && rm -rf /var/lib/apt/lists/*
COPY --from=pgvector-build /usr/share/postgresql /usr/share/postgresql
COPY --from=pgvector-build /usr/lib/postgresql /usr/lib/postgresql

ENV NODE_ENV=production \
  HOME=/ironworks \
  HOST=0.0.0.0 \
  PORT=3100 \
  SERVE_UI=true \
  IRONWORKS_HOME=/ironworks \
  IRONWORKS_INSTANCE_ID=default \
  IRONWORKS_CONFIG=/ironworks/instances/default/config.json \
  IRONWORKS_DEPLOYMENT_MODE=authenticated \
  IRONWORKS_DEPLOYMENT_EXPOSURE=private

VOLUME ["/ironworks"]
EXPOSE 3100

# SEC-INFRA-HIGH-006 fix (2026-05-09): without HEALTHCHECK, crash-loops mask
# as healthy outside compose (release-smoke harness, k8s, anything that
# inspects container health rather than process state). Curl-based check
# against /api/health gives both orchestrator + ops a real signal.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3100/api/health || exit 1

USER node
CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
