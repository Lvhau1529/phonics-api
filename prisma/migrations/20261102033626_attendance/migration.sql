-- CreateEnum
CREATE TYPE "AttendanceSessionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceMark" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED');

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL,
    "slot_id" UUID,
    "date" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "teacher_ids" UUID[],
    "status" "AttendanceSessionStatus" NOT NULL DEFAULT 'PENDING',
    "present_count" INTEGER NOT NULL DEFAULT 0,
    "records_version" INTEGER NOT NULL DEFAULT 0,
    "digest_count" INTEGER NOT NULL DEFAULT 0,
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_via" TEXT,
    "cancel_reason" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "mark" "AttendanceMark" NOT NULL DEFAULT 'PRESENT',
    "unit_price" INTEGER NOT NULL,
    "rate_id" UUID,
    "charged" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("session_id","student_id")
);

-- CreateTable
CREATE TABLE "attendance_digests" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_digests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_sessions_status_date_idx" ON "attendance_sessions"("status", "date");

-- CreateIndex
CREATE INDEX "attendance_sessions_date_idx" ON "attendance_sessions"("date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_slot_id_date_key" ON "attendance_sessions"("slot_id", "date");

-- CreateIndex
CREATE INDEX "attendance_records_student_id_idx" ON "attendance_records"("student_id");

-- CreateIndex
CREATE INDEX "attendance_records_rate_id_idx" ON "attendance_records"("rate_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_digests_token_hash_key" ON "attendance_digests"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_digests_teacher_id_date_key" ON "attendance_digests"("teacher_id", "date");

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "extra_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_digests" ADD CONSTRAINT "attendance_digests_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Thêm tay =====
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_source" CHECK ("source" IN ('SNAPSHOT', 'MANUAL'));
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_price" CHECK ("unit_price" >= 0);
-- Buổi chờ xác nhận theo GV (mail 21:00)
CREATE INDEX "attendance_sessions_pending_teachers" ON "attendance_sessions" USING GIN ("teacher_ids")
  WHERE "status" = 'PENDING';
