-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'AUDIO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'READY');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MISSING_SOUND', 'CROSSWORD', 'UNSCRAMBLE_WORD', 'PICK_LETTERS', 'WORD_SEARCH', 'ODD_ONE_OUT', 'PATTERN_NEXT', 'NUMBER_PICTURES', 'MULTIPLE_CHOICE', 'FILL_BLANK_WORD_BANK', 'WORD_ORDER', 'INLINE_CHOICE', 'TRACE_AND_READ', 'SPEAK');

-- CreateEnum
CREATE TYPE "GradingMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'SHARED');

-- CreateEnum
CREATE TYPE "Subject" AS ENUM ('PHONICS', 'ESL');

-- CreateEnum
CREATE TYPE "WorksheetKind" AS ENUM ('EXTRA', 'HANDOUT', 'WORKSHEET');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('SCHEDULED', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_NEW';
ALTER TYPE "NotificationType" ADD VALUE 'SUBMISSION_GRADED';
ALTER TYPE "NotificationType" ADD VALUE 'COMMENT_REPLY';

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMP(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "type" "QuestionType" NOT NULL,
    "grading_mode" "GradingMode" NOT NULL,
    "instruction" TEXT NOT NULL,
    "instruction_vi" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "example" JSONB,
    "config" JSONB NOT NULL,
    "answer_key" JSONB NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "Visibility" NOT NULL DEFAULT 'SHARED',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worksheets" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subject" "Subject" NOT NULL DEFAULT 'PHONICS',
    "topic" TEXT,
    "grade" TEXT,
    "week" INTEGER,
    "day" INTEGER,
    "kind" "WorksheetKind" NOT NULL DEFAULT 'WORKSHEET',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "Visibility" NOT NULL DEFAULT 'SHARED',
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worksheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worksheet_sections" (
    "id" UUID NOT NULL,
    "worksheet_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "instruction" TEXT,

    CONSTRAINT "worksheet_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worksheet_items" (
    "id" UUID NOT NULL,
    "worksheet_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "points_override" INTEGER,

    CONSTRAINT "worksheet_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "worksheet_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "assigned_by_id" UUID NOT NULL,
    "scheduled_for" DATE NOT NULL,
    "available_from" TIMESTAMP(3) NOT NULL,
    "due_at" TIMESTAMP(3),
    "allow_late" BOOLEAN NOT NULL DEFAULT false,
    "max_attempts" INTEGER NOT NULL DEFAULT 1,
    "show_answers_after_submit" BOOLEAN NOT NULL DEFAULT false,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "snapshot" JSONB NOT NULL,
    "max_score" INTEGER NOT NULL,
    "has_manual_items" BOOLEAN NOT NULL,
    "opened_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "graded_at" TIMESTAMP(3),
    "graded_by_id" UUID,
    "auto_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manual_score" DOUBLE PRECISION,
    "total_score" DOUBLE PRECISION,
    "max_score" INTEGER NOT NULL,
    "duration_ms" INTEGER,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_answers" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "worksheet_item_id" UUID NOT NULL,
    "question_type" "QuestionType" NOT NULL,
    "max_points" INTEGER NOT NULL,
    "answer" JSONB NOT NULL,
    "is_correct" BOOLEAN,
    "auto_score" DOUBLE PRECISION,
    "manual_score" DOUBLE PRECISION,
    "graded_by_id" UUID,
    "graded_at" TIMESTAMP(3),
    "teacher_note" TEXT,
    "grade_detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submission_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_comments" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "worksheet_item_id" UUID,
    "author_id" UUID NOT NULL,
    "parent_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "submission_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_key_key" ON "media_assets"("key");

-- CreateIndex
CREATE INDEX "media_assets_owner_id_created_at_idx" ON "media_assets"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "media_assets_status_created_at_idx" ON "media_assets"("status", "created_at");

-- CreateIndex
CREATE INDEX "questions_created_by_id_status_idx" ON "questions"("created_by_id", "status");

-- CreateIndex
CREATE INDEX "questions_type_status_idx" ON "questions"("type", "status");

-- CreateIndex
CREATE INDEX "questions_visibility_status_idx" ON "questions"("visibility", "status");

-- CreateIndex
CREATE INDEX "worksheets_created_by_id_status_idx" ON "worksheets"("created_by_id", "status");

-- CreateIndex
CREATE INDEX "worksheets_status_visibility_idx" ON "worksheets"("status", "visibility");

-- CreateIndex
CREATE INDEX "worksheets_grade_week_day_idx" ON "worksheets"("grade", "week", "day");

-- CreateIndex
CREATE INDEX "worksheet_sections_worksheet_id_order_idx" ON "worksheet_sections"("worksheet_id", "order");

-- CreateIndex
CREATE INDEX "worksheet_items_section_id_order_idx" ON "worksheet_items"("section_id", "order");

-- CreateIndex
CREATE INDEX "worksheet_items_question_id_idx" ON "worksheet_items"("question_id");

-- CreateIndex
CREATE INDEX "assignments_class_id_scheduled_for_idx" ON "assignments"("class_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "assignments_status_available_from_idx" ON "assignments"("status", "available_from");

-- CreateIndex
CREATE INDEX "assignments_status_due_at_idx" ON "assignments"("status", "due_at");

-- CreateIndex
CREATE INDEX "assignments_worksheet_id_idx" ON "assignments"("worksheet_id");

-- CreateIndex
CREATE INDEX "submissions_assignment_id_status_total_score_duration_ms_idx" ON "submissions"("assignment_id", "status", "total_score" DESC, "duration_ms");

-- CreateIndex
CREATE INDEX "submissions_student_id_status_submitted_at_idx" ON "submissions"("student_id", "status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_assignment_id_student_id_attempt_no_key" ON "submissions"("assignment_id", "student_id", "attempt_no");

-- CreateIndex
CREATE INDEX "submission_answers_question_type_is_correct_idx" ON "submission_answers"("question_type", "is_correct");

-- CreateIndex
CREATE UNIQUE INDEX "submission_answers_submission_id_worksheet_item_id_key" ON "submission_answers"("submission_id", "worksheet_item_id");

-- CreateIndex
CREATE INDEX "submission_comments_submission_id_created_at_idx" ON "submission_comments"("submission_id", "created_at");

-- CreateIndex
CREATE INDEX "submission_comments_parent_id_idx" ON "submission_comments"("parent_id");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheet_sections" ADD CONSTRAINT "worksheet_sections_worksheet_id_fkey" FOREIGN KEY ("worksheet_id") REFERENCES "worksheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheet_items" ADD CONSTRAINT "worksheet_items_worksheet_id_fkey" FOREIGN KEY ("worksheet_id") REFERENCES "worksheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheet_items" ADD CONSTRAINT "worksheet_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "worksheet_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheet_items" ADD CONSTRAINT "worksheet_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_worksheet_id_fkey" FOREIGN KEY ("worksheet_id") REFERENCES "worksheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_graded_by_id_fkey" FOREIGN KEY ("graded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_answers" ADD CONSTRAINT "submission_answers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_answers" ADD CONSTRAINT "submission_answers_graded_by_id_fkey" FOREIGN KEY ("graded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "submission_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------- Thêm tay (không sinh từ schema) ----------
-- Mỗi (bài giao, học sinh) chỉ có một attempt đang làm
CREATE UNIQUE INDEX "submissions_one_in_progress" ON "submissions"("assignment_id", "student_id") WHERE "status" = 'IN_PROGRESS';
-- Lọc câu hỏi theo tag (tags && ARRAY[...])
CREATE INDEX "questions_tags_gin" ON "questions" USING GIN ("tags");
-- Ràng buộc nghiệp vụ
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_max_attempts_chk" CHECK ("max_attempts" BETWEEN 1 AND 10);
ALTER TABLE "questions" ADD CONSTRAINT "questions_points_chk" CHECK ("points" BETWEEN 1 AND 100);
