-- CreateEnum
CREATE TYPE "GuardianRelation" AS ENUM ('MOTHER', 'FATHER', 'GRANDPARENT', 'OTHER');

-- CreateEnum
CREATE TYPE "LoginMode" AS ENUM ('OWN', 'MANAGED');

-- CreateEnum
CREATE TYPE "AuthTokenPurpose" AS ENUM ('INVITE');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'PARENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserStatus" ADD VALUE 'PENDING';
ALTER TYPE "UserStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "actor_id" UUID;

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "reject_reason" TEXT,
ADD COLUMN     "requested_class_id" UUID,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "login_mode" "LoginMode" NOT NULL DEFAULT 'OWN',
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "guardians" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "relation" "GuardianRelation" NOT NULL DEFAULT 'OTHER',
    "is_billing_contact" BOOLEAN NOT NULL DEFAULT false,
    "receives_reports" BOOLEAN NOT NULL DEFAULT true,
    "can_access" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("student_id","guardian_id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "AuthTokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guardians_user_id_key" ON "guardians"("user_id");

-- CreateIndex
CREATE INDEX "guardians_phone_idx" ON "guardians"("phone");

-- CreateIndex
CREATE INDEX "student_guardians_guardian_id_idx" ON "student_guardians"("guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_purpose_idx" ON "auth_tokens"("user_id", "purpose");

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_requested_class_id_fkey" FOREIGN KEY ("requested_class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Thêm tay =====

-- Email phụ huynh unique khi khác null (lưu chữ thường)
CREATE UNIQUE INDEX "guardians_email" ON "guardians"("email") WHERE "email" IS NOT NULL;

-- Mỗi học sinh tối đa một phụ huynh nhận học phí
CREATE UNIQUE INDEX "student_guardians_billing" ON "student_guardians"("student_id") WHERE "is_billing_contact";

-- Đơn chờ duyệt theo lớp đăng ký
CREATE INDEX "student_profiles_requested_class_id_idx" ON "student_profiles"("requested_class_id")
  WHERE "requested_class_id" IS NOT NULL;

-- ===== Chuyển parent_name / parent_email / parent_phone sang guardians (cột cũ giữ chỉ đọc một phiên bản) =====

-- Chuẩn hoá SĐT về E.164 (giống normalizePhone ở src/common/utils/phone.ts)
CREATE FUNCTION pg_temp.norm_phone(p text) RETURNS text AS $$
  SELECT CASE
    WHEN d = '' THEN NULL
    WHEN d LIKE '+%' THEN '+' || replace(d, '+', '')
    WHEN d LIKE '84%' AND length(d) >= 11 THEN '+' || d
    WHEN d LIKE '0%' THEN '+84' || substr(d, 2)
    ELSE d
  END
  FROM (SELECT regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g') AS d) x
$$ LANGUAGE sql IMMUTABLE;

-- Có email: một guardian / email (anh chị em tự gộp); tên + SĐT lấy từ học sinh tạo sớm nhất có dữ liệu
INSERT INTO "guardians" ("id", "full_name", "email", "phone", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  coalesce(
    (array_agg(btrim(sp."parent_name") ORDER BY sp."created_at")
      FILTER (WHERE nullif(btrim(sp."parent_name"), '') IS NOT NULL))[1],
    'Phụ huynh ' || (array_agg(sp."vietnamese_name" ORDER BY sp."created_at"))[1]
  ),
  lower(btrim(sp."parent_email")),
  (array_agg(pg_temp.norm_phone(sp."parent_phone") ORDER BY sp."created_at")
    FILTER (WHERE pg_temp.norm_phone(sp."parent_phone") IS NOT NULL))[1],
  now(),
  now()
FROM "student_profiles" sp
WHERE nullif(btrim(sp."parent_email"), '') IS NOT NULL
GROUP BY lower(btrim(sp."parent_email"));

INSERT INTO "student_guardians" ("student_id", "guardian_id", "is_billing_contact")
SELECT sp."user_id", g."id", true
FROM "student_profiles" sp
JOIN "guardians" g ON g."email" = lower(btrim(sp."parent_email"))
WHERE nullif(btrim(sp."parent_email"), '') IS NOT NULL;

-- Không email nhưng có tên / SĐT: một guardian / học sinh (admin bổ sung email, gộp sau)
CREATE TEMP TABLE "tmp_guardian_map" AS
SELECT
  sp."user_id" AS student_id,
  gen_random_uuid() AS guardian_id,
  coalesce(nullif(btrim(sp."parent_name"), ''), 'Phụ huynh ' || sp."vietnamese_name") AS full_name,
  pg_temp.norm_phone(sp."parent_phone") AS phone
FROM "student_profiles" sp
WHERE nullif(btrim(sp."parent_email"), '') IS NULL
  AND (nullif(btrim(sp."parent_name"), '') IS NOT NULL OR pg_temp.norm_phone(sp."parent_phone") IS NOT NULL);

INSERT INTO "guardians" ("id", "full_name", "phone", "created_at", "updated_at")
SELECT guardian_id, full_name, phone, now(), now() FROM "tmp_guardian_map";

INSERT INTO "student_guardians" ("student_id", "guardian_id", "is_billing_contact")
SELECT student_id, guardian_id, true FROM "tmp_guardian_map";

DROP TABLE "tmp_guardian_map";
