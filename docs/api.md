# API — bảng endpoint

Base: `${API_URL}/api/v1` (`API_PREFIX` trong contracts; versioning theo URI — ADR 0015; riêng health là
`/api/health`). Chi tiết schema: Swagger `/api/docs` (sinh từ zod trong `@phonics/contracts`), đường dẫn
trong `packages/contracts/src/endpoints.ts`.

Ký hiệu cột **Ai**: `pub` = không cần token · `*` = đã đăng nhập · `S` học sinh · `T` giáo viên (chỉ lớp mình) ·
`A` admin · `perm:x` = cần quyền `x` (ADMIN luôn pass).

Quy ước chung: phân trang `?page&pageSize(≤100)&sort=field:asc|desc&q` → `{ items, total, page, pageSize }`;
khoảng thời gian `?range=all|today|week|month` hoặc `?from=YYYY-MM-DD&to=YYYY-MM-DD` (theo `APP_TIMEZONE`);
lỗi `{ statusCode, code, message, details?, requestId }`.

## auth

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| POST | `/auth/register` | pub | `RegisterBody` → `AuthResponse` (201). Học sinh + lớp. 409 `EMAIL_TAKEN`, 400 `CLASS_NOT_JOINABLE` |
| POST | `/auth/login` | pub | `LoginBody` → `AuthResponse`. 401 `INVALID_CREDENTIALS`, 403 `ACCOUNT_DISABLED` |
| POST | `/auth/google` | pub | `GoogleBody { idToken, profile? }` → `AuthResponse`. 422 `PROFILE_REQUIRED` khi tài khoản mới thiếu profile |
| POST | `/auth/refresh` | pub | cookie `pa_rt` hoặc `{ refreshToken }` → `AuthResponse` (token xoay vòng). 401 `INVALID_REFRESH` / `REFRESH_REUSED` |
| POST | `/auth/logout` | pub/\* | `{ refreshToken?, all? }` → 204 |
| GET | `/auth/me` | \* | → `MeResponse { user, permissions }` |
| POST | `/auth/change-password` | \* | `ChangePasswordBody` → 204 (thu hồi mọi phiên) |

Header `X-Refresh-Transport: body` trên các route auth → refresh token trả trong body thay vì cookie.

## public

| Method | Path | Ai | Response |
| --- | --- | --- | --- |
| GET | `/public/classes` | pub | `PublicClassesResponse` (lớp đang nhận học sinh), cache 60 s |
| GET | `/public/games` | pub | `PublicGamesResponse` (catalog, kể cả disabled) |
| POST | `/public/events` | pub (+token tuỳ chọn) | `EventBatchBody` → `EventBatchResponse { accepted, duplicates }` |
| GET | `/health` | pub | Terminus |

## me (học sinh)

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| PATCH | `/me/profile` | \* | `UpdateProfileBody` → `User` |
| GET | `/me/points` | S | `?range&gameId` → `MyPointsResponse { total, byKind, byGame, class }` |
| GET | `/me/points/history` | S | `PointsListQuery` → `Paginated<PointEntryView>` |
| GET | `/me/class/ranking` | S | `?range&gameId` → `RankingResponse` |
| GET | `/me/game-results` | S | `?gameId` → `Paginated<GameResultView>` |
| GET | `/me/games` | S | → `StudentGamesResponse` (mở khoá + điểm theo game) |
| POST | `/me/games/:gameId/unlock` | S | `UnlockWithGemsBody` → `StudentGameStatus` (idempotent; 403 nếu admin thu hồi) |
| GET | `/me/notifications` | \* | `?unread&page&pageSize` → `NotificationListResponse` |
| PATCH | `/me/notifications/read` | \* | `MarkReadBody { ids? }` → `MarkReadResponse` |

## game

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| POST | `/game/results` | S | `GameResultBody` → `GameResultResponse` (201; 200 + `duplicate: true` khi gửi lại). 400 `UNKNOWN_GAME` / `RESULT_IMPLAUSIBLE` / `PLAYED_AT_OUT_OF_RANGE` / `DETAILS_TOO_LARGE` |

## classes

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| GET | `/classes` | A, T | `ClassListQuery` → `Paginated<ClassSummary>` |
| POST | `/classes` | A | `CreateClassBody` → `ClassSummary` |
| GET | `/classes/:id` | A, T | → `ClassSummary` |
| PATCH | `/classes/:id` | A | `UpdateClassBody` (`archived`) → `ClassSummary` |
| DELETE | `/classes/:id` | A | lưu trữ → 204 |
| PUT | `/classes/:id/teachers` | A | `SetClassTeachersBody` → `ClassSummary` |
| GET | `/classes/:id/students` | A, T | → `Paginated<StudentSummary>` (điểm, hạng) |
| GET | `/classes/:id/ranking` | A, T | `?range&gameId` → `RankingResponse` |
| GET | `/classes/:id/points` | A, T | `PointsListQuery` → `Paginated<PointEntryView>` |
| POST | `/classes/:id/points/bonus` | A, T perm:`points.award` | `AwardBonusBody` → `AwardBonusResponse` (điểm âm cần `points.revoke`) |
| POST | `/classes/:id/points/bonus/batch` | A, T perm:`points.award` | `AwardBonusBatchBody` → `{ entries }` |
| POST | `/classes/:id/games/:gameId/unlock` | A, T perm:`games.unlock` | `UnlockClassBody` → `UnlockClassResponse` |

