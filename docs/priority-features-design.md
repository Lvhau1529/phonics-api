# Thiết kế: 3 tính năng ưu tiên cao — Cổng phụ huynh, Thu học phí, Thành thạo kỹ năng

Trạng thái: **đề xuất v1** (chưa code). Phạm vi: phonics-api (+ contracts 1.19.0), phonics-game, phonics-admin.
Ngày: 2026-11-05. Bổ sung cho [attendance-design.md](attendance-design.md) (§7 học phí tháng, §10.6 quyền PARENT,
§12.2 khu phụ huynh) — tài liệu này **không** thay các quyết định ở đó, chỉ chi tiết hoá phần chưa làm.

| # | Tính năng | Giá trị | Khối lượng (ước) |
| --- | --- | --- | --- |
| A | Cổng phụ huynh (xem tiến độ con, read-only) + mail tuần | Phụ huynh thấy giá trị học → giữ chân | L (API M, game L) |
| B | Ghi nhận đóng học phí + công nợ + số dư trên phiếu | Biết ai còn nợ, bớt đối soát tay | M (B3 đối soát sao kê: M) |
| C | Thành thạo theo âm / từ (skill mastery) | Giáo viên biết bé yếu âm nào; nền cho ôn tập cá nhân hoá | L (dữ liệu M, UI M) |

---

## 0. Hiện trạng tóm tắt (từ khảo sát code)

- **PARENT** chỉ gọi được `auth/*`, `/me/children*`, `/me/guardian`. `RolesGuard` chặn PARENT ở route không có `@Roles`
  (trừ `@AllowParent`/`@Public`), `ROLE_DEFAULT_PERMISSIONS.PARENT = []` nên mọi route `@RequirePermission` cũng 403.
  `AccessService.assertStudentAccess` (`src/core/access/access.service.ts:36-44`) không có nhánh PARENT.
- **phonics-game chưa có code phụ huynh nào**: không đăng ký gia đình, không chọn bé, không `switch-profile`, không trang
  đặt mật khẩu (`attendance-design.md` §14: "Chưa làm: phần game"). `authStore` chỉ biết 1 phiên học sinh. Game đang
  dùng contracts `^1.14.0`.
- **Học phí** luôn tính sống từ `attendance_records` (Σ `unit_price` where `charged`, buổi không huỷ), tách
  `confirmedTotal` / `pendingTotal`. Không có bảng thanh toán, không khoá tháng (`billing_periods` / `student_statements`
  của PR 6 chưa làm). Người trả tiền = `StudentGuardian.isBillingContact` (tối đa 1 / HS). Nội dung CK VietQR
  (`renderTransferContent`) **không có mã định danh** — chỉ tên bé + tháng (+ SĐT tuỳ chọn).
- **Game results**: `details` là JSON tự do ≤ 8000 ký tự, không schema. Chỉ bread-catcher và halloween đã gửi dữ liệu
  từng câu; phonics-ocean / food-stream có sẵn dữ liệu từng câu trong state nhưng không gửi. Chế độ lớp / đội **không
  gửi kết quả** (không gắn được học sinh). Worksheet: `submission_answers` 1 dòng / câu với `isCorrect`, nhưng không có
  `questionId` / tag; `Question.tags` là text tự do (lẫn "week-9", "grade-k"), không vào snapshot.

---

## A. Cổng phụ huynh

### A.1. Quyết định

| Câu hỏi | Chọn | Lý do |
| --- | --- | --- |
| Đặt ở app nào | **phonics-game**, route `#/parent` | Đúng `attendance-design.md` §10.6; phụ huynh đăng nhập 1 lần rồi "Vào chơi với bé"; admin giữ đóng với PARENT |
| Ngôn ngữ | **Tiếng Việt** cho khu phụ huynh (ngoại lệ của luật "game toàn tiếng Anh", giống phần Hướng dẫn) | Người đọc là người lớn Việt |
| Ghi | **Chỉ đọc**. Không nộp bài, không trả lời bình luận thay bé | Phiên bé (`switch-profile`) đã cho làm bài; khu phụ huynh không cần ghi |
| Xếp hạng | Chỉ **hạng của bé** (số), không trả danh sách tên bạn cùng lớp | Riêng tư của gia đình khác |
| Học phí / đơn giá | Chỉ hiện khi phụ huynh là **người nhận học phí** (`isBillingContact`) của bé | Phiếu PDF in tên + SĐT người nhận học phí và anh chị em — phụ huynh thứ hai không nên thấy |
| Phụ huynh `PENDING` | Vẫn chặn (không `@AllowPending`) | Giữ luật hiện có |

