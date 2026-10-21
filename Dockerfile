# Dockerfile for Next.js app in a pnpm monorepo
# This Dockerfile should be built from the root of the monorepo:
# > docker build -t photo-gallery-ssr -f apps/ssr/dockerfile .

# -----------------
# Base stage
# -----------------
FROM node:26-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@12.3.2

# -----------------
# Builder stage
# -----------------
FROM base AS builder

RUN apk update && apk add --no-cache git perl
COPY . .
RUN sh ./scripts/preinstall.sh
# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy zeroperl.wasm to web public directory before build.
# @uswriting/exiftool depends on @6over3/zeroperl-ts which loads zeroperl.wasm via fetch("./zeroperl.wasm")
# relative to the current page URL, so it must be available under both root and /photos/ paths.
RUN mkdir -p apps/web/public/photos && \
    find node_modules -name "zeroperl.wasm" -path "*/esm/*" -exec cp {} apps/web/public/ \; -exec cp {} apps/web/public/photos/ \; -quit

ARG S3_ACCESS_KEY_ID
ARG S3_SECRET_ACCESS_KEY
ARG GIT_TOKEN
ARG PG_CONNECTION_STRING
# Build the app.
# The build script in the ssr package.json handles building the web app first.
RUN pnpm --filter=@afilmory/ssr build

# -----------------
# Runner stage
# -----------------
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
# ENV PORT and other configurations are now in the config files
# and passed through environment variables during runtime.
RUN apk add --no-cache curl wget
# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

USER nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/ssr/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/ssr/.next/static /app/apps/ssr/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/ssr/public /app/apps/ssr/public

# The standalone output includes the server.js file.
# The PORT environment variable is automatically used by Next.js.
EXPOSE 3000

CMD ["node", "apps/ssr/server.js"]
