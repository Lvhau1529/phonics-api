# @phonics/api — Phonics Arcade API

NestJS 11 + Prisma 7 (PostgreSQL / Neon). Phục vụ app game (`apps/game`) và trang quản trị (`apps/admin`):
tài khoản (local + Google), lớp học, học sinh, giáo viên, điểm / xếp hạng, thông báo, catalog game,
sự kiện xem / chơi, thống kê và xuất báo cáo (xlsx / pdf). Hợp đồng dữ liệu (zod) nằm ở
`packages/contracts`; mọi response của API trả đúng shape trong đó.

## Cấu trúc

```
apps/api
├── prisma/            schema.prisma, migrations/, seed.ts
├── prisma.config.ts   Prisma CLI: DIRECT_URL (kết nối thẳng), lệnh seed
├── src/
│   ├── main.ts        bootstrap: prefix /api, helmet, cookie-parser, CORS, Swagger
│   ├── app.module.ts  guard toàn cục: Throttler → JwtAuth → Roles → Permissions
│   ├── config/        env.schema.ts (zod, nguồn sự thật biến môi trường), constants.ts
│   ├── common/        access (phạm vi lớp), decorators, errors (AppError), filters, guards, pagination, time
│   ├── prisma/        PrismaService (driver adapter pg)
│   ├── generated/     Prisma client (gitignored, `pnpm prisma:generate`)
│   ├── auth/          đăng ký / đăng nhập / Google / refresh token xoay vòng / đổi mật khẩu
│   ├── users/         /me/profile
│   ├── permissions/   quyền theo role + override từng user (admin)
│   ├── classes/       lớp, giáo viên của lớp, học sinh của lớp
│   ├── teachers/      admin quản lý giáo viên
│   ├── students/      admin / GV quản lý học sinh
│   ├── games/         catalog game, mở khoá game cho học sinh
│   ├── events/        sự kiện VIEW / PLAY (ẩn danh theo client_id)
│   ├── game-results/  game client gửi kết quả ván → cộng điểm
│   ├── points/        sổ điểm, điểm thưởng, RankingService (SQL xếp hạng duy nhất)
│   ├── notifications/ thông báo cho học sinh
│   ├── stats/         thống kê tổng quan / theo lớp / theo game
│   ├── reports/       xuất xlsx (exceljs) và pdf (pdfmake)
│   ├── audit/         nhật ký hành động admin / GV
│   └── health/        GET /api/health
└── test/
    ├── helpers/       create-test-app.ts (boot AppModule cho e2e, truncateAll)
    └── e2e/           *.e2e-spec.ts (cần DATABASE_URL_TEST)
```

## Chạy dev

```bash
cp apps/api/.env.example apps/api/.env       # điền DATABASE_URL / DIRECT_URL (Neon), secret ≥ 32 ký tự
pnpm install
pnpm --filter @phonics/api prisma:generate   # sinh client vào src/generated
pnpm --filter @phonics/api prisma:migrate    # prisma migrate dev (dùng DIRECT_URL)
pnpm --filter @phonics/api db:seed           # admin + catalog game (+ dữ liệu demo nếu SEED_DEMO=true)
pnpm dev:api                                 # từ gốc repo: build contracts rồi nest start --watch
```

- API: `http://localhost:3000/api`, Swagger UI: `http://localhost:3000/api/docs` (JSON: `/api/docs-json`),
  tắt bằng `SWAGGER_ENABLED=false`.
- Lệnh khác trong `apps/api`: `pnpm typecheck`, `pnpm lint`, `pnpm build` (prisma generate + nest build bằng SWC,
  ra `dist/`), `pnpm start` (chạy `dist/main.js`), `pnpm prisma:studio`.
- Mọi lỗi trả về envelope `ApiErrorBody` (`statusCode`, `code`, `message`, `details?`, `requestId`).

## Test

```bash
pnpm --filter @phonics/api test        # unit (src/**/*.spec.ts), không cần DB
pnpm --filter @phonics/api test:e2e    # e2e (test/e2e/**/*.e2e-spec.ts), cần DATABASE_URL_TEST
```

e2e dùng một DB Postgres **riêng** (bị `TRUNCATE` trước mỗi file test): đặt `DATABASE_URL_TEST`
(ví dụ một branch Neon khác hoặc Postgres local). Helper tự `prisma migrate deploy` lên DB đó và điền các
biến bắt buộc còn thiếu (secret, admin) bằng giá trị test, nên CI không cần `.env`. Không có
`DATABASE_URL_TEST` thì các file e2e tự skip.

## Deploy bằng Docker

Ảnh multi-stage (`apps/api/Dockerfile`, `node:24-alpine`, pnpm qua corepack). Build context là **gốc repo**
vì cần lockfile + workspace (`packages/contracts`); BuildKit đọc `apps/api/Dockerfile.dockerignore`.

```bash
# build tại chỗ
docker build -f apps/api/Dockerfile -t ghcr.io/<owner>/phonics-api:latest .
# chạy trên VPS (apps/api/docker-compose.yml): cổng 127.0.0.1:3000, reverse proxy làm TLS
cd apps/api && cp .env.example .env.production && docker compose up -d
```

- Entrypoint (`docker-entrypoint.sh`): `prisma migrate deploy` (DIRECT_URL) rồi `node dist/main.js`.
  Schema engine của Prisma được tải sẵn lúc build; runtime chạy user `node`, `HEALTHCHECK` gọi `/api/health`.
- `docker-compose.yml`: ảnh `ghcr.io/${GHCR_OWNER}/phonics-api:${TAG}` (mặc định `lvhau1529` / `latest`),
  có `build` để dựng tại chỗ, `env_file: .env.production`, `restart: unless-stopped`, log json-file 5 × 10 MB.
- Seed trên production (chỉ admin + catalog, `SEED_DEMO` để trống): ảnh production không có `tsx`
  (devDependency) nên chạy từ máy dev: `DIRECT_URL=<prod> ADMIN_EMAIL=… ADMIN_PASSWORD=… pnpm --filter @phonics/api db:seed`.

## Biến môi trường

Nguồn sự thật: `src/config/env.schema.ts` (zod; thiếu / sai thì API không khởi động). Mẫu: `.env.example`.

| Biến                        | Bắt buộc | Mặc định           | Ý nghĩa                                                                 |
| --------------------------- | -------- | ------------------ | ----------------------------------------------------------------------- |
| `NODE_ENV`                  |          | `development`      | `development` / `test` / `production` (cookie Secure, log JSON)         |
| `PORT`                      |          | `3000`             | Cổng HTTP                                                               |
| `APP_TIMEZONE`              |          | `Asia/Ho_Chi_Minh` | Múi giờ cho "hôm nay / tuần / tháng" và bucket thống kê                 |
| `DATABASE_URL`              | ✓        |                    | Chuỗi kết nối pooled (Neon `-pooler`) — runtime                         |
| `DIRECT_URL`                |          |                    | Kết nối thẳng — Prisma CLI (migrate, seed)                              |
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

## Seed và tài khoản demo

`pnpm --filter @phonics/api db:seed` (= `tsx prisma/seed.ts`, idempotent):

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

Admin: theo `ADMIN_EMAIL` / `ADMIN_PASSWORD` trong `.env`.
