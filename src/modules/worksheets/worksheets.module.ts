import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { QuestionsModule } from '../questions/questions.module';
import { WorksheetsController } from './controllers/worksheets.controller';
import { WorksheetRepository } from './repositories/worksheet.repository';
import { WorksheetReaderService } from './services/worksheet-reader.service';
import { WorksheetWriterService } from './services/worksheet-writer.service';

/** Phiếu bài tập (metadata + Part + câu) — ADR 0017 */
@Module({
  imports: [AuditModule, MediaModule, QuestionsModule],
  controllers: [WorksheetsController],
  providers: [WorksheetRepository, WorksheetReaderService, WorksheetWriterService],
  exports: [WorksheetReaderService],
})
export class WorksheetsModule {}
