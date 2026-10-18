# Dữ liệu test QA (sinh bởi `scripts/qa-seed.ts`)

Sinh lúc 16:10 16/10/26 (Asia/Ho_Chi_Minh) qua API `http://localhost:3000`. Mọi dữ liệu tạo qua HTTP API nên đã đi qua đủ luật nghiệp vụ.

> Lưu ý: ván game / sự kiện chỉ nhận `playedAt` trong 24 giờ, "hôm nay / tuần" tính theo giờ VN — xem bảng xếp hạng với `range=all` nếu chạy script từ hôm trước.

## Tài khoản

| Vai trò | Email | Mật khẩu | Ghi chú |
| --- | --- | --- | --- |
| ADMIN | admin@phonics.local | 12345678 (ADMIN_PASSWORD trong .env) | |
| TEACHER | gv.lan@qa.phonics.local | 12345678 | dạy Sunflower, Star, Old; nhóm "Giáo viên chủ nhiệm" (chuyển lớp, xem phụ huynh, mở khoá game) |
| TEACHER | gv.minh@qa.phonics.local | 12345678 | dạy Sunflower, Rainbow; bị REVOKE `reports.export` |
| TEACHER | gv.nghi@qa.phonics.local | 12345678 | DISABLED → không đăng nhập được |
| STUDENT | hs.an@qa.phonics.local | 12345678 | Sunflower — phụ huynh có SĐT + email; điểm phiếu cao nhất |
| STUDENT | hs.binh@qa.phonics.local | 12345678 | Sunflower — chạm trần 60 điểm / ngày; bị trừ -3; bị thu hồi phonics-ocean |
| STUDENT | hs.chi@qa.phonics.local | 12345678 | Sunflower — tự mở khoá phonics-ocean bằng kim cương; có nhận xét + trả lời |
| STUDENT | hs.dung@qa.phonics.local | 12345678 | Sunflower — đang làm dở phiếu Short a |
| STUDENT | hs.en@qa.phonics.local | 12345678 | Sunflower — được thưởng +15, chưa làm phiếu (MISSING) |
| STUDENT | hs.phuc@qa.phonics.local | 12345678 | Star (chuyển từ Sunflower) — nhận CLASS_CHANGED; điểm cũ đi theo |
| STUDENT | hs.giang@qa.phonics.local | 12345678 | Rainbow — chơi game đang tắt (0 điểm); nộp bài trễ hạn |
| STUDENT | hs.ha@qa.phonics.local | 12345678 | Rainbow — gửi trùng ván game (duplicate) |
| STUDENT | hs.khang@qa.phonics.local | 12345678 | Rainbow — gửi kết quả bất hợp lý (bị từ chối) |
| STUDENT | hs.linh@qa.phonics.local | 12345678 | Rainbow — DISABLED → không đăng nhập được |
| STUDENT | hs.manh@qa.phonics.local | 12345678 | Rainbow — đăng ký bằng `Old123456`, admin reset về mật khẩu chung |

Ngoài ra seed demo (`SEED_DEMO=true`) có sẵn `teacher1@demo.local`, `teacher2@demo.local`, `k2a.student01@demo.local`… mật khẩu `12345678`.

## Lớp

| Lớp | Khối | Hiện khi đăng ký | Trạng thái |
| --- | --- | --- | --- |
| QA-K3 Sunflower | K3 | có | hoạt động |
| QA-K3 Rainbow | K3 | có | hoạt động |
| QA-K1 Star | K1 | **không** | hoạt động |
| QA-K2 Old (lưu trữ) | K2 | có | **lưu trữ** |

## Catalog game sau khi chạy

- `phonics-ocean`: giá **50 kim cương** (chưa mở khoá → chơi được nhưng 0 điểm, `GAME_LOCKED`).
- `english-explorers`: bị tắt trong lúc chạy (Giang nhận `GAME_DISABLED`) rồi **bật lại**.

## Bảng xếp hạng (tổng điểm mọi thời gian)

### QA-K3 Sunflower