### A.2. API

**Kiểm tra quyền (core).** Thêm vào `AccessService`:

```ts
/** PARENT xem được bé: link canAccess, guardian của chính user, chưa xoá; bé ACTIVE, chưa xoá. */
assertGuardianAccess(user: AuthUser, studentId: string): Promise<{ guardianId: string; isBillingContact: boolean }>
```

Truy vấn thẳng `prisma.studentGuardian` (core không import `FamilyRepository`). Cùng điều kiện với
`TokenService.actorStillAllowed` → tách hàm dùng chung để hai nơi không lệch. **Không** thêm nhánh PARENT vào
`assertStudentAccess` — dùng hàm riêng để route GV không vô tình mở cho PARENT.

**Controller mới** — mỗi module một file `<module>-parent.controller.ts`, `@Roles('PARENT')`, `version: API_V1`, không
`@RequirePermission`, path `me/children/:studentId/...`:

| Method | Path | Response | Tái dùng |
| --- | --- | --- | --- |
| GET | `/me/children/:id/overview` | `ChildOverview` (mới): điểm tuần / tháng, hạng trong lớp, số ván 7 ngày, bài tập mở / quá hạn / điểm TB, điểm danh tháng này, 3 nhận xét GV gần nhất, `canViewTuition` | gộp từ các reader bên dưới |
| GET | `/me/children/:id/points` | `MyPointsResponse` bỏ `class.ranking` danh sách | `PointReaderService.myPoints` → đổi tham số sang `studentId` |
| GET | `/me/children/:id/points/history` | `Paginated<PointEntryView>` | `PointReaderService.list` |
| GET | `/me/children/:id/game-results` | `Paginated<GameResultView>` | `StudentActivityService` (bỏ `assertStudent`) |
| GET | `/me/children/:id/assignments` | `Paginated<MyAssignmentSummary>` | `AssignmentStudentService` → đổi `user.id` thành `studentId` |
| GET | `/me/children/:id/submissions/:sid` | `SubmissionDetail` | `SubmissionReaderService` với **`teacher: false`** (bắt buộc — `true` lộ `answerKey`) |
| GET | `/me/children/:id/submissions/:sid/comments` | `CommentsResponse` | `CommentsService.list` + nhánh PARENT trong `loadSubmission`; **không** mở `create` |
| GET | `/me/children/:id/attendance` | `StudentAttendanceResponse` | `AttendanceReaderService.studentMonth`; `unitPrice` chỉ khi `isBillingContact` |
| GET | `/me/children/:id/tuition` | `StudentTuitionResponse` | `TuitionService.student`; 403 nếu không phải người nhận học phí |
| GET | `/me/tuition-statement.pdf?month` | PDF | `TuitionStatementService` → thêm `pdfForGuardian(guardianId, month)`: các bé guardian này là billing contact **∩** `canAccess` |
| GET / PATCH | `/me/notifications` | (có sẵn) | thêm `@AllowParent()` cho `NotificationsController` |

Đổi chữ ký service theo hướng "nhận `studentId`, controller lo quyền" giúp `/me/*` (học sinh) và
`/me/children/:id/*` (phụ huynh) dùng chung code. Contracts: thêm `ChildOverview`, `ENDPOINTS.family.child*`, bump
**1.20.0**.

Phụ: chặn PARENT đăng nhập phonics-admin (`features/auth/authStore.ts` hiện chỉ chặn STUDENT → PARENT vào được một
khung trống toàn 403).

### A.3. phonics-game

Thứ tự bắt buộc (khu phụ huynh không dùng được nếu thiếu các bước trước):

