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
| POST | `/auth/register` | pub | **Cũ** — `RegisterBody` → tạo học sinh `PENDING` (chưa vào lớp) rồi 403 `ACCOUNT_PENDING` (không cấp token). 409 `EMAIL_TAKEN`, 400 `CLASS_NOT_JOINABLE` |
| POST | `/auth/register-family` | pub | `RegisterFamilyBody { credentials (password \| google), parent, children[] }` → `AuthResponse` (201) của phụ huynh `PENDING` |
| POST | `/auth/login` | pub | `LoginBody` → `AuthResponse`. 401 `INVALID_CREDENTIALS`, 403 `ACCOUNT_DISABLED` / `ACCOUNT_REJECTED` / `ACCOUNT_PENDING` (học sinh chờ duyệt; phụ huynh chờ duyệt vẫn đăng nhập được) |
| POST | `/auth/google` | pub | `GoogleBody { idToken, profile? }` → `AuthResponse`. 422 `PROFILE_REQUIRED` khi tài khoản mới (game mới → `register-family`); client cũ gửi `profile` → học sinh `PENDING`, 403 `ACCOUNT_PENDING` |
| GET | `/auth/profiles` | PARENT | → `FamilyProfilesResponse` (các bé được vào, kể cả chờ duyệt) |
| POST | `/auth/switch-profile` | PARENT | `{ studentId }` → `AuthResponse` của bé (claim `act`; refresh token **luôn trong body**). 403 `PROFILE_NOT_APPROVED` / `PROFILE_NOT_ACCESSIBLE` |
| POST | `/auth/set-password` | pub | `SetPasswordBody { token, password }` (link mời 72 h, dùng một lần) → `AuthResponse`. 400 `INVITE_TOKEN_INVALID` |
| POST | `/auth/refresh` | pub | cookie `pa_rt` hoặc `{ refreshToken }` → `AuthResponse` (token xoay vòng). 401 `INVALID_REFRESH` / `REFRESH_REUSED` |
| POST | `/auth/logout` | pub/\* | `{ refreshToken?, all? }` → 204 |
| GET | `/auth/me` | \* | → `MeResponse { user, permissions, actor }` (`actor` = phụ huynh đã mở phiên của bé) |
| POST | `/auth/change-password` | \* | `ChangePasswordBody` → 204 (thu hồi mọi phiên) |

Header `X-Refresh-Transport: body` trên các route auth → refresh token trả trong body thay vì cookie.

Tài khoản `PENDING` (phụ huynh chờ duyệt) chỉ gọi được `auth/me`, `auth/profiles`, `auth/logout`,
`auth/change-password`, `me/children*`, `me/guardian`; route khác 403 `ACCOUNT_PENDING`. Tài khoản `PARENT` bị chặn
(403 `FORBIDDEN`) ở mọi route không khai báo PARENT — kể cả `/me/*` của học sinh.

## Tài khoản gia đình (PARENT)

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| GET | `/me/children` | PARENT | → `FamilyProfilesResponse` |
| POST | `/me/children` | PARENT | `ChildInput` → `FamilyProfile` (bé mới `PENDING`) |
| PATCH | `/me/children/:id` | PARENT | `UpdateChildBody` → `FamilyProfile` (chỉ bé chờ duyệt) |
| DELETE | `/me/children/:id` | PARENT | → 204 (huỷ bé chờ duyệt / bị từ chối) |
| GET / PATCH | `/me/guardian` | PARENT | `UpdateMyGuardianBody { fullName?, phone? }` → `MyGuardian` |

