import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommentsMeController } from './controllers/comments-me.controller';
import { CommentsTeacherController } from './controllers/comments-teacher.controller';
import { CommentsController } from './controllers/comments.controller';
import { CommentsService } from './services/comments.service';

/** Nhận xét trên bài nộp (GV ↔ học sinh) */
@Module({
  imports: [AuditModule],
  controllers: [CommentsTeacherController, CommentsMeController, CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