| Hạng | Học sinh | Điểm |
| --- | --- | --- |
| 1 | Bình | 59 |
| 2 | An | 25 |
| 3 | Chi | 17 |
| 3 | Én | 17 |
| 5 | Dũng | 5 |

### QA-K3 Rainbow

| Hạng | Học sinh | Điểm |
| --- | --- | --- |
| 1 | Khang | 10 |
| 2 | Mạnh | 9 |
| 3 | Linh | 8 |
| 4 | Giang | 7 |
| 5 | Hà | 6 |

### QA-K1 Star

| Hạng | Học sinh | Điểm |
| --- | --- | --- |
| 1 | Phúc | 9 |

## Bài giao

| Bài | Lớp | Trạng thái | Kịch bản |
| --- | --- | --- | --- |
| QA · Short a Review | Sunflower | OPEN | tự chấm, tối đa 2 lần, hiện đáp án sau nộp, hạn +3 ngày |
| QA · Letter Ss (có phần nói) | Sunflower | OPEN | câu SPEAK chấm tay; An, Chi đã chấm; Bình chờ chấm |
| QA · Short a Review | Rainbow | SCHEDULED | mở sau 3 ngày → HS chưa thấy |
| QA · Short a Review | Rainbow | OPEN | hạn đã qua, allowLate → Giang nộp trễ (late) |
| QA · Letter Ss (có phần nói) | Rainbow | CLOSED | hạn đã qua, không cho trễ → HS bị chặn |

### Roster: QA · Short a Review → Sunflower (2 lần làm, hiện đáp án)

| Học sinh | Trạng thái | Điểm |
| --- | --- | --- |
| An | GRADED | 6 |
| Bình | GRADED | 6 |
| Chi | GRADED | 0 |
| Dũng | IN_PROGRESS | — |
| Én | MISSING | — |

### Roster: QA · Letter Ss → Sunflower (có câu nói, chấm tay)

| Học sinh | Trạng thái | Điểm |
| --- | --- | --- |
| An | GRADED | 4 |
| Bình | SUBMITTED | — |
| Chi | GRADED | 2.5 |
| Dũng | MISSING | — |
| Én | MISSING | — |

## Kết quả kiểm tra nghiệp vụ

**68/68 PASS** — audit log hiện có 52 bản ghi.


### 1. Giáo viên, lớp, phân quyền

| | Kịch bản | Mong đợi | Thực tế |
| --- | --- | --- | --- |
| ✅ | Cô Lan thuộc nhóm "Giáo viên chủ nhiệm" → có class.changeStudentClass, games.unlock | có 2 quyền | ["class.changeStudentClass","games.unlock"] |
| ✅ | Thầy Minh bị REVOKE reports.export | không có reports.export | đã bỏ |
| ✅ | GV bị khoá đăng nhập | 403 ACCOUNT_DISABLED | 403 ACCOUNT_DISABLED — Tài khoản đã bị khoá |
| ✅ | Form đăng ký chỉ hiện lớp joinVisible và chưa lưu trữ | có Sunflower, Rainbow; không có Star, Old | ["QA-K3 Rainbow","QA-K3 Sunflower"] |

### 2. Học sinh đăng ký

| | Kịch bản | Mong đợi | Thực tế |
| --- | --- | --- | --- |
| ✅ | Đăng ký 11 học sinh (6 Sunflower, 5 Rainbow) | 11 | 11 |
| ✅ | Đăng ký vào lớp ẩn (joinVisible=false) | 400 CLASS_NOT_JOINABLE | 400 CLASS_NOT_JOINABLE — Lớp này không nhận học sinh mới |
| ✅ | Đăng ký vào lớp đã lưu trữ | 400 CLASS_NOT_JOINABLE | 400 CLASS_NOT_JOINABLE — Lớp này không nhận học sinh mới |
| ✅ | Đăng ký trùng email | 409 EMAIL_TAKEN | 409 EMAIL_TAKEN — Email đã được sử dụng |
| ✅ | Đăng nhập sai mật khẩu | 401 INVALID_CREDENTIALS | 401 INVALID_CREDENTIALS — Sai email hoặc mật khẩu |