## families — duyệt tài khoản (perm:`families.approve`; T: bé đăng ký vào lớp mình)

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| GET | `/families/pending` | A, T | → `PendingFamiliesResponse` (đơn + bé chờ + cảnh báo trùng; ngoài phạm vi GV ẩn tên) |
| GET | `/families/pending/count` | A, T | → `{ count }` (badge menu) |
| POST | `/families/:id/approve` | A, T | `ApproveFamilyBody { children: [{ studentId, classId }] }` → `FamilyReviewResult`. GV chỉ xếp vào lớp mình; 409 `alreadyReviewed` |
| POST | `/families/:id/reject` | A, T | `RejectFamilyBody { studentIds?, reason }` → `FamilyReviewResult` (không `studentIds` = mọi bé chờ trong phạm vi) |
| POST | `/families/:id/merge` | A, T | `{ guardianId }` → `FamilyReviewResult` (gộp vào phụ huynh có sẵn; GV: phụ huynh đó có con lớp mình) |

`:id` = tài khoản đăng ký: user PARENT, hoặc chính học sinh với đăng ký kiểu cũ.

## extra-slots — ca học thêm (A; T: ca mình dạy)

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| GET | `/extra-slots` | A, T | `ExtraSlotListQuery { includeArchived?, teacherId?, classId? }` → `ExtraSlotsResponse` (GV chỉ ca mình; `defaultPrice` cần perm:`extra.viewPricing`) |
| GET | `/extra-slots/:id` | A, T | → `ExtraSlot` |
| POST | `/extra-slots` | A, T (perm:`extra.manageSlots`) | `CreateExtraSlotBody` → `ExtraSlot` (201). GV tạo → tự phụ trách ca; `classId` phải là lớp mình dạy |
| PATCH | `/extra-slots/:id` | A, T (perm:`extra.manageSlots`, ca mình) | `UpdateExtraSlotBody` → `ExtraSlot` (đổi giờ áp cho buổi đã tạo từ `timeFrom`, mặc định hôm nay, mọi trạng thái; đổi thứ không dời buổi đã tạo; `endsOn` = ngừng ca từ ngày đó: lịch học sinh kết thúc, buổi chờ từ ngày đó bị huỷ, tới ngày thì ca chuyển đã ngừng; `startsOn` = ngày đầu có buổi) |
| DELETE | `/extra-slots/:id` | A, T (perm:`extra.manageSlots`, ca mình) | → 204 ngừng ca ngay (= `endsOn` hôm nay); lịch còn mở kết thúc từ hôm nay, buổi chờ hôm nay bị huỷ |
| PUT | `/extra-slots/:id/teachers` | A, T (perm:`extra.manageSlots`, ca mình) | `SetSlotTeachersBody` → `ExtraSlot`. GV phải còn trong danh sách (400 `keepSelfInSlot`) |
| GET | `/extra-slots/:id/students` | A, T | `?date` → `SlotStudentsResponse` (học sinh học ca tại ngày + đơn giá áp dụng nếu có quyền xem giá) |
| GET | `/extra-slots/:id/rates` | A, T (perm:`extra.viewPricing`) | → `ExtraRatesResponse` (lịch sử giá mặc định của ca) |
| POST | `/extra-slots/:id/rates` | A, T (perm:`extra.managePricing`) | `CreateSlotRateBody` → `ExtraRate` (201) |

## students — học thêm (A; T: học sinh lớp mình hoặc từng học ca mình)

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| GET | `/students/:id/extra` | A, T | → `StudentExtraResponse` (lịch + giá riêng + đơn giá áp dụng hôm nay + cờ `canManageSchedule` / `canManagePricing`) |
| POST | `/students/:id/slot-assignments` | A, T (perm:`extra.manageSchedule`, ca mình) | `CreateSlotAssignmentBody` → `SlotAssignment` (201). 409 `SLOT_ASSIGNMENT_OVERLAP` |
| PATCH | `/students/:id/slot-assignments/:aid` | A, T (perm:`extra.manageSchedule`, ca mình) | `UpdateSlotAssignmentBody` → `SlotAssignment` (sửa ngày; rời ca = đặt `effectiveTo`) |
| DELETE | `/students/:id/slot-assignments/:aid` | A, T (perm:`extra.manageSchedule`, ca mình) | → `DeleteSlotAssignmentResponse { affectedSessions }` (xoá hẳn dòng thêm nhầm; buổi chưa xác nhận tự bỏ học sinh) |
| POST | `/students/:id/slot-assignments/:aid/move` | A, T (perm:`extra.manageSchedule`, cả hai ca) | `MoveSlotAssignmentBody { slotId, from }` → `SlotAssignment` mới (201) |
| GET | `/students/:id/rates` | A, T (perm:`extra.viewPricing`) | → `ExtraRatesResponse` (giá riêng, cả lịch sử) |
| POST | `/students/:id/rates` | A, T (perm:`extra.managePricing`) | `CreateStudentRateBody` → `ExtraRate` (201). GV: 403 `RATE_SCOPE_FORBIDDEN` nếu học sinh học ca của GV khác |

