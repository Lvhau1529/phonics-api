-- CreateTable
CREATE TABLE "extra_slots" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "room" TEXT,
    "capacity" INTEGER,
    "class_id" UUID,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extra_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_slot_teachers" (
    "slot_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,

    CONSTRAINT "extra_slot_teachers_pkey" PRIMARY KEY ("slot_id","teacher_id")
);

-- CreateTable
CREATE TABLE "student_slot_assignments" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "effective_from" TEXT NOT NULL,
    "effective_to" TEXT,
    "created_by_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_slot_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_rates" (
    "id" UUID NOT NULL,
    "student_id" UUID,
    "slot_id" UUID,
    "price_per_session" INTEGER NOT NULL,
    "effective_from" TEXT NOT NULL,
    "effective_to" TEXT,
    "created_by_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extra_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extra_slots_weekday_archived_at_idx" ON "extra_slots"("weekday", "archived_at");

-- CreateIndex
CREATE INDEX "extra_slot_teachers_teacher_id_idx" ON "extra_slot_teachers"("teacher_id");

-- CreateIndex
CREATE INDEX "student_slot_assignments_slot_id_effective_to_idx" ON "student_slot_assignments"("slot_id", "effective_to");

-- CreateIndex
CREATE INDEX "student_slot_assignments_student_id_effective_to_idx" ON "student_slot_assignments"("student_id", "effective_to");

-- CreateIndex
CREATE INDEX "extra_rates_student_id_effective_from_idx" ON "extra_rates"("student_id", "effective_from");

-- CreateIndex
CREATE INDEX "extra_rates_slot_id_effective_from_idx" ON "extra_rates"("slot_id", "effective_from");

-- AddForeignKey
ALTER TABLE "extra_slots" ADD CONSTRAINT "extra_slots_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_slot_teachers" ADD CONSTRAINT "extra_slot_teachers_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "extra_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_slot_teachers" ADD CONSTRAINT "extra_slot_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_slot_assignments" ADD CONSTRAINT "student_slot_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_slot_assignments" ADD CONSTRAINT "student_slot_assignments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "extra_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_slot_assignments" ADD CONSTRAINT "student_slot_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_rates" ADD CONSTRAINT "extra_rates_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_rates" ADD CONSTRAINT "extra_rates_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "extra_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_rates" ADD CONSTRAINT "extra_rates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===== Thêm tay =====

-- Đơn giá phải có ít nhất một phạm vi; mỗi phạm vi chỉ một dòng đang mở
ALTER TABLE "extra_rates" ADD CONSTRAINT "extra_rates_scope" CHECK ("student_id" IS NOT NULL OR "slot_id" IS NOT NULL);
CREATE UNIQUE INDEX "extra_rates_open" ON "extra_rates" (
  COALESCE("student_id", '00000000-0000-0000-0000-000000000000'),
  COALESCE("slot_id", '00000000-0000-0000-0000-000000000000')
) WHERE "effective_to" IS NULL;

ALTER TABLE "extra_slots" ADD CONSTRAINT "extra_slots_weekday" CHECK ("weekday" BETWEEN 1 AND 7);
ALTER TABLE "extra_rates" ADD CONSTRAINT "extra_rates_price" CHECK ("price_per_session" >= 0);