1. **Nâng contracts** `^1.14.0` → bản mới; rà các schema đã đổi.
2. **Phiên phụ huynh** trong `modules/auth`: `authStore` thêm `role`; đăng nhập trả `PARENT` → lưu phiên phụ huynh
   (`phonics-arcade:auth` giữ refresh token phụ huynh), "Vào chơi với bé" → `switch-profile` → phiên bé lưu khoá riêng
   (`phonics-arcade:child-session`); "Khu phụ huynh" → bỏ phiên bé, khôi phục phiên phụ huynh. `scoreSyncStore` queue
   theo `userId` nên không lẫn điểm giữa các bé.
3. **Đăng ký gia đình** (`register-family`), màn **chờ duyệt**, trang **đặt mật khẩu** `#/set-password?token=` (link mail
   `parent.invite` đang trỏ về `GAME_APP_URL` mà game chưa có trang này).
4. **Module `src/modules/family/`** (repository → service → store/hooks → screens, đúng luật kiến trúc của game), route
   `#/parent[/child/:id[/:tab]]` (thêm `PARENT_SEGMENT` trong `platformStore`, root lazy như `AccountRoot`):
   - **Chọn bé**: thẻ từng bé (avatar, tên, trạng thái duyệt) + nút "Chơi" + "Xem tiến độ".
   - **Tổng quan**: KPI tuần (điểm, số ván, bài tập), "Cần chú ý" (bài quá hạn, bài bị trả lại), nhận xét mới của GV.
   - **Bài tập**: danh sách mở / đã nộp → chi tiết bài + nhận xét (chỉ đọc).
   - **Trò chơi**: điểm theo game, lịch sử ván. (Sau C: thêm "Âm bé cần luyện".)
   - **Học thêm & học phí**: lịch điểm danh tháng; nếu là người nhận học phí: học phí tháng + tải phiếu PDF + trạng thái
     đã đóng (sau B).

### A.4. Mail tuần cho phụ huynh

- Template `parent.weekly` (thêm vào `MAIL_TEMPLATE_KEYS`, Liquid, `sample` đủ biến): mỗi bé một khối — số ván, điểm
  tuần, bài tập đã nộp / còn thiếu / sắp đến hạn, số nhận xét mới, buổi học thêm (có mặt / vắng), nút "Xem chi tiết"
  → `GAME_APP_URL/#/parent/child/:id`. Sau C: thêm "3 âm cần luyện".
- `ParentDigestScheduler` (khung giống `ExtraLessonsScheduler`: `setTimeout` tới mốc kế tiếp theo APP_TIMEZONE, bắt
  bù khi API tắt) — **Chủ nhật 19:00**, hằng số trong `config/constants.ts`.
- Người nhận: guardian có email, có ≥1 link `canAccess` **và** `receivesReports = true` (cờ đã có, chưa ai dùng). Bỏ qua
  tuần bé không có hoạt động nào. Idempotent: `dedupeKey = parentWeekly:<guardianId>:<isoWeekStart>`.
- **Huỷ nhận**: link `GET /public/mail/unsubscribe/:token` (token HMAC ký `guardianId + kind`, không cần bảng) → đặt
  `receivesReports = false` cho mọi link của guardian; phụ huynh bật lại trong khu phụ huynh (`PATCH /me/guardian`
  thêm `receivesReports`).

---

## B. Ghi nhận đóng học phí

### B.1. Quyết định mô hình

- **Khoá theo (học sinh, tháng)**, người trả là guardian (ảnh chụp). Lý do: mọi dữ liệu tiền đi theo HS
  (`attendance_records`, `extra_rates`), link billing contact không có lịch sử và có thể đổi / bị xoá mềm; tổng theo
  gia đình = cộng các HS của guardian nhận học phí hiện tại.
- Một lần nộp tiền (1 giao dịch) có thể trả cho nhiều bé / nhiều tháng → **Payment + Allocation**.
- **Số phải trả** của (HS, tháng):
  - Khi PR 6 (kỳ học phí) đã duyệt tháng đó → `student_statements.total` (cố định).
  - Trước đó → `confirmedTotal` sống (chỉ buổi CONFIRMED); `pendingTotal` hiện cảnh báo "còn buổi chưa xác nhận".
  - ⇒ B làm được **trước** PR 6 và tự khớp khi PR 6 xong. Khuyên làm PR 6 ngay sau B1 để số phải trả không trôi sau
    khi đã thu (sửa điểm danh / đổi giá muộn).