Đơn giá mới từ ngày D: dòng cùng phạm vi đang phủ D đóng tại D; dòng bắt đầu từ D trở đi bị thay thế
(`effectiveTo = effectiveFrom`). Giải đơn giá: (HS, ca) → (HS) → (ca) → 0đ `NONE` (`resolveRate`, §4.1 thiết kế).

## attendance — buổi học thêm & điểm danh (A; T: buổi mình phụ trách / ca mình dạy)

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| GET | `/attendance/sessions` | A, T | `AttendanceSessionListQuery { from?, to?, slotId?, teacherId?, status? }` → `Paginated<AttendanceSessionSummary>` |
| GET | `/attendance/sessions/pending/count` | A, T | → `{ count }` (buổi PENDING đã bắt đầu — badge menu) |
| GET | `/attendance/sessions/:id` | A, T | → `AttendanceSessionDetail` (`unitPrice` cần perm:`extra.viewPricing`) |
| PUT | `/attendance/sessions/:id/records` | A, T (perm:`attendance.confirm`) | `UpdateAttendanceRecordsBody` → detail. Học sinh chưa có → thêm MANUAL; `charged` / `unitPrice` chỉ A. 409 `ATTENDANCE_SESSION_CANCELLED` |
| POST | `/attendance/sessions/:id/confirm` | A, T (perm:`attendance.confirm`) | `{}` → detail (đã xác nhận → ghi lại người / lúc) |
| POST | `/attendance/sessions/resend-digest` | A | `ResendDigestBody { sessionIds }` → `ResendDigestResponse` (mỗi GV của các buổi còn PENDING một mail `teacher.digest` mới, token mới — link cũ vẫn dùng được; không tính vào số lần nhắc tự động; GV thiếu email → `noEmail`) |
| GET | `/attendance/tuition` | A | `?from=YYYY-MM&to=YYYY-MM` (≤ 24 tháng) → `TuitionOverview` (tạm tính từ điểm danh: theo tháng, theo ca, top 10 học sinh, buổi còn chờ xác nhận, bản ghi tính phí giá 0; không gồm buổi huỷ) |
| GET / PUT | `/admin/settings/tuition` | A | Cài đặt phiếu học phí `TuitionSettings` / body `UpdateTuitionSettings` (PUT thay cả bản, trường không gửi = null = không in; audit `settings.updateTuition`) |
| POST | `/attendance/sessions` | A, T (perm:`extra.manageSlots`) | `CreateAttendanceSessionBody` → detail (201) — buổi bù (GV phải có trong `teacherIds`) |
| POST | `/attendance/sessions/cancel` | A, T (perm:`extra.manageSlots`) | `CancelAttendanceSessionsBody { sessionIds \| date + dateTo? + slotIds?, reason }` → `{ cancelled }` (nghỉ nhiều ngày tối đa 62 ngày, ca chưa có buổi được tạo sẵn buổi huỷ; GV: chỉ buổi / ca mình phụ trách) |
| GET | `/attendance/public/digests/:token` | pub | → `AttendanceDigestView` (link mail 21:00; 404 `ATTENDANCE_TOKEN_INVALID`, 410 `ATTENDANCE_TOKEN_EXPIRED`) |
| POST | `/attendance/public/digests/:token/confirm` | pub | `{ sessionIds }` → `ConfirmDigestResponse` (chỉ buổi trong mail, còn PENDING, danh sách chưa đổi) |
| POST | `/students/:id/slot-assignments/apply` | A, T (perm:`extra.manageSchedule`) | `{ sessionIds }` → `{ updated }` — áp lịch vào buổi đã xác nhận (`affectedSessions`) |
| PATCH | `/extra-rates/:id` | A, T (perm:`extra.managePricing`, cùng phạm vi như đặt giá) | `UpdateExtraRateBody { pricePerSession?, note? }` → `ExtraRate` kèm `affectedRecords`. 409 nếu dòng đã bị thay thế từ đầu |
| POST | `/extra-rates/:id/apply` | A, T (perm:`extra.managePricing`) | `{ sessionIds }` → `{ updated }` — áp giá vào buổi đã xác nhận (`affectedRecords`) |
| GET | `/students/:id/attendance` | A, T | `?month=YYYY-MM` → `StudentAttendanceResponse` |
| GET | `/students/:id/tuition` | A, T (perm:`extra.viewPricing`, phạm vi học sinh) | `?from=YYYY-MM&to=YYYY-MM` → `StudentTuitionResponse` (học phí tạm tính theo tháng) |
| GET | `/students/:id/tuition-statement.pdf` | A, T (perm:`extra.viewPricing` + `reports.export`, phạm vi học sinh) | `?month=YYYY-MM` → PDF phiếu báo học phí gửi phụ huynh: gộp các bé cùng phụ huynh nhận học phí (GV chỉ thấy bé trong phạm vi), mỗi loại ca một bảng (kèm cuối buổi `TUTORING`: chỉ buổi có học, không cột điểm danh), thông tin chuyển khoản + VietQR theo cài đặt (trường trống không in) |