## students

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| GET | `/students` | A, T | `StudentListQuery` → `Paginated<StudentSummary>` |
| GET | `/students/:id` | A, T | → `StudentDetail` (`parent` chỉ A / perm:`students.viewParentContact`) |
| PATCH | `/students/:id` | A; T perm:`students.edit` (chỉ tên, avatar) | `UpdateStudentBody` → `StudentDetail` |
| POST | `/students/:id/move-class` | A, T perm:`class.changeStudentClass` | `MoveClassBody` → `StudentDetail` |
| POST | `/students/:id/reset-password` | A | `ResetPasswordBody` → 204 |
| GET | `/students/:id/points` | A, T | `PointsListQuery` → `Paginated<PointEntryView>` |
| GET | `/students/:id/points/by-game` | A, T | `?range` → `{ items: PointsByGame[] }` |
| GET | `/students/:id/game-results` | A, T | → `Paginated<GameResultView>` |
| GET | `/students/:id/games` | A, T | → `StudentGamesResponse` |
| PUT | `/students/:id/games/:gameId` | A, T perm:`games.unlock` | `SetStudentGameUnlockBody` → `StudentGameStatus` |

## admin

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| GET | `/admin/teachers` | A | `TeacherListQuery` → `Paginated<TeacherSummary>` |
| POST | `/admin/teachers` | A | `CreateTeacherBody` → `TeacherSummary` |
| PATCH | `/admin/teachers/:id` | A | `UpdateTeacherBody` → `TeacherSummary` |
| PUT | `/admin/teachers/:id/classes` | A | `SetTeacherClassesBody` → `TeacherSummary` |
| GET | `/admin/permissions` | A | → `{ items: PermissionDefView[] }` |
| GET | `/admin/users/:id/permissions` | A | → `UserPermissionsResponse` |
| PUT | `/admin/users/:id/permissions` | A | `UpdateUserPermissionsBody` → `UserPermissionsResponse` (có `groups`, `fromGroups`) |
| PUT | `/admin/users/:id/permission-groups` | A | `SetUserPermissionGroupsBody { groupIds }` → `UserPermissionsResponse` |
| GET | `/admin/permission-groups` | A | → `{ items: PermissionGroup[] }` |
| POST | `/admin/permission-groups` | A | `CreatePermissionGroupBody` → `PermissionGroup` |
| PATCH | `/admin/permission-groups/:id` | A | `UpdatePermissionGroupBody` → `PermissionGroup` |
| DELETE | `/admin/permission-groups/:id` | A | 204 (nhóm hệ thống → 403) |
| GET | `/admin/audit` | A | `AuditListQuery` → `Paginated<AuditLogView>` |
| GET | `/admin/games` | A | → `{ items: GameAdminItem[] }` |
| PATCH | `/admin/games/:id` | A perm:`games.manage` | `UpdateGameBody` → `GameCatalogItem` |

## reports (perm:`reports.export`)

| Method | Path | Ai | Response |
| --- | --- | --- | --- |
| GET | `/reports/classes/:id/ranking.xlsx` | A, T | `ReportQuery` → file xlsx |
| GET | `/reports/classes/:id/ranking.pdf` | A, T | → file pdf |
| GET | `/reports/classes/:id/points.xlsx` | A, T | → sổ điểm xlsx |

## stats (perm:`stats.view`)

| Method | Path | Ai | Response |
| --- | --- | --- | --- |
| GET | `/stats/overview` | A, T | `OverviewStats` |
| GET | `/stats/classes/:id/points-timeline` | A, T | `TimelineQuery` → `PointsTimelineBucket[]` |
| GET | `/stats/classes/:id/top-students` | A, T | `?range&gameId&limit` → `TopStudent[]` |
| GET | `/stats/classes/:id/distribution` | A, T | → `DistributionBucket[]` |
| GET | `/stats/classes/:id/games` | A, T | → `ClassGameStats[]` |
| GET | `/stats/games/:id/timeline` | A, T | `TimelineQuery` → `GameTimelineBucket[]` |
| GET | `/stats/games/:id/by-class` | A, T | → `GameByClassStats[]` |