### B.2. Dữ liệu (`prisma/schema/billing.prisma`)

```prisma
enum PaymentMethod { CASH TRANSFER OTHER }

model TuitionPayment {
  id          String        @id @default(uuid()) @db.Uuid
  /// Người trả (ảnh chụp lúc ghi); null = HS chưa có phụ huynh
  guardianId  String?       @map("guardian_id") @db.Uuid
  payerName   String        @map("payer_name")
  amount      Int           /// VND, > 0
  paidOn      String        @map("paid_on")      /// 'YYYY-MM-DD'
  method      PaymentMethod
  /// Mã giao dịch ngân hàng / số phiếu thu — unique khi khác null (chống nhập sao kê 2 lần)
  reference   String?
  note        String?
  createdById String        @map("created_by_id") @db.Uuid
  createdAt   DateTime      @default(now()) @map("created_at")
  voidedAt    DateTime?     @map("voided_at")    /// Không xoá cứng — huỷ có lý do
  voidedById  String?       @map("voided_by_id") @db.Uuid
  voidReason  String?       @map("void_reason")
  allocations TuitionAllocation[]
  @@index([guardianId, paidOn])
  @@map("tuition_payments")
}

model TuitionAllocation {
  paymentId String @map("payment_id") @db.Uuid
  studentId String @map("student_id") @db.Uuid
  month     String /// 'YYYY-MM'
  amount    Int    /// > 0
  payment   TuitionPayment @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  @@id([paymentId, studentId, month])
  @@index([studentId, month])
  @@map("tuition_allocations")
}
```

Thêm tay trong migration: `CHECK (amount > 0)` cả hai bảng; unique partial `tuition_payments(reference) WHERE reference
IS NOT NULL AND voided_at IS NULL`. Service kiểm Σ allocation = `amount`.

`Guardian.paymentCode String? @unique` — mã ngắn cố định (vd `PH7K2Q`, base32 không nhầm 0/O) cấp lần đầu cần, dùng
cho đối soát (B.5).

### B.3. Luật

- **Trạng thái (HS, tháng)**: `due` (B.1), `paid = Σ allocation chưa huỷ`, `owing = due − paid` →
  `NONE` (due = 0 và paid = 0) · `PAID` (owing ≤ 0) · `PARTIAL` (0 < paid < due) · `OWING` (paid = 0, due > 0).
  `owing < 0` = **trả dư** (hiện "dư X đ", chuyển tháng sau bằng phân bổ lại). Hàm thuần `utils/balance.ts` + spec.
- **Tự phân bổ** khi ghi thu không chỉ định: FIFO tháng cũ nhất còn nợ, trong các bé guardian là billing contact; dư
  thì đẩy vào tháng hiện tại của bé đầu tiên (trả trước). Người ghi sửa được trước khi lưu.
- **Huỷ phiếu thu** (`void`) thay vì sửa số tiền; sửa chỉ `note` / `reference` / `paidOn`.
- **Quyền mới** (contracts `permissions.ts`): `tuition.viewPayments`, `tuition.recordPayments` — mặc định **ADMIN**;
  cấp cho GV qua trang Phân quyền nếu GV thu tiền mặt. Thêm area `tuition` ở admin (`features/permissions/utils.ts`).
- **Audit**: `tuitionPayment.create` / `.update` / `.void`.

### B.4. API + admin

| Method | Path | Quyền | Mô tả |
| --- | --- | --- | --- |
| GET | `/tuition/balances?month&status&q&page` | `tuition.viewPayments` | Công nợ gộp theo **guardian nhận học phí** (HS không có guardian = 1 dòng riêng): từng bé `due/paid/owing`, `previousOwing` (tháng < month), tổng, trạng thái |
| GET | `/guardians/:id/tuition-ledger?from&to` | `tuition.viewPayments` | Sổ cái gia đình: tháng × bé, các phiếu thu |
| GET | `/tuition/payments?from&to&method&guardianId` | `tuition.viewPayments` | Danh sách phiếu thu (xuất xlsx bằng writer có sẵn) |
| POST | `/tuition/payments` | `tuition.recordPayments` | `CreateTuitionPaymentBody { guardianId?, studentIds?, amount, paidOn, method, reference?, note?, allocations? }`; `allocations` trống = tự phân bổ |
| POST | `/tuition/payments/preview-allocation` | `tuition.recordPayments` | Xem trước phân bổ tự động (form dùng) |
| PATCH | `/tuition/payments/:id` | `tuition.recordPayments` | `note / reference / paidOn` |
| POST | `/tuition/payments/:id/void` | `tuition.recordPayments` | `{ reason }` |

