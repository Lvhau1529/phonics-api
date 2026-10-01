# syntax=docker/dockerfile:1.7
# Ảnh production của API. Build context = gốc repo:
#   docker build -t phonics-api .
ARG NODE_IMAGE=node:24-alpine

# ---------- base: Node + pnpm (corepack) ----------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate
WORKDIR /repo

# ---------- deps: chỉ manifest + lockfile để cache layer cài đặt ----------
FROM base AS deps
# argon2 / @swc/core có prebuilt cho musl; toolchain chỉ để fallback khi thiếu binary
RUN apk add --no-cache python3 make g++
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- build: contracts → prisma generate + nest build (swc) → chỉ giữ dependency production ----------
FROM deps AS build
COPY . .
RUN pnpm build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod
# Tải schema engine của Prisma (cần cho `migrate deploy`) ngay lúc build để runtime không phải tải về.
# `migrate diff --from-empty` không kết nối DB; DIRECT_URL giả chỉ để prisma.config.ts nạp được.
RUN DIRECT_URL=postgresql://build:build@localhost:5432/build \
    node_modules/.bin/prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > /dev/null \
 && sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
# node_modules production (symlink tương đối tới packages/contracts) + dist + prisma
COPY --from=build --chown=node:node /repo/package.json /repo/prisma.config.ts /repo/docker-entrypoint.sh ./
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=node:node /repo/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=node:node /repo/dist ./dist
COPY --from=build --chown=node:node /repo/prisma ./prisma
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