### 3. Catalog game

| | Kịch bản | Mong đợi | Thực tế |
| --- | --- | --- | --- |
| ✅ | Admin đặt giá phonics-ocean = 50 kim cương, tắt english-explorers | OK | OK |

### 4. Chơi game, quy đổi điểm

| | Kịch bản | Mong đợi | Thực tế |
| --- | --- | --- | --- |
| ✅ | An: 8/10, 14/15, 5/10 → điểm = min(10, số đúng) | 8, 10, 5 | 8, 10, 5 |
| ✅ | Bình: 7 ván 10/10 trong ngày → trần 60 điểm / ngày | 10 ×6, ván 7 = 0(DAILY_CAP) | 10, 10, 10, 10, 10, 10, 0(DAILY_CAP) |
| ✅ | Chi chơi phonics-ocean khi chưa mở khoá | 0 điểm, GAME_LOCKED | 0 GAME_LOCKED |
| ✅ | Chi mở khoá phonics-ocean bằng 50 kim cương | unlocked, source GEMS | true GEMS |
| ✅ | Chi chơi lại phonics-ocean sau khi mở khoá | 9 điểm | 9 |
| ✅ | Giang chơi game đang tắt (english-explorers) | 0 điểm, GAME_DISABLED | 0 GAME_DISABLED |
| ✅ | Hà gửi lại cùng clientSessionId (đồng bộ offline lặp) | lần 2: duplicate=true, cùng resultId, không cộng thêm | status 200, duplicate=true, tổng=6 |
| ✅ | Khang gửi kết quả bất hợp lý (total 61 > maxTotal 60) | 400 RESULT_IMPLAUSIBLE | 400 RESULT_IMPLAUSIBLE — Kết quả không hợp lệ |
| ✅ | Khang gửi playedAt quá 24h | 400 PLAYED_AT_OUT_OF_RANGE | 400 PLAYED_AT_OUT_OF_RANGE — Thời điểm chơi không hợp lệ |
| ✅ | Gửi 15 sự kiện ẩn danh, gửi lại 3 sự kiện trùng | accepted 15; lần 2 duplicates 3 | accepted 15; lần 2 duplicates 3 |

### 5. Điểm thưởng, phạm vi lớp, mở khoá game

| | Kịch bản | Mong đợi | Thực tế |
| --- | --- | --- | --- |
| ✅ | Cô Lan thưởng Én +15 → Én lên hạng | hạng hiện tại < hạng trước | {"previous":6,"current":3} |
| ✅ | Cô Lan thưởng cả lớp Sunflower +2 (batch) | 6 bút toán | 6 |
| ✅ | Cô Lan trừ điểm (-3) khi không có points.revoke | 403 | 403 FORBIDDEN_PERMISSION — Thiếu quyền thực hiện thao tác này |
| ✅ | Admin trừ Bình -3 (bút toán âm) | points = -3 | -3 |
| ✅ | Thầy Minh thưởng điểm cho lớp Star (không dạy) | 403 FORBIDDEN_SCOPE | 403 FORBIDDEN_SCOPE — Không thuộc phạm vi lớp của bạn |
| ✅ | Cô Lan mở khoá phonics-ocean cho cả lớp Sunflower | unlocked 5, alreadyUnlocked 1 (Chi) | {"unlocked":5,"alreadyUnlocked":1} |
| ✅ | Thầy Minh mở khoá game (không có games.unlock) | 403 | 403 FORBIDDEN_PERMISSION — Thiếu quyền thực hiện thao tác này |
| ✅ | Bình tự mở khoá lại game đã bị admin thu hồi | 403 | 403 FORBIDDEN — Game đang bị giáo viên khoá |

### 6. Quản lý học sinh

