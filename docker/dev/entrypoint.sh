#!/bin/sh
# Container API dev: cài deps (no-op nếu lockfile không đổi) → build contracts + prisma generate → migrate → seed → watch.
set -eu

echo "[dev] pnpm install"
pnpm install --frozen-lockfile --store-dir /pnpm-store

echo "[dev] build contracts + prisma generate"
pnpm build:contracts
pnpm prisma:generate

echo "[dev] prisma migrate deploy"
pnpm prisma:deploy

echo "[dev] prisma db seed (idempotent; SEED_DEMO=${SEED_DEMO:-false})"
pnpm db:seed

echo "[dev] nest start --watch"
exec pnpm dev
