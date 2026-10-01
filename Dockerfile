# syntax=docker/dockerfile:1.7
# Ảnh production của API. Build context là THƯ MỤC GỐC repo (cần pnpm-lock.yaml + workspace):
#   docker build -f apps/api/Dockerfile -t phonics-api .
# Ignore file: apps/api/Dockerfile.dockerignore (BuildKit đọc file cùng tên cạnh Dockerfile).
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
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @phonics/api...

# ---------- build: contracts → prisma generate + nest build (swc) → pnpm deploy ----------
FROM deps AS build
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @phonics/contracts build \
 && pnpm --filter @phonics/api build \
 && pnpm --filter @phonics/api deploy --prod --legacy /out/api
# Tải schema engine của Prisma (cần cho `migrate deploy`) ngay lúc build để runtime không phải tải về.
# `migrate diff --from-empty` không kết nối DB; DIRECT_URL giả chỉ để prisma.config.ts nạp được.
RUN cd /out/api \
 && DIRECT_URL=postgresql://build:build@localhost:5432/build \
    node_modules/.bin/prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > /dev/null \
 && sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
# /out/api: package.json + node_modules production (kèm @phonics/contracts đã build) + dist + prisma + prisma.config.ts
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