| | Kịch bản | Mong đợi | Thực tế |
| --- | --- | --- | --- |
| ✅ | Thầy Minh chuyển lớp học sinh (không có class.changeStudentClass) | 403 | 403 FORBIDDEN_PERMISSION — Thiếu quyền thực hiện thao tác này |
| ✅ | Cô Lan chuyển Phúc Sunflower → Star (điểm đi theo học sinh) | class = QA-K1 Star | QA-K1 Star |
| ✅ | Thầy Minh xem học sinh: không thấy liên hệ phụ huynh | parent = null | null |
| ✅ | Cô Lan (nhóm chủ nhiệm) xem được liên hệ phụ huynh | có parent | Nguyễn Văn Ba |
| ✅ | Linh bị khoá tài khoản → đăng nhập | 403 ACCOUNT_DISABLED | 403 ACCOUNT_DISABLED — Tài khoản đã bị khoá |
| ✅ | Mạnh đăng nhập bằng mật khẩu cũ sau khi admin reset | 401 INVALID_CREDENTIALS | 401 INVALID_CREDENTIALS — Sai email hoặc mật khẩu |
| ✅ | Mạnh đăng nhập bằng mật khẩu mới | OK | OK |

### 7. Câu hỏi và phiếu bài tập

| | Kịch bản | Mong đợi | Thực tế |
| --- | --- | --- | --- |
| ✅ | Cô Lan tạo 7 câu hỏi (6 PUBLISHED, 1 DRAFT PRIVATE), 1 câu có ảnh upload | 6 PUBLISHED + 1 DRAFT | 6 PUBLISHED + DRAFT |
| ✅ | Phát hành phiếu chứa câu DRAFT | 409 QUESTION_NOT_PUBLISHED | 409 QUESTION_NOT_PUBLISHED — Câu hỏi chưa được phát hành |
| ✅ | Lưu trữ câu hỏi đang dùng trong phiếu đã phát hành | 409 WORKSHEET_IN_USE | 409 WORKSHEET_IN_USE — Câu hỏi đang được dùng trong phiếu bài tập |
| ✅ | Thầy Minh sửa câu hỏi của Cô Lan | 403 | 403 FORBIDDEN_SCOPE — Không thuộc phạm vi lớp của bạn |
| ✅ | Phiếu "Short a Review": 4 câu, tổng điểm 6 | 6 | 6 |

### 8. Giao bài

| | Kịch bản | Mong đợi | Thực tế |
| --- | --- | --- | --- |
| ✅ | Trạng thái bài giao | A/S: OPEN; tương lai: SCHEDULED | A=OPEN, S=OPEN, future=SCHEDULED, late=OPEN, closed=OPEN |
| ✅ | Thầy Minh giao bài cho lớp Star (không dạy) | 403 FORBIDDEN_SCOPE | 403 FORBIDDEN_SCOPE — Không thuộc phạm vi lớp của bạn |
| ✅ | Giao phiếu chưa phát hành | 409 WORKSHEET_NOT_PUBLISHED | 409 WORKSHEET_NOT_PUBLISHED — Phiếu bài tập chưa được phát hành |
| ✅ | Học sinh Rainbow mở bài SCHEDULED | 404 | 404 NOT_FOUND — Không tìm thấy bài tập |

### 9. Làm bài, chấm tự động

| | Kịch bản | Mong đợi | Thực tế |
| --- | --- | --- | --- |
| ✅ | An làm đúng hết phiếu tự chấm → GRADED ngay, có hạng | 6/6 GRADED, rank 1 | 6/6 GRADED, rank 1 |
| ✅ | Bình làm 2 lần (maxAttempts=2): lần 1 một phần, lần 2 đúng hết | lần 1 < 6, lần 2 = 6 | 3/6 GRADED → 6/6 GRADED |
| ✅ | Bình bắt đầu lần thứ 3 | 409 ATTEMPTS_EXHAUSTED | 409 ATTEMPTS_EXHAUSTED — Đã hết số lần làm bài |
| ✅ | Chi làm sai hết | 0/6 GRADED | 0/6 GRADED |
| ✅ | An xem lại bài đã chấm: thấy đáp án vì showAnswersAfterSubmit=true | 4/4 câu có answerKey | 4/4 |
| ✅ | Dũng đang làm dở (autosave 2 câu, chưa nộp) | IN_PROGRESS | IN_PROGRESS |

