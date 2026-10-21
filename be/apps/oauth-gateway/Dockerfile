# syntax=docker/dockerfile:1.7

FROM node:26-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@12.3.2

FROM base AS builder
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY be/apps/oauth-gateway/package.json be/apps/oauth-gateway/package.json
COPY patches ./patches
RUN pnpm fetch --filter '@afilmory/oauth-gateway...'

COPY . .

RUN pnpm install --filter '@afilmory/oauth-gateway...' --frozen-lockfile
RUN pnpm --filter @afilmory/oauth-gateway build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /workspace/be/apps/oauth-gateway/dist ./dist

EXPOSE 8790

CMD ["node", "./dist/main.js"]
