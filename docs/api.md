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

## media (phiếu bài tập — ADR 0018)

Upload ảnh / audio bằng presigned PUT lên Neon Object Storage; API không chạm byte. Giới hạn `MEDIA_LIMITS`
(contracts): ảnh ≤ 5 MB jpg/png/webp, audio ≤ 10 MB mp3/m4a/webm/ogg/wav. Mọi response có media kèm
`media: { [mediaId]: { id, url, kind } }`; JSON config / answer giữ khoá `*MediaId`.

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| POST | `/media/presign` | \* | `PresignMediaBody` → `PresignMediaResponse` (201). Client PUT file lên `uploadUrl` với đúng `headers`. 400 `MEDIA_TYPE_UNSUPPORTED` / `MEDIA_TOO_LARGE`, 503 `MEDIA_STORAGE_DISABLED`. Throttle 30/phút |
| POST | `/media/:id/complete` | \* (chủ file) | `CompleteMediaBody` → `MediaView`. Server HEAD đối tượng; sai size / mime → xoá + 409 `MEDIA_UPLOAD_INCOMPLETE`. Idempotent |
| GET | `/media/:id` | A, T; S file của mình | → `MediaView` |

## questions (perm:`worksheets.manage`) — ADR 0017

14 dạng (`QuestionType`); `config` / `answerKey` là discriminated union theo `type`. GV thấy câu của mình ∪ câu
`SHARED` đã `PUBLISHED`; chỉ chủ sở hữu / admin sửa. Không xoá cứng — chỉ `ARCHIVED`.

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| GET | `/questions` | A, T | `QuestionListQuery` (`type`, `status`, `visibility`, `tag`, `mine`, `q`) → `Paginated<QuestionSummary>` |
| GET | `/questions/tags` | A, T | → `TagsResponse` |
| POST | `/questions` | A, T | `CreateQuestionBody` → `QuestionView` (201). 400 `MEDIA_NOT_READY` khi media chưa READY / không thuộc mình |
| GET | `/questions/:id` | A, T | → `QuestionView` (có `answerKey`, `media`) |
| PATCH | `/questions/:id` | A, chủ sở hữu | `UpdateQuestionBody` (config + answerKey đi cùng nhau) → `QuestionView` |
| POST | `/questions/:id/publish` | A, chủ sở hữu | → `QuestionView` |
| POST | `/questions/:id/archive` | A, chủ sở hữu | → `QuestionView`. 409 `WORKSHEET_IN_USE` nếu phiếu (chưa archive) đang dùng |
| POST | `/questions/:id/duplicate` | A, T | → `QuestionView` (201, bản DRAFT của người gọi) |

## worksheets (perm:`worksheets.manage`)

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| GET | `/worksheets` | A, T | `WorksheetListQuery` → `Paginated<WorksheetSummary>` |
| POST | `/worksheets` | A, T | `CreateWorksheetBody` → `WorksheetDetail` (201, có sẵn Part 1) |
| GET | `/worksheets/:id` | A, T | → `WorksheetDetail` (sections → items → `QuestionSummary`; `questions` đầy đủ; `media`) |
| PATCH | `/worksheets/:id` | A, chủ sở hữu | `UpdateWorksheetBody` → `WorksheetDetail` |
| PUT | `/worksheets/:id/structure` | A, chủ sở hữu | `WorksheetStructureBody` (thay toàn bộ Part + câu; giữ `id` có sẵn) → `WorksheetDetail`. 400 khi câu không dùng được |
| POST | `/worksheets/:id/publish` | A, chủ sở hữu | → `WorksheetDetail`. 409 `WORKSHEET_EMPTY` / `QUESTION_NOT_PUBLISHED` (details `questionIds`) |
| POST | `/worksheets/:id/archive` | A, chủ sở hữu | → `WorksheetDetail` (bài đã giao vẫn chạy nhờ snapshot) |
| POST | `/worksheets/:id/duplicate` | A, T | → `WorksheetDetail` (201) |

## assignments (A, T lớp mình)

