# phonics-api — Phonics Arcade API

NestJS 11 + Prisma 7 (PostgreSQL / Neon). Phục vụ app game ([phonics-game](https://github.com/Lvhau1529/phonics-game)) và
trang quản trị ([phonics-admin](https://github.com/Lvhau1529/phonics-admin)):
tài khoản (local + Google), lớp học, học sinh, giáo viên, điểm / xếp hạng, thông báo, catalog game,
sự kiện xem / chơi, thống kê và xuất báo cáo (xlsx / pdf). Hợp đồng dữ liệu (zod) nằm ở
`packages/contracts` (gói `@lvhau1529/phonics-contracts`, xem [Contracts](#contracts)); mọi response của API trả đúng
shape trong đó. Tài liệu hệ thống (kiến trúc, ADR, deploy cả 3 app): repo **phonics-dev**.

## Cấu trúc

Ba tầng, phụ thuộc một chiều `modules → common / core → config` (ADR 0015 trong phonics-dev):

```
phonics-api
├── packages/contracts/     gói hợp đồng zod dùng chung (phát hành lên GitHub Packages)
├── docs/                   api.md (bảng endpoint), erd.md
├── prisma/                 schema.prisma, migrations/ (seed ở src/seed.ts)
├── prisma.config.ts        Prisma CLI: DIRECT_URL (kết nối thẳng), lệnh seed
├── src/
│   ├── main.ts             khởi động: configureApp + Swagger + listen
│   ├── app.module.ts       ghép CoreModule + module nghiệp vụ; pipe / guard toàn cục
│   ├── bootstrap/          configure-app.ts (prefix /api, versioning, middleware, CORS, filter — dùng chung với e2e),
│   │                       swagger.ts
│   ├── config/             env.schema.ts (zod, nguồn sự thật biến môi trường), env.module.ts, constants.ts,
│   │                       api-version.ts (API_V1)
│   ├── core/               HẠ TẦNG (@Global, không nghiệp vụ) — core.module.ts gom lại
│   │   ├── database/       PrismaModule, PrismaService (driver adapter pg), kiểu Tx
│   │   ├── logger/         pino (redact secret, mã request)
│   │   ├── time/           TimeService (APP_TIMEZONE)
│   │   └── access/         AccessService — phạm vi dữ liệu theo vai trò (GV chỉ lớp mình)
│   ├── common/             KHỐI DÙNG CHUNG cho request pipeline (không chứa nghiệp vụ)
│   │   ├── middleware/     request-id (X-Request-Id)
│   │   ├── guards/         JwtAuthGuard, RolesGuard, PermissionsGuard
│   │   ├── decorators/     @Public, @OptionalAuth, @Roles, @RequirePermission, @CurrentUser
│   │   ├── filters/        AllExceptionsFilter → envelope ApiErrorBody
│   │   ├── errors/         AppError (mã lỗi theo ErrorCode của contracts)
│   │   ├── dto/            DTO query dùng chung (phân trang, khoảng thời gian)
│   │   └── utils/          paginate
│   ├── modules/            NGHIỆP VỤ — mỗi bounded context một thư mục:
│   │   └── <module>/
│   │       ├── <module>.module.ts
│   │       ├── <module>.service.ts (+ .spec.ts)   luật nghiệp vụ, dùng chung mọi version
│   │       └── v1/                                 controller + DTO (wire format) của API v1
│   │   auth · users · permissions · classes · teachers · students · games · events · game-results ·
│   │   points (+ RankingService) · notifications · stats · reports (+ writers/ xlsx, pdf) · audit ·
│   │   health (không version: /api/health)
│   └── generated/          Prisma client (gitignored, `pnpm prisma:generate`)
└── test/
    ├── helpers/            create-test-app.ts (boot AppModule + configureApp cho e2e, truncateAll)
    └── e2e/                *.e2e-spec.ts (cần DATABASE_URL_TEST)
```

**Versioning:** route theo URI `/api/v1/...` (client lấy `API_PREFIX` từ contracts). Thêm v2 = tạo
`modules/<module>/v2/` (controller + DTO mới, `@Controller({ path, version: API_V2 })`), service giữ nguyên;
endpoint không đổi thì cho controller v1 phục vụ cả hai version (`version: [API_V1, API_V2]`).
`/api/health` và Swagger `/api/docs` không có version.

## Chạy dev

```bash
cp .env.example .env      # điền DATABASE_URL / DIRECT_URL (Neon), secret ≥ 32 ký tự
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

e2e dùng một DB Postgres **riêng** (bị `TRUNCATE` trước mỗi file test): đặt `DATABASE_URL_TEST`
(ví dụ một branch Neon khác hoặc Postgres local). Helper tự `prisma migrate deploy` lên DB đó và điền các
biến bắt buộc còn thiếu (secret, admin) bằng giá trị test, nên CI không cần `.env`. Không có
`DATABASE_URL_TEST` thì các file e2e tự skip.

## Deploy bằng Docker

Ảnh multi-stage (`Dockerfile`, `node:24-alpine`, pnpm qua corepack), build context = gốc repo (`.dockerignore`).
Contracts được build cùng ảnh từ `packages/contracts` (không cần GitHub Packages).

```bash
# build tại chỗ
docker build -t ghcr.io/<owner>/phonics-api:latest .
# chạy trên VPS (docker-compose.yml): cổng 127.0.0.1:3000, reverse proxy làm TLS
cp .env.example .env.production && docker compose up -d
```

- Entrypoint (`docker-entrypoint.sh`): `prisma migrate deploy` (DIRECT_URL) rồi `node dist/main.js`.
  Schema engine của Prisma được tải sẵn lúc build; runtime chạy user `node`, `HEALTHCHECK` gọi `/api/health`.
- `docker-compose.yml`: ảnh `ghcr.io/${GHCR_OWNER}/phonics-api:${TAG}` (mặc định `lvhau1529` / `latest`),
  có `build` để dựng tại chỗ, `env_file: .env.production`, `restart: unless-stopped`, log json-file 5 × 10 MB.
- Seed trên production (chỉ admin + catalog; demo luôn bị bỏ qua vì `NODE_ENV=production`): `nest build` biên dịch
  `src/seed.ts` thành `dist/seed.js`; `prisma.config.ts` chọn lệnh seed theo `NODE_ENV` (production →
  `node dist/seed.js`, còn lại → `tsx src/seed.ts`). Chạy trong container đang chạy (đọc biến từ `.env.production`):
  `docker compose exec api node_modules/.bin/prisma db seed`.

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

`pnpm db:seed` / `prisma db seed` (dev: `tsx src/seed.ts`; `NODE_ENV=production`: `node dist/seed.js`; idempotent):

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
