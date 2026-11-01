-- CreateEnum
CREATE TYPE "MailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "mail_outbox" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "to_email" TEXT,
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "status" "MailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_templates" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_outbox_dedupe_key_key" ON "mail_outbox"("dedupe_key");

-- CreateIndex
CREATE INDEX "mail_outbox_status_next_attempt_at_idx" ON "mail_outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "mail_outbox_ref_type_ref_id_idx" ON "mail_outbox"("ref_type", "ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "mail_templates_key_version_key" ON "mail_templates"("key", "version");

-- AddForeignKey
ALTER TABLE "mail_templates" ADD CONSTRAINT "mail_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------- Thêm tay (không sinh từ schema) ----------
-- Mỗi key chỉ có MỘT phiên bản template đang dùng
CREATE UNIQUE INDEX "mail_templates_active" ON "mail_templates"("key") WHERE "is_active";