Giao phiếu = đóng băng **snapshot** (nội dung + answerKey + điểm) vào bài giao. Trạng thái `SCHEDULED` → `OPEN`
→ `CLOSED` do cron (5 phút) + GV; "đang mở" luôn tính lại tại request:
`OPEN && now ≥ availableFrom && (!dueAt || now < dueAt || allowLate)`.

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| GET | `/assignments` | A, T | `AssignmentListQuery` (`classId`, `status`, `from`/`to` theo `scheduledFor` → lịch) → `Paginated<AssignmentSummary>` (kèm `counts`) |
| GET | `/assignments/dashboard` | A, T | → `AssignmentsDashboard` (đến hạn hôm nay, số bài mở, chờ chấm) |
| POST | `/assignments` | perm:`worksheets.assign` | `CreateAssignmentBody` → `AssignmentDetail` (201). 403 `FORBIDDEN_SCOPE`, 409 `WORKSHEET_NOT_PUBLISHED` / `WORKSHEET_EMPTY`. OPEN ngay (+ `ASSIGNMENT_NEW` cả lớp) nếu `availableFrom ≤ now` |
| GET | `/assignments/:id` | A, T | → `AssignmentDetail` (snapshot đầy đủ) |
| PATCH | `/assignments/:id` | perm:`worksheets.assign` | `UpdateAssignmentBody` → `AssignmentDetail` (snapshot không đổi) |
| DELETE | `/assignments/:id` | perm:`worksheets.assign` | 204; 409 `CONFLICT` nếu đã có bài nộp (dùng close) |
| POST | `/assignments/:id/close` · `/reopen` | perm:`worksheets.assign` | → `AssignmentDetail` |
| GET | `/assignments/:id/submissions` | A, T | → `AssignmentRosterResponse` (mỗi HS đang ở lớp một dòng, kể cả `MISSING`) |
| GET | `/assignments/:id/ranking` | A, T | → `AssignmentRankingResponse` |
| GET | `/assignments/:id/stats` | perm:`worksheets.viewStats` | → `AssignmentStats` (phân bố điểm, độ đúng từng câu) |

## submissions (phía giáo viên) — ADR 0019

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| GET | `/submissions/:id` | A, T | → `SubmissionDetail` (có `answerKey`, media ghi âm / tô chữ) |
| PUT | `/submissions/:id/grade` | perm:`worksheets.grade` | `GradeSubmissionBody` → `SubmissionDetail`. 409 `SUBMISSION_NOT_SUBMITTED`; `finalize` thiếu điểm câu chấm tay → 409 `GRADING_INCOMPLETE`; điểm > tối đa → 400. Chốt lần đầu → `SUBMISSION_GRADED` |
| POST | `/submissions/:id/reopen` | perm:`worksheets.grade` | → `SubmissionDetail` (về IN_PROGRESS, xoá điểm) |
| GET | `/submissions/:id/comments` | A, T | → `CommentsResponse` (gốc + reply một cấp) |
| POST | `/submissions/:id/comments` | perm:`worksheets.grade` | `CreateCommentBody` (`worksheetItemId?` theo câu, `parentId?`) → `CommentView` (201). Thông báo HS `COMMENT_REPLY` |
| PATCH | `/comments/:id` | tác giả | `UpdateCommentBody` → `CommentView` |
| DELETE | `/comments/:id` | tác giả, A | 204 (xoá mềm) |

## me (học sinh — phiếu bài tập)

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| GET | `/me/assignments` | S | `?filter=open\|upcoming\|done\|all&page` → `Paginated<MyAssignmentSummary>` (lớp đang học; 404 nếu chưa có lớp) |
| GET | `/me/assignments/:id` | S | → `MyAssignmentDetail` (snapshot **không** answerKey, `media`, các bài nộp của mình; SCHEDULED → 404) |
| POST | `/me/assignments/:id/submissions` | S | → `SubmissionDetail` (201 attempt mới; 200 attempt đang làm). 409 `ASSIGNMENT_NOT_OPEN` / `ATTEMPTS_EXHAUSTED` |
| GET | `/me/assignments/:id/ranking` | S | → `AssignmentRankingResponse` (`me`) |
| GET | `/me/submissions/:id` | S | → `SubmissionDetail` (`answerKey` chỉ khi GRADED và bài giao bật `showAnswersAfterSubmit`) |
| PUT | `/me/submissions/:id/answers` | S | `SaveAnswersBody` (autosave, upsert) → `SaveAnswersResponse`. 409 `SUBMISSION_NOT_EDITABLE` / `ASSIGNMENT_NOT_OPEN`, 400 `ANSWER_TYPE_MISMATCH` / `MEDIA_NOT_READY` |
| POST | `/me/submissions/:id/submit` | S | → `SubmitResponse` (201). Chấm AUTO; GRADED ngay nếu không có câu chấm tay (kèm `rank`), ngược lại SUBMITTED |
| GET | `/me/submissions/:id/comments` | S | → `CommentsResponse` |
| POST | `/me/submissions/:id/comments` | S | `CreateCommentBody` (`parentId` bắt buộc) → `CommentView` (201). Thông báo tác giả gốc |
| GET | `/me/worksheet-stats` | S | → `StudentWorksheetStats` |

## worksheet-stats (perm:`worksheets.viewStats`) và reports

| Method | Path | Ai | Response |
| --- | --- | --- | --- |
| GET | `/worksheet-stats/classes/:id/overview` | A, T | `?range&from&to` (theo `scheduledFor`) → `ClassWorksheetOverview` |
| GET | `/worksheet-stats/students/:id` | A, T | → `StudentWorksheetStats` |
| GET | `/reports/assignments/:id/results.xlsx` | A, T perm:`reports.export` | xlsx: mỗi HS một dòng + điểm từng câu |
