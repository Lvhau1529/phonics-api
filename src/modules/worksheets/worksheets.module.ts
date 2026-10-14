import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { MediaModule } from '@/modules/media/media.module';
import { QuestionsModule } from '@/modules/questions/questions.module';
import { WorksheetsController } from '@/modules/worksheets/controllers/worksheets.controller';
import { WorksheetRepository } from '@/modules/worksheets/repositories/worksheet.repository';
import { WorksheetReaderService } from '@/modules/worksheets/services/worksheet-reader.service';
import { WorksheetWriterService } from '@/modules/worksheets/services/worksheet-writer.service';

/** Phiếu bài tập (metadata + Part + câu) — ADR 0017 */
@Module({
  imports: [AuditModule, MediaModule, QuestionsModule],
  controllers: [WorksheetsController],
  providers: [WorksheetRepository, WorksheetReaderService, WorksheetWriterService],
  exports: [WorksheetReaderService],
})
export class WorksheetsModule {}
