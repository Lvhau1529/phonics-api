# Thiết kế: Lịch buổi học thêm + học tăng cường có thời hạn

Trạng thái: **đã triển khai** (contracts 1.21.0, phonics-api + phonics-admin). Bổ sung cho
[attendance-design.md](attendance-design.md) (ca, lịch học sinh, buổi, điểm danh, học phí).

## 1. Bài toán

1. **Xem và thao tác buổi học dạng lịch** (tuần / tháng) thay vì chỉ bảng phân trang ở `/attendance`.
2. **Học tăng cường trước kỳ thi**: học sinh yếu học gộp thêm vào ca của lớp khác trong một khoảng ngắn rồi thôi —
   không kéo dài, không đổi lịch cố định của học sinh.
3. **Học phí mặc định tháng hiện tại** ở mọi màn học phí.

## 2. Quyết định

| Vấn đề | Quyết định | Lý do |
| --- | --- | --- |
| Học tăng cường lưu ở đâu | Dùng lại **lịch xếp ca** (`student_slot_assignments`) với **ngày kết thúc bắt buộc** — không bảng / cột mới | 00:05 tự đưa học sinh vào buổi, hết hạn tự rời ca; đơn giá, điểm danh, học phí chạy như học sinh thường |
| Có tạo sẵn buổi tương lai không | **Không**. Lịch hiển thị buổi tương lai là **buổi dự kiến** tính từ ca + lịch học sinh | Tạo sẵn buổi làm sai cảnh báo "buổi chờ", cho phép xác nhận buổi chưa học, lệch GV khi đổi GV ca, cron 00:05 bỏ qua buổi đã tồn tại |
| Nhận biết "tăng cường" | Dòng lịch có `effectiveTo` (học có thời hạn) → tag **"Đến dd/MM"**; lịch đếm riêng "có thời hạn" | Không cần cột cờ; học sinh sắp rời ca cũng hiện hạn — đúng nghĩa với GV (em đó sắp thôi học ca này) |
| Nhập ngày kết thúc | UI hỏi **"Học đến hết ngày"** (gồm ngày đó), client gửi `effectiveTo = ngày + 1` | `effectiveTo` là ngày đầu tiên **không** học — dễ nhập lệch một buổi |
| Thêm nhiều học sinh | Ô chọn nhiều ở modal xếp ca (khi mở từ trang ca / lịch); client gọi API tạo lịch **từng em**, báo kết quả từng em | Không cần endpoint batch; em lỗi (vd trùng lịch) không chặn em khác |
| API mới | Một endpoint **đọc** `GET /attendance/sessions/calendar` | Danh sách buổi phân trang và không có ngày tương lai |
| Thao tác trên lịch | Dùng lại API có sẵn: trang buổi, huỷ theo ngày + ca, buổi bù, xếp ca | Không thêm luật nghiệp vụ |

## 3. API

`GET /api/v1/attendance/sessions/calendar?from&to&slotId&teacherId&status` — ADMIN mọi ca; GV buổi mình phụ trách /
ca mình dạy (cùng phạm vi với danh sách buổi). `from`, `to` là `YYYY-MM-DD`, **gồm cả hai đầu**, tối đa **42 ngày**
(lưới tháng 6 tuần).

```ts
AttendanceCalendarResponse = {
  from, to,
  today,                      // hôm nay theo APP_TIMEZONE — client không tự đoán múi giờ
  items: CalendarItem[],      // sắp theo date, startTime
}
CalendarItem =
  | { type: 'SESSION', date, startTime, endTime, session: AttendanceSessionSummary }
  | { type: 'PLANNED', date, startTime, endTime, slot: ExtraSlotRef, teachers: TeacherRef[],
      studentCount, limitedCount }   // limitedCount = số học sinh có ngày kết thúc
```

Luật buổi dự kiến (hàm thuần `plannedOccurrences` ở `utils/calendar.ts` + spec):

