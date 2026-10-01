# Quy tắc cho `apps/api` (NestJS + Prisma)

Đọc thêm [README.md](README.md) (chạy, env, deploy) và [docs/architecture](../../docs/architecture/README.md).

## Kiến trúc

Cấu trúc thư mục + versioning: ADR 0015 và [README > Cấu trúc](README.md#cấu-trúc). Phụ thuộc một chiều
`modules → common / core → config`; `common/` và `core/` **không** import ngược từ `modules/` (trừ kiểu
`AuthUser` và `PermissionsService` mà guard cần).

- `core/`: hạ tầng `@Global` không nghiệp vụ (database, logger, time, access) — gom trong `CoreModule`.
- `common/`: khối của request pipeline — `middleware/`, `guards/`, `decorators/`, `filters/`, `errors/`, `dto/`,
  `utils/`. Thêm interceptor / pipe riêng thì tạo `common/interceptors/`, `common/pipes/`.
- `bootstrap/configure-app.ts`: prefix, versioning, middleware (`app.use`), CORS, filter — dùng chung cho `main.ts`
  và e2e. Không cấu hình HTTP rải rác trong `main.ts`.
- `modules/<module>/`: một bounded context (`auth`, `users`, `permissions`, `classes`, `teachers`, `students`,
  `games`, `events`, `game-results`, `points` (+ `ranking.service.ts`), `notifications`, `reports`, `stats`, `audit`,
  `health`). Gốc module = `*.module.ts` + service + spec (luật nghiệp vụ, **không** phụ thuộc version);
  `v1/` = controller + `dto.ts` của API v1. Service không import từ `v1/` (schema riêng của module → `<module>.schemas.ts`).
- Versioning URI: `@Controller({ path: 'x', version: API_V1 })` (`config/api-version.ts`) → `/api/v1/x`.
  Controller thiếu `version` sẽ không có prefix version — chỉ dùng cho health (`VERSION_NEUTRAL`).
- Module `@Global()`: Env, Prisma, Time, Access (core) và Notifications, Permissions, Auth — inject thẳng, không
  cần import. Các module khác phải `imports: [...]` (vd `PointsModule` để dùng `RankingService`).
- Guard toàn cục theo thứ tự: Throttler → `JwtAuthGuard` (gắn `req.user: AuthUser`) → `RolesGuard`
  (`@Roles`) → `PermissionsGuard` (`@RequirePermission`). ADMIN pass mọi permission. **Phạm vi** (GV chỉ lớp mình)
  kiểm tra trong service bằng `AccessService.assertClassAccess / assertStudentAccess / scopedClassIds`.
- Validate: DTO = `class XDto extends createZodDto(X)` với `X` từ `@phonics/contracts` (không viết schema riêng
  trong API). `ZodValidationPipe` toàn cục. Mọi lỗi ra ngoài qua `AllExceptionsFilter` → envelope `ApiErrorBody`;
  lỗi nghiệp vụ ném `new AppError('CODE', status, { message?, details? })` với `CODE` thuộc `ErrorCode` của contracts.
- Prisma 7: client sinh ra ở `src/generated/prisma` (gitignored; `pnpm prisma:generate`). Import
  `{ Prisma }` từ `src/generated/prisma/client` (tương đối, vd `../../generated/prisma/client` từ module). Transaction:
  `prisma.$transaction(async (tx) => …)`, kiểu `Tx` (`core/database/types.ts`).
  Bảng / cột snake_case qua `@@map` — SQL raw (`$queryRaw`) dùng tên snake_case.
- Thời gian: mọi "hôm nay / tuần / tháng" qua `TimeService` (APP_TIMEZONE), không dùng `new Date()` trần.
- Điểm: chỉ `GameResultsService` và `PointsService` được tạo `point_entries`; sau mỗi bút toán phải gọi
  `RankingService.recomputeAndNotify(tx, classId, actorStudentId?)` trong cùng transaction.
  Luật điểm nằm ở `POINT_RULES` (contracts) + `GAME_REGISTRY` (`config/constants.ts`).
- Audit: gọi `AuditService.record(actor, action, targetType, targetId, before, after)` ở thao tác nhạy cảm;
  `action` phải thuộc `AuditAction` (contracts).

## Thêm một endpoint

1. Thêm / sửa schema trong `packages/contracts` (+ `ENDPOINTS`), `pnpm --filter @phonics/contracts build`.
2. DTO trong `modules/<module>/v1/dto.ts`, method service, method controller trong `v1/` (thin: DTO → service →
   view đúng shape contracts, `Date` → `.toISOString()`), decorator `@Roles` / `@RequirePermission` / `@Public` phù hợp.
   Controller mới phải khai báo `version: API_V1`.
3. Kiểm tra scope trong service; audit nếu nhạy cảm; thông báo (`NotificationsService`) nếu học sinh cần biết.
4. Unit test cạnh service (`*.spec.ts`, Vitest + `vitest-mock-extended`, khởi tạo service bằng tay); e2e trong
   `test/e2e` nếu là luồng chính.
5. `pnpm typecheck && pnpm lint && pnpm test` trong `apps/api`; xem Swagger `/api/docs`.

## Đổi schema DB

`prisma/schema.prisma` → `pnpm prisma:migrate --name <ten>` (dùng `DIRECT_URL`, Neon branch dev) → kiểm tra SQL
sinh ra (index partial / SQL đặc biệt thêm tay vào file migration, không chỉ sửa schema) → commit cả thư mục
`prisma/migrations`. Production chạy `prisma migrate deploy` (docker-entrypoint.sh).

## Quy ước code

- TypeScript 6 (classic) cho app này (Nest cần decorator metadata; TS 7 chưa có compiler API). Build bằng SWC
  (`nest-cli.json`), typecheck bằng `tsc --noEmit`.
- Import tương đối (không alias), inline `import { type X }`. Comment / JSDoc tiếng Việt, identifier tiếng Anh,
  chuỗi thông báo cho học sinh (notification title/body) tiếng Anh ngắn gọn, message lỗi tiếng Việt.
- Không bao giờ trả `passwordHash`, `googleSub`, `tokenVersion`, token ra ngoài. Không log secret
  (pino đã redact `authorization` / `cookie`).
- Secret chỉ trong `.env` (gitignored); thêm biến mới = sửa `config/env.schema.ts` + `.env.example` + README.
