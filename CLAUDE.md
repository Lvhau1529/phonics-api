# Quy tắc cho phonics-api (NestJS + Prisma)

Đọc thêm [README.md](README.md) (chạy, env, deploy, phát hành contracts). Kiến trúc hệ thống + ADR: repo
phonics-dev (`docs/`). Rule riêng của gói hợp đồng: [packages/contracts/CLAUDE.md](packages/contracts/CLAUDE.md).

## Git

- **Không tự `git push`.** Chỉ push khi người dùng yêu cầu rõ ràng. Làm xong thì commit (nếu phù hợp) và báo lại.
- Trước mỗi lần push: `pnpm build` (gồm typecheck) phải qua; đóng server dev / preview mình đã mở.
- Commit message **không** có dòng ghi công Claude. Subject tiếng Anh, body có thể tiếng Việt.
- Dùng **pnpm**; thêm / đổi package thì commit kèm `pnpm-lock.yaml` (deploy cài bằng `--frozen-lockfile`).
- Secret chỉ trong `.env` (gitignored); mẫu ở `.env.example`. Không ghi secret vào docs / commit / log.

## Hạ tầng (ADR 0024)

Production = một VPS, `docker-compose.yml`: `db` (Postgres 18, volume `pgdata`) + `api` + `caddy` + `backup`
(`deploy/backup.sh`). Media lưu đĩa (volume `media`), API tự phục vụ `/files/*`. Không dùng Neon / S3 / dịch vụ DB
ngoài. Job theo thời gian không truy vấn DB định kỳ dày (hẹn timer theo mốc dữ liệu như `AssignmentsScheduler`).

## Dev cùng các repo khác

Repo này độc lập (clone, cài, build, deploy riêng). Muốn chạy cả hệ thống cùng lúc (API + game + admin): đặt 3 repo
nằm cạnh nhau cùng repo **phonics-dev** rồi `pnpm dev` trong phonics-dev (README ở đó). Khi chạy qua phonics-dev, game /
admin đọc `@phonics/contracts` thẳng từ mã nguồn `../phonics-api/packages/contracts` (biến `PHONICS_CONTRACTS_SRC`,
xem `vite.config.ts` của game / admin) — sửa contracts thấy ngay, không cần phát hành.

## Kiến trúc

