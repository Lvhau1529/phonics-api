import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { MediaModule } from '@/modules/media/media.module';
import { QuestionsController } from '@/modules/questions/controllers/questions.controller';
import { QuestionRepository } from '@/modules/questions/repositories/question.repository';
import { QuestionReaderService } from '@/modules/questions/services/question-reader.service';
import { QuestionWriterService } from '@/modules/questions/services/question-writer.service';

/** Ngân hàng câu hỏi phiếu bài tập (ADR 0017) */
@Module({
  imports: [AuditModule, MediaModule],
  controllers: [QuestionsController],
  providers: [QuestionRepository, QuestionReaderService, QuestionWriterService],
  exports: [QuestionReaderService],
})
export class QuestionsModule {}
