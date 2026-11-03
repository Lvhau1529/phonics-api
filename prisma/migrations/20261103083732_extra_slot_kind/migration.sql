-- CreateEnum
CREATE TYPE "ExtraSlotKind" AS ENUM ('EXTRA_CLASS', 'TUTORING');

-- AlterTable
ALTER TABLE "attendance_sessions" ADD COLUMN     "kind" "ExtraSlotKind" NOT NULL DEFAULT 'EXTRA_CLASS';

-- AlterTable
ALTER TABLE "extra_slots" ADD COLUMN     "kind" "ExtraSlotKind" NOT NULL DEFAULT 'EXTRA_CLASS';