### 10. Bài có câu chấm tay, nhận xét

| | Kịch bản | Mong đợi | Thực tế |
| --- | --- | --- | --- |
| ✅ | Nộp bài có câu SPEAK → SUBMITTED chờ GV chấm | SUBMITTED ×3 | SUBMITTED, SUBMITTED, SUBMITTED |
| ✅ | Chốt điểm khi chưa chấm câu SPEAK | 409 GRADING_INCOMPLETE | 409 GRADING_INCOMPLETE — Còn câu chấm tay chưa có điểm |
| ✅ | Chấm vượt điểm tối đa câu (4 > 3) | 400 | 400 VALIDATION_ERROR — Dữ liệu không hợp lệ |
| ✅ | Bài Letter Ss (showAnswersAfterSubmit=false): học sinh không thấy đáp án | 0 câu có answerKey | 0 |
| ✅ | Cô Lan chấm An 3/3 câu nói và chốt | 4/4 GRADED | 4/4 GRADED |
| ✅ | Cô Lan chấm Chi 1.5/3 (điểm lẻ 0.25) | 2.5/4 GRADED | 2.5/4 |
| ✅ | Học sinh tạo nhận xét gốc (không có parentId) | 400 | 400 VALIDATION_ERROR — Dữ liệu không hợp lệ |
| ✅ | Bình (SUBMITTED) để lại chờ chấm → hiện ở "chờ chấm" | SUBMITTED | SUBMITTED |

### 11. Bài trễ hạn / đã đóng

| | Kịch bản | Mong đợi | Thực tế |
| --- | --- | --- | --- |
| ✅ | Giang nộp bài quá hạn (allowLate=true) → late=true | late=true | late=true |
| ✅ | Hà làm bài đã quá hạn (allowLate=false) | 409 ASSIGNMENT_NOT_OPEN | 409 ASSIGNMENT_NOT_OPEN — Bài tập chưa mở hoặc đã đóng |
| ✅ | Xoá bài giao đã có bài nộp | 409 CONFLICT | 409 CONFLICT — Đã có bài nộp — hãy đóng bài thay vì xoá |

### 12. Thông báo, báo cáo, thống kê

| | Kịch bản | Mong đợi | Thực tế |
| --- | --- | --- | --- |
| ✅ | Thông báo của Chi | có ASSIGNMENT_NEW, SUBMISSION_GRADED, COMMENT_REPLY, BONUS_AWARDED (không có GAME_UNLOCKED vì Chi tự mở khoá trước) | ["ASSIGNMENT_NEW","BONUS_AWARDED","COMMENT_REPLY","RANK_CHANGED","SUBMISSION_GRADED"] |
| ✅ | Thông báo của Phúc | có CLASS_CHANGED | ["BONUS_AWARDED","CLASS_CHANGED","GAME_UNLOCKED","RANK_CHANGED"] |
| ✅ | Thông báo của Én | có BONUS_AWARDED, RANK_CHANGED | ["ASSIGNMENT_NEW","BONUS_AWARDED","GAME_UNLOCKED","RANK_CHANGED"] |
| ✅ | Cô Lan xuất bảng xếp hạng xlsx | 200 + file | 200 7082 bytes |
| ✅ | Thầy Minh xuất báo cáo (bị REVOKE reports.export) | 403 | 403 FORBIDDEN_PERMISSION — Thiếu quyền thực hiện thao tác này |
| ✅ | Dashboard bài tập của Cô Lan | openCount 2, pendingGrading 1 (bài của Bình) | openCount 2, pendingGrading 1 |
| ✅ | Scheduler đóng bài quá hạn không cho trễ; bài cho trễ vẫn mở | closed=CLOSED, late=OPEN | closed=CLOSED, late=OPEN |
