import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { CommentsMeController } from '@/modules/comments/controllers/comments-me.controller';
import { CommentsTeacherController } from '@/modules/comments/controllers/comments-teacher.controller';
import { CommentsController } from '@/modules/comments/controllers/comments.controller';
import { CommentsService } from '@/modules/comments/services/comments.service';

/** Nhận xét trên bài nộp (GV ↔ học sinh) */
@Module({
  imports: [AuditModule],
  controllers: [CommentsTeacherController, CommentsMeController, CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
