# Thiết kế: Gia đình là trung tâm — học sinh không có tài khoản riêng

Trạng thái: **đã triển khai (contracts 2.0.0)**. Ngày: 2026-11-05. Phạm vi: phonics-api (+ contracts), phonics-admin,
phonics-game. Thay một phần `attendance-design.md` §10 (bỏ hẳn kiểu đăng nhập `OWN` của học sinh).

## 1. Bối cảnh

Học sinh ~5 tuổi: **không tự đăng nhập, không đọc được chữ, không tự xem thông báo / xếp hạng**. Bé chơi theo hai cách:

1. **Trên lớp**: giáo viên mở game trên máy chiếu, chế độ lớp / đội — không cần tài khoản (giữ nguyên).
2. **Ở nhà**: trên điện thoại của phụ huynh. Phụ huynh đăng nhập **tài khoản gia đình** một lần → chọn hồ sơ bé →
   bé chơi; điểm / bài tập ghi cho hồ sơ bé (`auth/switch-profile`, token của bé có claim `act` = phụ huynh).

Khảo sát (2026-11-05): bản game production chạy **chế độ offline** (không gọi API) → chưa có học sinh nào thật sự đăng
nhập; học sinh do admin / GV / phụ huynh tạo đã là `MANAGED` (không email / mật khẩu). Bỏ đăng nhập học sinh không ảnh
hưởng người dùng thật.

## 2. Quyết định

| Phần | Quyết định | Lý do |
| --- | --- | --- |
| Đăng nhập của học sinh (email / mật khẩu / Google), `auth/register`, `auth/google` + `profile` | **Bỏ** — STUDENT không đăng nhập được (403 `STUDENT_LOGIN_DISABLED`); phiên bé chỉ mở qua `switch-profile` | Bé 5 tuổi không có tài khoản riêng |
| `LoginMode` (OWN / MANAGED), công cụ chuyển đổi gia đình (`convert-preview` / `convert`), admin đặt lại mật khẩu / sửa email học sinh, lỗi `STUDENT_IS_MANAGED` | **Bỏ** — mọi học sinh là hồ sơ không thông tin đăng nhập; migration xoá email / mật khẩu / Google của học sinh và thu hồi phiên tự đăng nhập | Chỉ còn một kiểu học sinh |
| Đơn đăng ký kiểu cũ (học sinh tự đăng ký, `PendingFamily.parent = null`) | **Bỏ** nhánh cũ; màn Duyệt tài khoản chỉ còn đơn của phụ huynh | Không còn đường tạo đơn kiểu cũ |
| Thông báo trong app (`notifications`, chuông ở game) | **Bỏ cả hệ thống** | Bé không đọc được; admin không đọc; thông báo cho phụ huynh sẽ làm qua khu phụ huynh / Zalo / mail (`priority-features-design.md` A.4) |
| Đổi hạng + thông báo đổi hạng (`last_rank`, `recomputeAndNotify`, `rank` trong response) | **Bỏ**; giữ bảng xếp hạng cho GV (`rankClass`) | Tốn một truy vấn xếp hạng cả lớp mỗi ván, không ai đọc |
| Bé trả lời nhận xét của GV (`POST /me/submissions/:id/comments`) | **Bỏ**; bé / phụ huynh vẫn **xem** nhận xét | Bé không gõ được |
| Xếp hạng cho học sinh (`/me/class/ranking`, `/me/assignments/:id/ranking`, màn RANKING ở game) | **Bỏ** | Không phù hợp lứa tuổi, không ai xem ở nhà |
| `student_profiles.parent_*`, `StudentDetail.parent`, `UpdateStudentBody.parent` | **Bỏ** — liên hệ phụ huynh chỉ qua `guardians` | Trùng dữ liệu |
| `PATCH /me/profile` sửa `email` | **Bỏ trường `email`** (giữ tên / avatar cho nhân viên) | Không client nào gửi |
| `lastLoginAt` của học sinh | **Giữ, đổi nghĩa**: lần gần nhất hồ sơ bé được mở (phụ huynh chọn bé) | Trước đây luôn trống với bé `MANAGED` |
| Game: màn Đăng ký, Sửa hồ sơ, Hồ sơ / Xếp hạng, Tin nhắn, xếp hạng bài tập, ô trả lời GV | **Bỏ** | Màn cho trẻ tự dùng tài khoản |
| Game: đăng nhập | **Đổi thành đăng nhập phụ huynh** → chọn bé → chơi; nút đổi bé có "hỏi người lớn" | Luồng gia đình |
| Game: trang đặt mật khẩu từ link mời | **Thêm** `#/set-password?token=`; link mail đổi sang dạng hash | Link mời trước đây trỏ tới đường dẫn game không có |
| Giữ nguyên | Chế độ lớp / đội, chơi khách (offline), kim cương trên máy, gửi kết quả solo, bài tập (làm / xem kết quả / xem nhận xét), catalog, analytics, điểm danh / học phí, phiếu bài tập, xoá tài khoản (admin), bảng xếp hạng ở admin | — |

## 3. Dữ liệu (migration `family_first`)

- `users`: học sinh → `email`, `password_hash`, `google_sub` = NULL, `email_verified` = false, `token_version + 1`; xoá
  `refresh_tokens` của học sinh không có `actor_id` (phiên tự đăng nhập). Bỏ cột `login_mode` + enum `LoginMode`.
- `student_profiles`: bỏ `parent_name`, `parent_email`, `parent_phone` (đã chép sang `guardians` ở `family_accounts`).
- `class_memberships`: bỏ `last_rank`, `last_rank_at`.
- Bỏ bảng `notifications` + enum `NotificationType`.
- Học sinh `PENDING` kiểu cũ (không có phụ huynh) → `REJECTED` (không còn đường duyệt).

Backup hằng ngày (`deploy/backup.sh`) giữ bản trước migration nếu cần tra lại email học sinh cũ.

## 4. Còn lại (chưa làm)

- Game: form **phụ huynh tự đăng ký** (`register-family`) + thêm bé — hiện phụ huynh được admin tạo tài khoản gia đình và
  gửi link mời.
- Khu phụ huynh xem tiến độ (`priority-features-design.md` A).
- Dữ liệu trên máy theo từng bé (kim cương, tiến độ từng game) — hiện vẫn theo máy.
