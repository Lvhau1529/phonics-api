-- DropIndex
DROP INDEX "attendance_digests_teacher_id_date_key";

-- AlterTable
ALTER TABLE "attendance_digests" ADD COLUMN     "manual" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "attendance_digests_teacher_id_date_idx" ON "attendance_digests"("teacher_id", "date");

-- Mail tự động 21:00: một / GV / ngày (gửi lại thủ công không giới hạn)
CREATE UNIQUE INDEX "attendance_digests_auto" ON "attendance_digests"("teacher_id", "date") WHERE NOT "manual";