Admin (`features/tuition/`):
- Trang Học phí thêm tab **"Công nợ"**: bảng theo phụ huynh, lọc trạng thái, cột "Nợ kỳ trước", nút **Ghi thu**
  (modal: số tiền, ngày, hình thức, phân bổ xem trước có thể sửa).
- Tab **"Phiếu thu"**: danh sách + huỷ.
- `GuardianDetailDrawer`: mục Sổ học phí. Tab Học phí của HS: thêm cột Đã đóng / Còn nợ.
- Mutation invalidate `qk.attendance.all` + key mới `qk.tuition.*`.

**Phiếu PDF** (`tuition-statement.writer.ts` `summary()`): thêm dòng **"Nợ các tháng trước"**, **"Đã thanh toán"**
(trong tháng), **"Tổng cần thanh toán"** = phát sinh + nợ cũ − đã trả; VietQR `amount` dùng tổng này. Thêm biến
`{code}` vào template nội dung CK, mặc định mới `HP {code} {month}` (vd `HP PH7K2Q T10 2026`).

### B.5. (B3) Đối soát sao kê

1. Admin tải file sao kê (xlsx / csv) của ngân hàng → `POST /tuition/bank-imports` → parser theo mẫu từng ngân hàng
   (cấu hình cột) → các dòng tiền vào.
2. Khớp: regex `PH[0-9A-Z]{4,6}` trong nội dung → guardian; không có mã → gợi ý theo SĐT / tên bé (độ tin thấp).
3. Màn duyệt: dòng khớp chắc (mã + số tiền = tổng nợ) tick sẵn; admin xác nhận → tạo payment `method=TRANSFER`,
   `reference = mã GD ngân hàng` (unique → nhập lại file không trùng).
4. Sau này (tuỳ chọn): webhook dịch vụ báo biến động số dư (Casso / SePay…) dùng chung bộ khớp.

---

## C. Thành thạo kỹ năng (skill mastery)

### C.1. Danh mục kỹ năng (contracts `skills.ts`)

`SkillId = "<họ>:<giá trị>"`, danh mục cố định trong code (giống `PERMISSIONS`), nhãn vi / en:

| Họ | Ví dụ | Nguồn |
| --- | --- | --- |
| `letter` | `letter:s`, `letter:m` (âm đầu / chữ – âm) | ocean sound-reef, food-stream, bread-catcher (chữ đầu) |
| `vowel` | `vowel:short-a` … `short-u` | ocean cvc-*, bread-catcher (suy từ từ CVC) |
| `rime` | `rime:-at`, `rime:-an` | ocean rhyme-current |
| `blend` | `blend:bl`, `blend:fr` | ocean blend-wreck |
| `digraph` | `digraph:sh`, `digraph:th`, `digraph:ck` | ocean digraph-trench |
| `magic-e` | `magic-e:a_e`, `magic-e:i_e` | ocean magic-e-bay |
| `vocab` / `grammar` | `vocab:halloween`, `grammar:has-have` | halloween, odd-one-out, english-explorers (không tính vào heatmap phonics) |

Hàm thuần `deriveSkills({ gameId, levelId, mode, targetId, item }) → SkillId[]` **trong contracts** — server là nơi
gắn nhãn chính thức (đổi luật thì tính lại được từ dữ liệu thô); game không tự gắn.

### C.2. Thu dữ liệu từ game

