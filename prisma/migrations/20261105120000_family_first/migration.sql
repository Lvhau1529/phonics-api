-- Gia đình là trung tâm (docs/family-first.md, contracts 2.0.0): học sinh không còn thông tin đăng nhập riêng,
-- bỏ thông báo trong app, bỏ theo dõi đổi hạng, bỏ liên hệ phụ huynh dạng cũ trên hồ sơ học sinh.

-- ===== Thêm tay: dữ liệu (chạy trước khi bỏ cột) =====

-- Học sinh: bỏ email / mật khẩu / Google; tăng token_version → mọi access token cũ hết hiệu lực
UPDATE "users"
SET "email" = NULL,
    "email_verified" = false,
    "password_hash" = NULL,
    "google_sub" = NULL,
    "token_version" = "token_version" + 1
WHERE "role" = 'STUDENT'
  AND ("email" IS NOT NULL OR "password_hash" IS NOT NULL OR "google_sub" IS NOT NULL);

-- Thu hồi phiên học sinh tự đăng nhập (phiên do phụ huynh mở có actor_id — giữ)
UPDATE "refresh_tokens"
SET "revoked_at" = now()
WHERE "revoked_at" IS NULL
  AND "actor_id" IS NULL
  AND "user_id" IN (SELECT "id" FROM "users" WHERE "role" = 'STUDENT');

-- Đơn học sinh tự đăng ký kiểu cũ (chờ duyệt, không có tài khoản gia đình) → từ chối, không còn đường duyệt
UPDATE "student_profiles" sp
SET "reject_reason" = COALESCE(sp."reject_reason", 'Học sinh tự đăng ký không còn được hỗ trợ — phụ huynh đăng ký tài khoản gia đình')
FROM "users" u
WHERE u."id" = sp."user_id"
  AND u."role" = 'STUDENT'
  AND u."status" = 'PENDING'
  AND NOT EXISTS (
    SELECT 1 FROM "student_guardians" sg
    JOIN "guardians" g ON g."id" = sg."guardian_id"
    JOIN "users" p ON p."id" = g."user_id"
    WHERE sg."student_id" = u."id" AND p."role" = 'PARENT'
  );

UPDATE "users" u
SET "status" = 'REJECTED'
WHERE u."role" = 'STUDENT'
  AND u."status" = 'PENDING'
  AND NOT EXISTS (
    SELECT 1 FROM "student_guardians" sg
    JOIN "guardians" g ON g."id" = sg."guardian_id"
    JOIN "users" p ON p."id" = g."user_id"
    WHERE sg."student_id" = u."id" AND p."role" = 'PARENT'
  );

-- ===== Sinh bởi prisma migrate diff =====

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_id_fkey";

-- AlterTable
ALTER TABLE "class_memberships" DROP COLUMN "last_rank",
DROP COLUMN "last_rank_at";

-- AlterTable
ALTER TABLE "student_profiles" DROP COLUMN "parent_email",
DROP COLUMN "parent_name",
DROP COLUMN "parent_phone";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "login_mode";

-- DropTable
DROP TABLE "notifications";

-- DropEnum
DROP TYPE "LoginMode";

-- DropEnum
DROP TYPE "NotificationType";
