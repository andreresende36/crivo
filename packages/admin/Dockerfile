# =============================================================================
# Crivo Admin — Dockerfile (pnpm workspace)
# Next.js standalone build
# =============================================================================

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
# Copy workspace manifests (root + packages needed by admin)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/admin/package.json ./packages/admin/
COPY packages/types-ts/package.json ./packages/types-ts/
RUN pnpm install --frozen-lockfile --filter "@crivo/admin..." --filter "@crivo/types"

# --- Build types first ---
COPY packages/types-ts/ ./packages/types-ts/
RUN pnpm --filter "@crivo/types" build

# --- Build admin ---
FROM base AS builder
WORKDIR /app
# Copy workspace manifests so pnpm/next can resolve the workspace
COPY --from=deps /app/pnpm-workspace.yaml ./
COPY --from=deps /app/package.json ./
COPY --from=deps /app/pnpm-lock.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/admin/node_modules ./packages/admin/node_modules
COPY --from=deps /app/packages/types-ts/dist ./packages/types-ts/dist
COPY --from=deps /app/packages/types-ts/package.json ./packages/types-ts/
COPY packages/admin/ ./packages/admin/
RUN pnpm --filter "@crivo/admin" build

# --- Production ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/packages/admin/public ./packages/admin/public
COPY --from=builder --chown=nextjs:nodejs /app/packages/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/admin/.next/static ./packages/admin/.next/static

USER nextjs
EXPOSE 3000
WORKDIR /app/packages/admin
CMD ["node", "server.js"]