- `GameResultBody` thêm trường **có kiểu**, tuỳ chọn (client cũ không vỡ):

  ```ts
  answers: z.array(z.strictObject({
    item: z.string().max(40),          // từ / chữ mục tiêu
    targetId: z.string().max(40).optional(),
    mode: z.string().max(30).optional(),
    correct: z.boolean(),
    firstTry: z.boolean(),
    picked: z.string().max(40).optional(),  // chọn sai cái gì → dữ liệu nhầm lẫn
    ms: z.int().min(0).max(120_000).optional(),
  })).max(60).optional()
  ```

  Tách khỏi `details` để không đụng giới hạn 8000 ký tự và có validate. Tái dùng hàng đợi offline + idempotency
  `clientSessionId` — không cần endpoint / queue mới.
- `GameResultWriterService`: trong cùng transaction, `deriveSkills` từng câu → ghi `skill_attempts` + upsert
  `student_skill_stats`. Kiểm hợp lý: `answers.length ≤ total` (sai → bỏ answers, vẫn nhận kết quả).
- Theo game (thứ tự làm):

  | Game | Việc | Khó |
  | --- | --- | --- |
  | phonics-ocean | `answerWrong(fish.word)` nhận tham số; ghi mảng câu hỏi {targetId, answer, picked, firstTry}; thêm đo `ms` | Dễ |
  | food-stream | map `RoundController.records` → answers; lưu `choiceId` sai trong `handleWrong` | Dễ |
  | bread-catcher | đã có `attempts[{word, correct}]` → chuyển sang `answers`, thêm `expected/caught` letter; **backfill** từ `details` cũ | Dễ |
  | halloween / odd-one-out / english-explorers | map record có sẵn → `vocab:` / `grammar:` | Rất dễ, giá trị phonics thấp — làm sau |

- Giới hạn chấp nhận: chế độ lớp / đội không gắn được học sinh (giữ nguyên, ghi rõ trên UI "dữ liệu từ chế độ Solo").

### C.3. Thu dữ liệu từ phiếu bài tập

- `Question.skills String[]` (**tách** khỏi `tags` tự do), chọn từ danh mục C.1 trong form câu hỏi; đưa vào
  `SnapshotQuestion` (bài đã giao giữ nhãn lúc giao).
- Lúc chấm (tự động khi nộp, hoặc chấm tay `finalize`): mỗi `submission_answer` × mỗi skill → `skill_attempts`
  (`source = WORKSHEET`). Mở lại / chấm lại → xoá rồi ghi lại các dòng của submission đó (trong transaction). Chỉ tính
  bài nộp **tốt nhất** khi tổng hợp (giống `BEST_CTE`) để làm lại nhiều lần không phồng số liệu.
- Tận dụng `gradeDetail` (vd MISSING_SOUND `{letters: boolean[]}`) để chấm từng chữ → giai đoạn sau.

### C.4. Dữ liệu (`prisma/schema/skills.prisma`)

```prisma
enum SkillSource { GAME WORKSHEET }

model SkillAttempt {
  id                 BigInt      @id @default(autoincrement())
  studentId          String      @map("student_id") @db.Uuid
  classId            String?     @map("class_id") @db.Uuid
  source             SkillSource
  gameResultId       String?     @map("game_result_id") @db.Uuid        // FK, onDelete Cascade
  submissionAnswerId String?     @map("submission_answer_id") @db.Uuid  // FK, onDelete Cascade
  gameId             String?     @map("game_id")
  skill              String
  item               String
  correct            Boolean
  firstTry           Boolean     @map("first_try")
  picked             String?
  responseMs         Int?        @map("response_ms")
  occurredAt         DateTime    @map("occurred_at")
  @@index([studentId, skill, occurredAt])
  @@index([classId, skill, occurredAt])
  @@map("skill_attempts")
}

/// Tổng hợp ghi khi kết quả về (không job định kỳ — đúng luật CLAUDE.md)
model StudentSkillStat {
  studentId   String   @map("student_id") @db.Uuid
  skill       String
  attempts    Int
  correct     Int
  /// Trung bình trượt mũ (EWMA, α = 0.3) của đúng-lần-đầu: phản ánh gần đây hơn tỉ lệ tổng
  mastery     Float
  lastSeenAt  DateTime @map("last_seen_at")
  @@id([studentId, skill])
  @@map("student_skill_stats")
}
```

Khối lượng ước: 300 HS × 3 ván / ngày × ~15 câu ≈ 13,5k dòng / ngày (~5 triệu / năm) — Postgres + 2 index trên đủ.

