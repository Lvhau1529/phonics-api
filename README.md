# phonics-api — Phonics Arcade API

NestJS 11 + Prisma 7 (PostgreSQL), chạy toàn bộ trên một VPS bằng Docker (Postgres + API + Caddy + backup). Phục vụ app game ([phonics-game](https://github.com/Lvhau1529/phonics-game)) và
trang quản trị ([phonics-admin](https://github.com/Lvhau1529/phonics-admin)):
tài khoản (local + Google), lớp học, học sinh, giáo viên, điểm / xếp hạng, thông báo, catalog game,
sự kiện xem / chơi, thống kê và xuất báo cáo (xlsx / pdf). Hợp đồng dữ liệu (zod) nằm ở
`packages/contracts` (gói `@lvhau1529/phonics-contracts`, xem [Contracts](#contracts)); mọi response của API trả đúng
shape trong đó. Tài liệu hệ thống (kiến trúc, ADR, deploy cả 3 app): repo **phonics-dev**.

## Cấu trúc

Feature-based, phụ thuộc một chiều `modules → common / core / database / infrastructure → config`
(ADR 0015, layout trong module theo ADR 0020 — phonics-dev):

```
phonics-api
├── packages/contracts/     gói hợp đồng zod dùng chung (phát hành lên GitHub Packages)
├── docs/                   api.md (bảng endpoint), erd.md
├── prisma/                 schema.prisma, migrations/ (Prisma CLI + docker-entrypoint đọc ở đây)
├── prisma.config.ts        Prisma CLI: DIRECT_URL (kết nối thẳng), lệnh seed
├── src/
│   ├── main.ts             khởi động: configureApp + Swagger + listen
│   ├── app.module.ts       ghép CoreModule + module nghiệp vụ; pipe / guard toàn cục
│   ├── bootstrap/          configure-app.ts (prefix /api, versioning, middleware, CORS, filter — dùng chung với e2e),
│   │                       swagger.ts
│   ├── config/             env.schema.ts (zod, nguồn sự thật biến môi trường), env.module.ts, constants.ts,
│   │                       api-version.ts (API_V1)
│   ├── core/               HẠ TẦNG @Global không nghiệp vụ (core.module.ts): logger/ (pino), time/ (TimeService,
│   │                       APP_TIMEZONE), access/ (AccessService — GV chỉ thấy lớp mình)
│   ├── database/           PrismaModule, PrismaService (driver adapter pg), types.ts (kiểu Tx)
│   │   └── seeds/          seed.ts (entry `prisma db seed`) + *.seed.ts theo miền (admin, games, nhóm quyền, demo)
│   ├── infrastructure/     hạ tầng ngoài nghiệp vụ: storage/ (DiskStorage — file media trên đĩa, MEDIA_DIR)
│   ├── common/             KHỐI DÙNG CHUNG cho request pipeline (không chứa nghiệp vụ)
│   │   ├── middleware/     request-id (X-Request-Id)
│   │   ├── guards/         JwtAuthGuard, RolesGuard, PermissionsGuard
│   │   ├── decorators/     @Public, @OptionalAuth, @Roles, @RequirePermission, @CurrentUser
│   │   ├── filters/        AllExceptionsFilter → envelope ApiErrorBody
│   │   ├── errors/         AppError (mã lỗi theo ErrorCode của contracts)
│   │   ├── dto/            DTO query dùng chung (phân trang, khoảng thời gian)
│   │   └── utils/          paginate
│   ├── modules/            NGHIỆP VỤ — mỗi bounded context một thư mục (chỉ tạo thư mục con khi cần):
│   │   └── <module>/
│   │       ├── <module>.module.ts
│   │       ├── controllers/     một controller / file, đặt tên theo actor: <module>.controller.ts (GV / admin),
│   │       │                    <module>-me.controller.ts (/me — học sinh), <module>-admin.controller.ts,
│   │       │                    <module>-public.controller.ts; mỗi controller khai báo `version: API_V1`
│   │       ├── services/        một service / use case: *-reader (đọc), *-writer (ghi), *-student, *-lifecycle…
│   │       │                    (+ .spec.ts cạnh service)
│   │       ├── repositories/    bọc PrismaService: mọi truy vấn Prisma / $queryRaw của module
│   │       ├── dto/requests/    DTO = createZodDto(schema contracts)
│   │       ├── dto/responses/   hàm thuần row → view đúng shape contracts (toXView, toXSummary)
│   │       ├── types/           include / payload Prisma, kiểu nội bộ, hằng sort field
│   │       ├── utils/           hàm thuần (luật nghiệp vụ, tính toán) + .spec.ts
│   │       └── jobs/ · grading/ · writers/   cron, bộ chấm, writer xlsx / pdf (riêng từng module)
│   │   auth · users · permissions · classes · teachers · students · games · events · game-results ·
│   │   points (+ RankingService) · notifications · stats · reports · audit · media · questions · worksheets ·
│   │   assignments · submissions · comments · worksheet-stats · health (không version: /api/health)
│   └── generated/          Prisma client (gitignored, `pnpm prisma:generate`)
└── test/
    ├── helpers/            create-test-app.ts (boot AppModule + configureApp cho e2e, truncateAll)
    └── e2e/                *.e2e-spec.ts (cần DATABASE_URL_TEST)
```

Không dùng TypeORM nên không có `entities/`: model nằm ở `prisma/schema.prisma`, kiểu row lấy bằng
`Prisma.XGetPayload` trong `types/`. Module nhỏ (vd `audit`, `events`) chỉ có `controllers/` + `services/`.

**Versioning:** route theo URI `/api/v1/...` (client lấy `API_PREFIX` từ contracts), version khai báo ở decorator
`@Controller({ path, version: API_V1 })`. Thêm v2 = controller mới `controllers/<tên>.v2.controller.ts`
(`version: API_V2`) + DTO trong `dto/requests/v2/`, service giữ nguyên; endpoint không đổi thì cho controller hiện có
phục vụ cả hai version (`version: [API_V1, API_V2]`). `/api/health` và Swagger `/api/docs` không có version.

## Chạy dev

```bash
cp .env.example .env      # DB mặc định = Postgres local của phonics-dev (`pnpm db` ở đó); secret ≥ 32 ký tự
pnpm install
pnpm prisma:generate      # sinh client vào src/generated
pnpm prisma:migrate       # prisma migrate dev (dùng DIRECT_URL)
pnpm db:seed              # admin + catalog game (+ dữ liệu demo nếu SEED_DEMO=true)
pnpm dev                  # build contracts rồi nest start --watch
```

- API: `http://localhost:3000/api/v1`, health `http://localhost:3000/api/health`, Swagger UI:
  `http://localhost:3000/api/docs` (JSON: `/api/docs-json`), tắt bằng `SWAGGER_ENABLED=false`.
- Lệnh khác: `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm build` (contracts + prisma generate + nest build
  bằng SWC, ra `dist/`), `pnpm start` (chạy `dist/main.js`), `pnpm prisma:studio`.
- Mọi lỗi trả về envelope `ApiErrorBody` (`statusCode`, `code`, `message`, `details?`, `requestId`); mọi response có
  header `X-Request-Id` (giữ nguyên nếu client / proxy gửi lên) — trùng với `reqId` trong log.

## Test

```bash
pnpm test        # unit (src/**/*.spec.ts) + test của contracts, không cần DB
pnpm test:e2e    # e2e (test/e2e/**/*.e2e-spec.ts), cần DATABASE_URL_TEST
```

e2e dùng một DB Postgres **riêng** (bị `TRUNCATE` trước mỗi file test): đặt biến môi trường `DATABASE_URL_TEST`
(không đọc từ `.env`), vd DB `phonics_test` mà launcher phonics-dev tạo sẵn:
`$env:DATABASE_URL_TEST='postgresql://postgres:postgres@localhost:5432/phonics_test'; pnpm test:e2e`. Helper tự `prisma migrate deploy` lên DB đó và điền các
biến bắt buộc còn thiếu (secret, admin) bằng giá trị test, nên CI không cần `.env`. Không có
`DATABASE_URL_TEST` thì các file e2e tự skip.

## Deploy bằng Docker

Ảnh multi-stage (`Dockerfile`, `node:24-alpine`, pnpm qua corepack), build context = gốc repo (`.dockerignore`).
Contracts được build cùng ảnh từ `packages/contracts` (không cần GitHub Packages).

Toàn bộ backend chạy trên **một VPS** (ADR 0024, `docker-compose.yml`): `db` (Postgres 18) + `api` + `caddy` (HTTPS) +
`backup`. Không dùng dịch vụ DB / storage bên ngoài.

### Dựng VPS lần đầu

Yêu cầu: VPS Linux (≥ 1 vCPU, 1 GB RAM, ổ đủ chứa ảnh / ghi âm), Docker Engine + plugin compose, domain (hoặc
`api.<ip>.sslip.io`) có bản ghi A trỏ về IP VPS, mở cổng 80 / 443 (đóng 5432 — Postgres không mở ra ngoài).

```bash
git clone <repo> /opt/phonics-api && cd /opt/phonics-api
cp .env.example .env.production   # sửa: NODE_ENV=production, JWT_ACCESS_SECRET, COOKIE_SECRET, ADMIN_EMAIL /
                                  # ADMIN_PASSWORD, CORS_ORIGINS (URL game + admin trên Vercel), GOOGLE_CLIENT_IDS…
                                  # Bỏ qua DATABASE_URL / DIRECT_URL / API_PUBLIC_URL / MEDIA_DIR — compose tự đặt.
# Biến của compose: domain API + mật khẩu Postgres (hex, không ký tự đặc biệt vì nằm trong URL)
printf 'API_DOMAIN=api.example.vn\nPOSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" > .env
chmod 600 .env .env.production
docker compose up -d --build                                  # db → api (prisma migrate deploy) → caddy, backup
docker compose exec api node_modules/.bin/prisma db seed      # admin + catalog game (một lần)
curl -fsS https://api.example.vn/api/health/db                # {"status":"ok",...database up}
```

Sau đó đặt `VITE_API_URL=https://api.example.vn` cho game / admin trên Vercel và thêm origin của chúng vào
`CORS_ORIGINS`.

### Vận hành

- Caddy (`Caddyfile`, service `caddy`): nhận 80 / 443, xin chứng chỉ Let's Encrypt cho `API_DOMAIN`, proxy tới
  `api:3000` (cả API lẫn file media `/files/*`). Chứng chỉ lưu ở volume `caddy_data`. Không chạy thêm Caddy / nginx
  trên host (tranh cổng 80 / 443).
- Dữ liệu nằm trong volume `pgdata` (Postgres) và `media` (ảnh / audio) — `docker compose down` giữ volume,
  **`down -v` xoá sạch**. psql: `docker compose exec db psql -U phonics`.
- Backup (service `backup`, `deploy/backup.sh`): khi khởi động và mỗi 24 giờ ghi `./backups/db-<thời điểm>.dump`
  (pg_dump) + `./backups/media-<thời điểm>.tar.gz`, giữ `BACKUP_KEEP_DAYS` ngày (mặc định 7). Nên chép `./backups`
  ra ngoài VPS định kỳ (rsync / rclone lên máy khác hoặc cloud). Khôi phục:

  ```bash
  docker compose stop api
  docker compose exec -T db pg_restore -U phonics -d phonics --clean --if-exists < backups/db-<thời điểm>.dump
  docker compose run --rm --no-deps -v "$PWD/backups:/backups" --entrypoint sh api \
    -c 'tar -xzf /backups/media-<thời điểm>.tar.gz -C /data'
  docker compose start api
  ```
- Đổi biến trong `.env.production` / `.env` → `docker compose up -d --force-recreate` (`restart` không đọc lại env).
- Deploy tự động (job `deploy` trong `.github/workflows/ci.yml`): push vào `main` → CI qua → SSH vào VPS, `git reset
  --hard origin/main`, `docker compose up -d --build`, chờ `/api/health/db`. Cấu hình ở GitHub repo > Settings > Secrets
  and variables > Actions: variable `VPS_HOST` (bật job), tuỳ chọn `VPS_USER` (`root`), `VPS_PORT` (`22`),
  `VPS_APP_DIR` (`/opt/phonics-api`); secret `VPS_SSH_KEY` = private key có public key trong `authorized_keys` của VPS.
  VPS cần clone sẵn repo (đọc được `origin`, vd deploy key) cùng `.env.production` và `.env`.
- Entrypoint (`docker-entrypoint.sh`): `prisma migrate deploy` (DIRECT_URL) rồi `node dist/main.js`.
  Schema engine của Prisma được tải sẵn lúc build; runtime chạy user `node`, `HEALTHCHECK` gọi `/api/health`
  (không chạm DB).
- `docker-compose.yml`: ảnh `ghcr.io/${GHCR_OWNER}/phonics-api:${TAG}` (mặc định `lvhau1529` / `latest`),
  có `build` để dựng tại chỗ, `env_file: .env.production` + `environment` ghi đè DB / media / `API_PUBLIC_URL` từ
  `.env` của compose, `restart: unless-stopped`, log json-file 5 × 10 MB. `api` chờ `db` healthy mới chạy.
- Seed trên production (chỉ admin + catalog; demo luôn bị bỏ qua vì `NODE_ENV=production`): `nest build` biên dịch
  `src/database/seeds/` thành `dist/database/seeds/`; `prisma.config.ts` chọn lệnh seed theo `NODE_ENV` (production →
  `node dist/database/seeds/seed.js`, còn lại → `tsx src/database/seeds/seed.ts`). Chạy trong container đang chạy (đọc biến từ `.env.production`):
  `docker compose exec api node_modules/.bin/prisma db seed`.

## Biến môi trường

Nguồn sự thật: `src/config/env.schema.ts` (zod; thiếu / sai thì API không khởi động). Mẫu: `.env.example`.

| Biến                        | Bắt buộc | Mặc định           | Ý nghĩa                                                                 |
| --------------------------- | -------- | ------------------ | ----------------------------------------------------------------------- |
| `NODE_ENV`                  |          | `development`      | `development` / `test` / `production` (cookie Secure, log JSON)         |
| `PORT`                      |          | `3000`             | Cổng HTTP                                                               |
| `APP_TIMEZONE`              |          | `Asia/Ho_Chi_Minh` | Múi giờ cho "hôm nay / tuần / tháng" và bucket thống kê                 |
| `DATABASE_URL`              | ✓        |                    | Postgres — runtime (VPS: compose tự đặt, trỏ service `db`)              |
| `DIRECT_URL`                |          |                    | Prisma CLI (migrate, seed); thường trùng `DATABASE_URL`                 |
| `JWT_ACCESS_SECRET`         | ✓        |                    | ≥ 32 ký tự; ký access token                                             |
| `JWT_ACCESS_TTL`            |          | `15m`              | Hạn access token (`15m`, `1h`)                                          |
| `REFRESH_TTL_DAYS`          |          | `30`               | Hạn refresh token (ngày)                                                |
| `COOKIE_SECRET`             | ✓        |                    | ≥ 32 ký tự; ký cookie refresh `pa_rt`                                   |
| `COOKIE_DOMAIN`             |          |                    | Domain cookie (vd `.example.vn`) khi game / admin / API cùng site       |
| `CORS_ORIGINS`              |          | (rỗng)             | Origin được gọi API, cách nhau bằng dấu phẩy                            |
| `GOOGLE_CLIENT_IDS`         |          | (rỗng)             | OAuth Web Client ID (game, admin); rỗng = tắt đăng nhập Google          |
| `ADMIN_EMAIL`               | ✓        |                    | Admin được seed                                                         |
| `ADMIN_PASSWORD`            | ✓        |                    | ≥ 8 ký tự; chỉ dùng khi tạo mới (xem `SEED_RESET_ADMIN_PASSWORD`)       |
| `SEED_DEMO`                 |          | `false`            | `true` = seed dữ liệu demo (bỏ qua khi `NODE_ENV=production`)           |
| `SEED_RESET_ADMIN_PASSWORD` |          | `false`            | `true` = seed ghi đè mật khẩu admin đã có (chỉ seed đọc, không qua zod) |
| `SWAGGER_ENABLED`           |          | `true`             | Bật `/api/docs`                                                         |
| `LOG_LEVEL`                 |          | `info`             | `trace` / `debug` / `info` / `warn` / `error`                           |
| `DATABASE_URL_TEST`         |          |                    | Chỉ cho `test:e2e` (DB riêng, bị truncate)                              |
| `API_PUBLIC_URL`            | prod ✓   | `http://localhost:${PORT}` | URL public của API (không `/api`) — dựng link upload / file media (VPS: compose đặt `https://${API_DOMAIN}`) |
| `MEDIA_DIR`                 |          | `storage/media`    | Thư mục lưu ảnh / audio (Docker: volume `/data/media`)                  |
| `MEDIA_PUBLIC_BASE_URL`     |          |                    | CDN / domain riêng trước file media; mặc định `${API_PUBLIC_URL}/files` |
| `MEDIA_PRESIGN_TTL_SEC`     |          | `900`              | Hạn link upload đã ký (giây)                                            |

Media phiếu bài tập (ADR 0017 / 0018 / 0024): `POST /media/presign` trả `uploadUrl` =
`${API_PUBLIC_URL}/api/v1/media/:id/upload?exp=…&sig=…` (HMAC theo `JWT_ACCESS_SECRET`, không cần bearer) → client PUT
byte (giới hạn `MEDIA_LIMITS`) → `POST /media/:id/complete` → file public tại `${API_PUBLIC_URL}/files/media/...`
(API tự phục vụ, cache 1 năm, `Access-Control-Allow-Origin: *`). Chạy dev cũng upload được (lưu vào `storage/media`).

## Contracts

`packages/contracts` là nguồn sự thật của wire format (zod schema, type, `ENDPOINTS`, `API_PREFIX`, hằng số nghiệp vụ),
phát hành thành `@lvhau1529/phonics-contracts` trên GitHub Packages. API dùng bản trong repo
(`"@phonics/contracts": "workspace:@lvhau1529/phonics-contracts@*"`); game / admin cài bản đã phát hành qua alias
`"@phonics/contracts": "npm:@lvhau1529/phonics-contracts@^1"` nên code mọi nơi vẫn `import … from '@phonics/contracts'`.

Phát hành bản mới:

1. Sửa schema trong `packages/contracts/src`, `pnpm test` (gồm test contracts) + `pnpm typecheck`.
2. Tăng `version` trong `packages/contracts/package.json` theo semver — đổi không tương thích = tăng major
   (thường đi kèm version API mới `/api/v2`).
3. Commit, rồi `git tag contracts-v<version> && git push origin contracts-v<version>` → workflow
   `publish-contracts.yml` test, build và publish.
4. Ở phonics-game / phonics-admin: `pnpm up @phonics/contracts` và commit lockfile.

Khi chạy cả hệ thống bằng launcher phonics-dev (`pnpm dev`), game / admin đọc contracts thẳng từ mã nguồn repo này,
không cần phát hành mỗi lần sửa.

## Seed và tài khoản demo

`pnpm db:seed` / `prisma db seed` (dev: `tsx src/database/seeds/seed.ts`; `NODE_ENV=production`: `node dist/database/seeds/seed.js`; idempotent):

- Luôn: admin từ `ADMIN_EMAIL` / `ADMIN_PASSWORD` (không đổi mật khẩu admin đã có trừ khi
  `SEED_RESET_ADMIN_PASSWORD=true`); catalog `games` từ contracts `GAME_IDS` (Bread Catcher, Food Stream).
- Khi `SEED_DEMO=true` và `NODE_ENV` ≠ `production` (bỏ qua nếu `teacher1@demo.local` đã tồn tại):
  2 giáo viên, 3 lớp, 24 học sinh, 3–8 ván / học sinh trong 14 ngày gần nhất (kèm bút toán GAME,
  sự kiện VIEW / PLAY), vài điểm thưởng của giáo viên và `last_rank` tính bằng cùng SQL với `RankingService`.

Tài khoản demo (**chỉ dùng ở môi trường dev**, mật khẩu chung `Demo1234!`):

| Tài khoản                                               | Vai trò | Ghi chú                           |
| ------------------------------------------------------- | ------- | --------------------------------- |
| `teacher1@demo.local`                                   | TEACHER | dạy K2A, K2B                      |
| `teacher2@demo.local`                                   | TEACHER | dạy K2B, K1A                      |
| `k2a.student01@demo.local` … `k2a.student08@demo.local` | STUDENT | lớp K2A (K2, hiện khi đăng ký)    |
| `k2b.student01@demo.local` … `k2b.student08@demo.local` | STUDENT | lớp K2B (K2, hiện khi đăng ký)    |
| `k1a.student01@demo.local` … `k1a.student08@demo.local` | STUDENT | lớp K1A (K1, `joinVisible=false`) |

`SEED_DEMO` cũng tạo 4 câu hỏi SHARED đã phát hành + phiếu **"Letter Nn — Demo"** (của teacher1) để giao thử trên admin.

Admin: theo `ADMIN_EMAIL` / `ADMIN_PASSWORD` trong `.env`.
