# syntax=docker/dockerfile:1.7

ARG BUN_IMAGE=oven/bun:1.3.14-slim@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5

FROM --platform=$BUILDPLATFORM ${BUN_IMAGE} AS workspace-deps
WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY packages/bigint-buffer/package.json ./packages/bigint-buffer/package.json
COPY packages/chain-solana/package.json ./packages/chain-solana/package.json

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM workspace-deps AS backend-build

COPY packages ./packages
COPY backend ./backend

RUN bun run packages:build \
    && bun run prisma:generate \
    && bun run backend:build

FROM ${BUN_IMAGE} AS backend
WORKDIR /app/backend

ENV NODE_ENV=production \
    PORT=4000

COPY --from=backend-build --chown=bun:bun /app/package.json /app/bun.lock /app/
COPY --from=backend-build --chown=bun:bun /app/node_modules /app/node_modules
COPY --from=backend-build --chown=bun:bun /app/backend/node_modules ./node_modules
COPY --from=backend-build --chown=bun:bun /app/backend/package.json ./package.json
COPY --from=backend-build --chown=bun:bun /app/backend/dist ./dist
COPY --from=backend-build --chown=bun:bun /app/backend/prisma ./prisma
COPY --from=backend-build --chown=bun:bun /app/packages/chain-solana /app/packages/chain-solana
COPY --from=backend-build --chown=bun:bun /app/packages/bigint-buffer /app/packages/bigint-buffer

USER bun

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD bun --eval "fetch('http://127.0.0.1:4000/api/health').then(response=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "dist/main.js"]

FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS frontend-build
COPY --from=workspace-deps /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY packages/bigint-buffer/package.json ./packages/bigint-buffer/package.json
COPY packages/chain-solana/package.json ./packages/chain-solana/package.json

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

COPY packages ./packages
COPY frontend ./frontend

ARG BACKEND_INTERNAL_URL=http://backend:4000
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_BACKEND_URL=""
ARG NEXT_PUBLIC_APP_URL=https://veriagentpay.xyz
ARG NEXT_PUBLIC_APP_DOMAIN=veriagentpay.xyz
ARG NEXT_PUBLIC_ASSET_PREFIX=""
ARG NEXT_PUBLIC_EXPLORER_URL=https://explorer.solana.com
ARG NEXT_PUBLIC_HK2026_START=""
ARG NEXT_PUBLIC_HK2026_END=""
ARG NEXT_PUBLIC_RP_ID=veriagentpay.xyz
ARG NEXT_PUBLIC_SOLANA_CLUSTER=devnet
ARG NEXT_PUBLIC_SOLANA_EXPLORER_URL=https://explorer.solana.com
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=VeriAgentPayBot
ARG NEXT_PUBLIC_WS_URL=""

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL} \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_APP_DOMAIN=${NEXT_PUBLIC_APP_DOMAIN} \
    NEXT_PUBLIC_ASSET_PREFIX=${NEXT_PUBLIC_ASSET_PREFIX} \
    NEXT_PUBLIC_EXPLORER_URL=${NEXT_PUBLIC_EXPLORER_URL} \
    NEXT_PUBLIC_HK2026_START=${NEXT_PUBLIC_HK2026_START} \
    NEXT_PUBLIC_HK2026_END=${NEXT_PUBLIC_HK2026_END} \
    NEXT_PUBLIC_RP_ID=${NEXT_PUBLIC_RP_ID} \
    NEXT_PUBLIC_SOLANA_CLUSTER=${NEXT_PUBLIC_SOLANA_CLUSTER} \
    NEXT_PUBLIC_SOLANA_EXPLORER_URL=${NEXT_PUBLIC_SOLANA_EXPLORER_URL} \
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=${NEXT_PUBLIC_TELEGRAM_BOT_USERNAME} \
    NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}

RUN bun run packages:build \
    && bun run frontend:build

FROM ${NODE_IMAGE} AS frontend
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=frontend-build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=frontend-build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
COPY --from=frontend-build --chown=node:node /app/frontend/public ./frontend/public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "Promise.all(['/', '/onboard'].map(path=>fetch('http://127.0.0.1:3000'+path))).then(responses=>process.exit(responses.every(response=>response.ok)?0:1)).catch(()=>process.exit(1))"

CMD ["node", "frontend/server.js"]