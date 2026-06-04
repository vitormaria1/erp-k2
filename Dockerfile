# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN useradd -m -u 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts/pg-db-worker.mjs ./scripts/pg-db-worker.mjs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN mkdir -p /app/data && chown -R nextjs:nextjs /app
USER nextjs

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