**Mức thành thạo** (hiển thị): `< 5 lần` = Chưa đủ dữ liệu · `mastery < 0.6` = Cần luyện · `0.6–0.85` = Đang tiến bộ ·
`≥ 0.85` = Thành thạo. Ngưỡng là hằng số trong contracts.

### C.5. API + admin

| Method | Path | Quyền | Response |
| --- | --- | --- | --- |
| GET | `/stats/students/:id/skills?family` | `stats.view` (+ scope) | `StudentSkills`: từng skill — attempts, accuracy, mastery, mức, lastSeen, 3 từ hay sai nhất |
| GET | `/stats/classes/:id/skills?family&range` | `stats.view` | `ClassSkillMatrix`: cột = skill, hàng = HS, ô = mức; + "5 âm yếu nhất của lớp", cặp nhầm lẫn phổ biến (`item` → `picked`) |
| GET | `/me/children/:id/skills` | PARENT (A) | rút gọn: top 3 cần luyện + top 3 thành thạo |

Admin:
- **Lớp → tab "Kỹ năng"**: heatmap = antd `Table` (HS × skill, ô tô màu theo token theme, dark mode qua `useChartTheme`),
  nhóm cột theo họ (letter / vowel / digraph…), sắp theo skill yếu nhất; cạnh đó bar chart "âm yếu nhất" (dùng lại mẫu
  `QuestionAccuracyChart`, đỏ < 50%).
- **Học sinh → tab "Kỹ năng"**: danh sách theo họ, thanh mức + từ hay sai.
- Không cần thư viện chart mới.

---

## D. Lộ trình

Nguyên tắc: **thu dữ liệu C sớm** (dữ liệu cần thời gian tích luỹ), B mang lại tiền ngay, A cần nhiều việc nền ở game.

| Đợt | API + contracts | Admin | Game |
| --- | --- | --- | --- |
| **1** | B1: `billing.prisma`, balances, payments, quyền, audit · C1: `skills.ts`, `answers` trong `GameResultBody`, `skill_attempts` + stats (contracts **1.20.0**) | Tab Công nợ, Ghi thu, Phiếu thu | Nâng contracts; gửi `answers` ở phonics-ocean, food-stream, bread-catcher |
| **2** | A1: `assertGuardianAccess`, các `*-parent.controller`, refactor service nhận `studentId`, `ChildOverview`, notifications cho PARENT; chặn PARENT ở admin | — | A2: phiên phụ huynh, đăng ký gia đình, đặt mật khẩu, khu `#/parent` |
| **3** | C2: endpoint skills, `Question.skills` + snapshot + ghi lúc chấm · B2: PDF số dư, `paymentCode` + biến `{code}` · A3: `parent.weekly` + scheduler + huỷ nhận | Tab Kỹ năng (lớp, HS), chọn skill trong form câu hỏi | Mục "Âm bé cần luyện" trong khu phụ huynh |
| **4** | PR 6 kỳ học phí (khoá tháng — `attendance-design.md` §7) · B3 nhập sao kê | Màn duyệt kỳ, màn đối soát | — |

E2E luồng chính cần thêm: (1) phụ huynh A không xem được bé của gia đình B; phụ huynh thứ hai (không nhận học phí)
gọi `/tuition` → 403; (2) ghi thu 1 khoản cho 2 bé 2 tháng → công nợ đúng → huỷ phiếu → nợ quay lại; (3) gửi kết quả
ocean có `answers` → `student_skill_stats` cập nhật, gửi lại cùng `clientSessionId` không nhân đôi.

## E. Câu hỏi cần chốt

1. Khu phụ huynh dùng **tiếng Việt** (đề xuất) hay song ngữ?
2. Phụ huynh thứ hai (không nhận học phí) có được xem **lịch điểm danh** không? (đề xuất: có, nhưng không thấy tiền)
3. Ai được **ghi thu**: chỉ admin (đề xuất mặc định) hay cả GV thu tiền mặt?
4. Có làm **PR 6 khoá tháng** ngay sau B1 không, hay chấp nhận số phải trả tính sống một thời gian?
5. Mail tuần: Chủ nhật 19:00 có phù hợp? Gửi cả khi tuần đó bé không học (đề xuất: không)?
