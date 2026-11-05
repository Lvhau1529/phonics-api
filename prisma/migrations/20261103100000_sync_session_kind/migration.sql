-- Loại ca giờ áp cho mọi buổi của ca (trước đây chỉ từ ngày chọn) → đồng bộ buổi đã tạo theo loại ca hiện tại.
-- Chỉ đổi phân loại hiển thị, không đụng tiền (unit_price / charged trên attendance_records).
UPDATE "attendance_sessions" s
SET "kind" = x."kind"
FROM "extra_slots" x
WHERE s."slot_id" = x."id" AND s."kind" <> x."kind";