Hẹn giờ (`ExtraLessonsScheduler`, theo APP_TIMEZONE): **00:05** tạo buổi của ngày cho mọi ca (học sinh theo lịch, mặc
định có mặt, chốt đơn giá; idempotent theo (ca, ngày), tạo bù `catchUpDays` ngày khi API tắt qua mốc); **21:00** mỗi
GV một mail `teacher.digest` các buổi PENDING (tối đa 3 lần nhắc / buổi). Sửa lịch / đặt giá: buổi PENDING tự đồng
bộ, buổi CONFIRMED trả trong `affectedSessions` / `affectedRecords` để hỏi người dùng.

## guardians (A, perm:`guardians.manage`)

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| GET | `/guardians` | A | `GuardianListQuery (+ hasAccount)` → `Paginated<GuardianSummary>` (tìm theo tên, email, SĐT, tên con) |
| GET / PATCH | `/guardians/:id` | A | `UpdateGuardianBody` → `GuardianSummary`. 409 `GUARDIAN_EMAIL_TAKEN` |
| POST | `/guardians` | A | `CreateGuardianBody` → `GuardianSummary` (201) |
| POST | `/guardians/:id/family-account` | A | → `FamilyAccountResponse` (user PARENT + mail `parent.invite`; chưa đặt mật khẩu → gửi lại) |
| POST | `/guardians/:id/convert-preview` | A | `ConvertFamilyBody { studentIds }` → `ConvertPreview` |
| POST | `/guardians/:id/convert` | A | `ConvertFamilyBody` → `ConvertResult` (học sinh → MANAGED; email phụ huynh trùng email học sinh → chuyển đăng nhập) |

## public

