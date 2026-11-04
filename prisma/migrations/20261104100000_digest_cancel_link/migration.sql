-- Mail 21:00 (teacher.digest) thêm link "Nghỉ" ({{ s.cancelLink }}) để GV báo nghỉ buổi ngay từ mail.
-- Mẫu chỉ được seed vào DB ở lần khởi động đầu nên DB đã có mẫu không tự nhận bản mới trong code → tạo phiên bản mới
-- từ bản đang active (giữ nguyên phần admin có thể đã sửa, chỉ chèn link + câu hướng dẫn), tắt bản cũ.
-- Bỏ qua khi bản active đã có cancelLink; DB mới chưa có mẫu → không làm gì (khởi động seed thẳng bản mới trong code).
CREATE TEMP TABLE "_digest_old" AS
SELECT * FROM "mail_templates"
WHERE "key" = 'teacher.digest' AND "is_active" AND position('cancelLink' IN "body_html") = 0;

-- Index unique một bản active / khoá → tắt bản cũ trước khi thêm bản mới
UPDATE "mail_templates" SET "is_active" = false WHERE "id" IN (SELECT "id" FROM "_digest_old");

INSERT INTO "mail_templates" ("id", "key", "version", "subject", "body_html", "is_active")
SELECT
  gen_random_uuid(),
  o."key",
  (SELECT max("version") + 1 FROM "mail_templates" WHERE "key" = o."key"),
  o."subject",
  replace(
    replace(
      o."body_html",
      '<a href="{{ s.editLink }}">Sửa</a></td>',
      '<a href="{{ s.editLink }}">Sửa</a> · <a href="{{ s.cancelLink }}">Nghỉ</a></td>'
    ),
    'Có thay đổi (vắng, thêm học sinh) thì bấm Sửa, đăng nhập rồi xác nhận. Link duyệt hết hạn sau 7 ngày.',
    'Có thay đổi (vắng, thêm học sinh) thì bấm Sửa, đăng nhập rồi xác nhận. Buổi không học (GV / lớp nghỉ) thì bấm Nghỉ — buổi được huỷ, không tính học phí. Link hết hạn sau 7 ngày.'
  ),
  true
FROM "_digest_old" o;

DROP TABLE "_digest_old";
