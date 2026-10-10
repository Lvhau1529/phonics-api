import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { QuestionsController } from './controllers/questions.controller';
import { QuestionRepository } from './repositories/question.repository';
import { QuestionReaderService } from './services/question-reader.service';
import { QuestionWriterService } from './services/question-writer.service';

/** Ngân hàng câu hỏi phiếu bài tập (ADR 0017) */
@Module({
  imports: [AuditModule, MediaModule],
  controllers: [QuestionsController],
  providers: [QuestionRepository, QuestionReaderService, QuestionWriterService],
  exports: [QuestionReaderService],
})
export class QuestionsModule {}