- Chỉ ngày **≥ hôm nay** (ngày đã qua chỉ hiện buổi thật — quá khứ không có buổi là không có học).
- Ca chưa ngừng (`archivedAt = null`), đúng thứ, trong `[startsOn, endsOn)`.
- Chưa có buổi thật `(slot_id, date)` (kể cả buổi đã huỷ trước — nghỉ lễ).
- Đếm học sinh **ACTIVE** có lịch hiệu lực tại ngày đó; **0 học sinh → không hiện** (00:05 cũng không tạo buổi).
- Lọc `slotId` / `teacherId` như buổi thật; `status` có giá trị → chỉ buổi thật (buổi dự kiến không có trạng thái).
- GV chỉ thấy ca mình dạy.

## 4. phonics-admin

### 4.1. `/attendance` — chuyển **Bảng / Lịch** (`?view=calendar`)

- **Tuần** (mặc định) / **Tháng**; nút Trước / Hôm nay / Sau; dùng chung bộ lọc ca, GV, trạng thái.
- Mỗi buổi là một thẻ: giờ, tên ca, "có mặt / tổng" (buổi thật) hoặc "N HS" (+ "M có hạn") cho buổi dự kiến; màu theo
  trạng thái (dự kiến: viền nét đứt).

| Bấm | Thao tác | Dùng lại |
| --- | --- | --- |
| Buổi thật | Mở trang buổi (điểm danh, xác nhận, báo nghỉ, khôi phục) | `AttendanceSessionPage` |
| Buổi dự kiến | Drawer: học sinh sẽ học (tag "Đến dd/MM"), GV | `GET extra-slots/:id/students?date` |
| ↳ Thêm học sinh tăng cường | Modal xếp ca điền sẵn ca + từ ngày, chọn nhiều em, "học đến hết ngày" bắt buộc | `POST students/:id/slot-assignments` |
| ↳ Báo nghỉ buổi này | Huỷ trước (tạo sẵn buổi trạng thái huỷ) | `POST attendance/sessions/cancel { date, slotIds }` |
| Nút "+" ở ngày | Tạo buổi bù, điền sẵn ngày | `CreateSessionDrawer` |

Thao tác ghi chỉ hiện khi có quyền (`extra.manageSlots` / `extra.manageSchedule`) — server vẫn kiểm tra phạm vi.

### 4.2. Trang ca `/extra-slots/:id`

- "Thêm học sinh": chọn **nhiều** học sinh; công tắc **"Học tăng cường (có thời hạn)"** → ô "Học đến hết ngày" bắt
  buộc.
- Bảng học sinh: tag **"Đến dd/MM"** cho dòng có ngày kết thúc.

### 4.3. Học phí

Mặc định **tháng hiện tại** (vẫn đổi được): Học phí tổng quát, tab Học phí của học sinh, Thông báo học phí, Xuất
phiếu.

## 5. Trường hợp biên

| Tình huống | Xử lý |
| --- | --- |
| Học sinh tăng cường đúng ca mình đang học cố định | 409 `SLOT_ASSIGNMENT_OVERLAP` — báo riêng em đó, các em khác vẫn được thêm |
| Thêm tăng cường từ ngày đã qua | Buổi chờ xác nhận tự thêm em; buổi đã xác nhận hỏi "Cập nhật luôn?" như hiện tại |
| Kết thúc sớm hơn dự định | Sửa ngày ở tab Học thêm / trang ca (`edit`), buổi chờ tự bỏ em |
| Ca có buổi đã huỷ trước (nghỉ lễ) | Lịch hiện buổi thật trạng thái huỷ, không hiện buổi dự kiến trùng |
| Ngày hôm nay trước 00:05 / API bị tắt | Hiện buổi dự kiến; sau khi tạo buổi thì thay bằng buổi thật |
| Khoảng > 42 ngày / `to < from` | 400 `calendarRange` |
