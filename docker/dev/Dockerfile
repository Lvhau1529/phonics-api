# Ảnh DEV của API (docker-compose.dev.yml) — KHÔNG dùng cho production (xem Dockerfile ở gốc repo).
# Chỉ chứa Node + pnpm; mã nguồn được bind mount vào /repo, node_modules nằm trong volume riêng của container
# (binary native argon2 / swc của Linux không lẫn với node_modules trên máy dev — macOS / Windows / WSL đều chạy được).
ARG NODE_IMAGE=node:24.22.1-bookworm-slim
FROM ${NODE_IMAGE}
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@12.8.1
# Tạo sẵn điểm gắn volume (node_modules, pnpm store) thuộc user node — volume mới sẽ kế thừa quyền này
RUN mkdir -p /repo/node_modules /repo/packages/contracts/node_modules /pnpm-store \
 && chown -R node:node /repo /pnpm-store
USER node
WORKDIR /repo
EXPOSE 3000
ENTRYPOINT ["sh", "/usr/local/bin/dev-entrypoint.sh"]