| Method | Path | Ai | Response |
| --- | --- | --- | --- |
| GET | `/public/classes` | pub | `PublicClassesResponse` (lớp đang nhận học sinh), cache 60 s |
| GET | `/public/games` | pub | `PublicGamesResponse` (catalog, kể cả disabled) |
| POST | `/public/events` | pub (+token tuỳ chọn) | `EventBatchBody` → `EventBatchResponse { accepted, duplicates }` |
| GET | `/health` | pub | Terminus, liveness — **không** chạm DB (Docker HEALTHCHECK / uptime monitor) |
| GET | `/health/db` | pub | Terminus, ping DB (readiness) — CI gọi sau deploy |

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
| GET | `/students` | A, T | `StudentListQuery` → `Paginated<StudentSummary>` (`q` tìm không dấu theo tên tiếng Việt / tiếng Anh hoặc email; `sort=vietnameseName:asc` = theo tên rồi họ tên) |
| POST | `/students` | A, T perm:`students.create` | `CreateStudentsBody { students[], effectiveFrom?, parent? }` → `CreateStudentsResponse { items: StudentDetail[], affectedSessions }` (201). Học sinh MANAGED, ACTIVE, không email; mỗi bé tuỳ chọn `classId` / `slotId` / `pricePerSession` (cần `slotId` + perm:`extra.managePricing`). GV: mỗi bé phải vào lớp hoặc ca mình dạy (400 `placementRequired`). `parent` = phụ huynh nhận học phí chung (trùng email phụ huynh có sẵn → gắn vào đó) |
| GET | `/students/:id` | A, T | → `StudentDetail` (`parent` chỉ A / perm:`students.viewParentContact`) |
| PATCH | `/students/:id` | A; T perm:`students.edit` (chỉ tên, avatar) | `UpdateStudentBody` → `StudentDetail` (`vietnameseName`, `englishName` — `null` xoá; `displayName` hiển thị = tên tiếng Anh ?? tên tiếng Việt) |
| POST | `/students/:id/move-class` | A, T perm:`class.changeStudentClass` | `MoveClassBody` → `StudentDetail` |
| POST | `/students/:id/reset-password` | A | `ResetPasswordBody` → 204. 409 `STUDENT_IS_MANAGED` (bé vào qua phụ huynh) |
| GET | `/students/:id/guardians` | A, T (perm:`students.viewParentContact`) | → `StudentGuardiansResponse` |
| PUT | `/students/:id/guardians` | A (perm:`guardians.manage`) | `SetStudentGuardiansBody` → `StudentGuardiansResponse` (thôi `canAccess` → phiên phụ huynh mở cho bé hết hiệu lực) |
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

## media (phiếu bài tập — ADR 0018 / 0024)

Upload ảnh / audio bằng link PUT có chữ ký (API lưu trên đĩa VPS, phục vụ ở `${API_PUBLIC_URL}/files/...`, cache
1 năm, CORS `*`). Giới hạn `MEDIA_LIMITS`
(contracts): ảnh ≤ 5 MB jpg/png/webp, audio ≤ 10 MB mp3/m4a/webm/ogg/wav. Mọi response có media kèm
`media: { [mediaId]: { id, url, kind } }`; JSON config / answer giữ khoá `*MediaId`.

| Method | Path | Ai | Request → Response |
| --- | --- | --- | --- |
| POST | `/media/presign` | \* | `PresignMediaBody` → `PresignMediaResponse` (201). Client PUT file lên `uploadUrl` với đúng `headers`. 400 `MEDIA_TYPE_UNSUPPORTED` / `MEDIA_TOO_LARGE`. Throttle 30/phút |
| PUT | `/media/:id/upload?exp&sig` | pub (chữ ký) | Body = byte file (đúng `uploadUrl` của presign) → 204. 403 chữ ký sai / hết hạn, 415 `MEDIA_TYPE_UNSUPPORTED` (Content-Type khác lúc presign), 413 `MEDIA_TOO_LARGE`, 409 `CONFLICT` (đã READY). Throttle 30/phút |
| POST | `/media/:id/complete` | \* (chủ file) | `CompleteMediaBody` → `MediaView`. Server kiểm file trên đĩa; thiếu / sai size → xoá + 409 `MEDIA_UPLOAD_INCOMPLETE`. Idempotent |
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
→ `CLOSED` do `AssignmentsScheduler` (timer hẹn đúng mốc mở / hạn nộp kế tiếp, không cron định kỳ) + GV; "đang mở" luôn tính lại tại request:
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
