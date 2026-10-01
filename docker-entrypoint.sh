#!/bin/sh
# Entrypoint của ảnh Docker: áp migration còn thiếu rồi chạy API.
# Dùng DIRECT_URL (prisma.config.ts) cho migrate; runtime dùng DATABASE_URL (pooled).
set -eu

echo "[entrypoint] prisma migrate deploy"
node_modules/.bin/prisma migrate deploy

echo "[entrypoint] start API (PORT=${PORT:-3000})"
exec node dist/main.js