Cấu trúc thư mục + versioning: [README > Cấu trúc](README.md#cấu-trúc) (ADR 0015, ADR 0020). Phụ thuộc một chiều
`modules → common / core / database / infrastructure → config`; các tầng dưới **không** import ngược từ `modules/`
(trừ kiểu `AuthUser` và `PermissionsService` mà guard cần).

- `core/`: hạ tầng `@Global` không nghiệp vụ (logger, time, access) — gom trong `CoreModule` (kèm `PrismaModule`).
- `database/`: `PrismaModule`, `PrismaService`, kiểu `Tx` (`database/types.ts`); `database/seeds/` = seed theo miền.
  Migration vẫn ở `prisma/migrations` (Prisma CLI + `docker-entrypoint.sh`).
- `infrastructure/`: hạ tầng ngoài nghiệp vụ (`storage/` — `DiskStorage`, file media trên đĩa `MEDIA_DIR`, ADR 0024).
- `common/`: khối của request pipeline — `middleware/`, `guards/`, `decorators/`, `filters/`, `errors/`, `dto/`,
  `utils/`. Thêm interceptor / pipe riêng thì tạo `common/interceptors/`, `common/pipes/`.
- `bootstrap/configure-app.ts`: prefix, versioning, middleware (`app.use`), CORS, filter — dùng chung cho `main.ts`
  và e2e. Không cấu hình HTTP rải rác trong `main.ts`.
- `modules/<module>/`: một bounded context, layout feature-based (ADR 0020; chỉ tạo thư mục con khi cần):
  - `<module>.module.ts`: `providers: [Repository, ...services]`, `exports` chỉ những service module khác cần.
  - `controllers/`: **một controller / file**, tên theo actor — `<module>.controller.ts` (GV / admin),
    `<module>-me.controller.ts` (`/me`, học sinh), `<module>-admin.controller.ts`, `<module>-public.controller.ts`.
    Controller mỏng: DTO → service → trả view.
  - `services/`: một service / use case — `<x>-reader.service.ts` (đọc), `<x>-writer.service.ts` (ghi),
    `<x>-student.service.ts`, `<x>-lifecycle.service.ts`… Service **không** gọi Prisma trực tiếp khi module có
    repository (ngoại lệ: `RankingService` / `AssignmentRankingService` — SQL xếp hạng dùng chung, nhận `tx` — và chỗ
    truyền client cho `rankClass`); **không** import từ `controllers/` hay `dto/requests/`.
  - `repositories/`: lớp `@Injectable()` bọc `PrismaService` — mọi `findMany` / `$queryRaw` / transaction của module.
    Hàm nhận `tx: Tx` khi cần chạy trong transaction của service.
  - `dto/requests/<module>.dto.ts`: `class XDto extends createZodDto(X)`. `dto/responses/<x>.view.ts`: hàm thuần
    row → view đúng shape contracts (`Date` → `.toISOString()`).
  - `types/`: `xInclude` + `XRow = Prisma.XGetPayload<…>`, hằng `X_SORT_FIELDS`, schema zod riêng của module.
  - `utils/`: hàm thuần (luật nghiệp vụ / tính toán) + `.spec.ts`. Thư mục đặc thù: `jobs/` (cron), `grading/`,
    `writers/`.
  - Không có `entities/` (Prisma, không TypeORM): model ở `prisma/schema.prisma`.
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
  `{ Prisma }` từ `src/generated/prisma/client` (`@/generated/prisma/client`). Transaction:
  `prisma.$transaction(async (tx) => …)`, kiểu `Tx` (`database/types.ts`).
  Bảng / cột snake_case qua `@@map` — SQL raw (`$queryRaw`) dùng tên snake_case.
- Thời gian: mọi "hôm nay / tuần / tháng" qua `TimeService` (APP_TIMEZONE), không dùng `new Date()` trần.
- Điểm: chỉ `GameResultWriterService` và `PointBonusService` (qua repository của module) được tạo `point_entries`;
  sau mỗi bút toán phải gọi `RankingService.recomputeAndNotify(tx, classId, actorStudentId?)` trong cùng transaction.
  Luật điểm nằm ở `POINT_RULES` (contracts) + `GAME_REGISTRY` (`config/constants.ts`).
- Audit: gọi `AuditService.record(actor, action, targetType, targetId, before, after)` ở thao tác nhạy cảm;
  `action` phải thuộc `AuditAction` (contracts).

## Thêm một endpoint

1. Thêm / sửa schema trong `packages/contracts` (+ `ENDPOINTS`), `pnpm build:contracts`. Game / admin chỉ thấy schema
   mới sau khi phát hành bản contracts mới (README > Contracts) — hoặc ngay lập tức nếu chạy qua launcher phonics-dev (`pnpm dev`).
2. DTO trong `modules/<module>/dto/requests/<module>.dto.ts`; truy vấn mới trong `repositories/`; method ở service
   đúng use case (`*-reader` / `*-writer`…); hàm view trong `dto/responses/`; method controller trong `controllers/`
   đúng actor (thin: DTO → service → view đúng shape contracts), decorator `@Roles` / `@RequirePermission` / `@Public`
   phù hợp. Controller mới phải khai báo `version: API_V1` và được đăng ký trong `<module>.module.ts`.
3. Kiểm tra scope trong service; audit nếu nhạy cảm; thông báo (`NotificationsService`) nếu học sinh cần biết.
4. Unit test cạnh service (`*.spec.ts`, Vitest + `vitest-mock-extended`, khởi tạo service bằng tay — repository thật
   bọc `mockDeep<PrismaService>()` để assert trên lời gọi Prisma); hàm thuần trong `utils/` test riêng; e2e trong
   `test/e2e` nếu là luồng chính.
5. `pnpm typecheck && pnpm lint && pnpm test`; xem Swagger `/api/docs`.

## Đổi schema DB

`prisma/schema.prisma` → `pnpm prisma:migrate --name <ten>` (dùng `DIRECT_URL`, Postgres local của phonics-dev) → kiểm tra SQL
sinh ra (index partial / SQL đặc biệt thêm tay vào file migration, không chỉ sửa schema) → commit cả thư mục
`prisma/migrations`. Production chạy `prisma migrate deploy` (docker-entrypoint.sh).

## Quy ước code

- TypeScript 6 (classic) cho app này (Nest cần decorator metadata; TS 7 chưa có compiler API). Build bằng SWC
  (`nest-cli.json`), typecheck bằng `tsc --noEmit`.
- Import bằng alias `@/` → `src` (ESLint cấm `../`; khai báo ở `tsconfig.json`, `.swcrc`, `vitest.config.ts`), inline `import { type X }`. Comment / JSDoc tiếng Việt, identifier tiếng Anh,
  chuỗi thông báo cho học sinh (notification title/body) tiếng Anh ngắn gọn, message lỗi tiếng Việt.
- Không bao giờ trả `passwordHash`, `googleSub`, `tokenVersion`, token ra ngoài. Không log secret
  (pino đã redact `authorization` / `cookie`).
- Secret chỉ trong `.env` (gitignored); thêm biến mới = sửa `config/env.schema.ts` + `.env.example` + README.
