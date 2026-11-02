import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { ExtraLessonsModule } from '@/modules/extra-lessons/extra-lessons.module';
import { FamiliesModule } from '@/modules/families/families.module';
import { PointsModule } from '@/modules/points/points.module';
import { StudentsController } from '@/modules/students/controllers/students.controller';
import { StudentRepository } from '@/modules/students/repositories/student.repository';
import { StudentActivityService } from '@/modules/students/services/student-activity.service';
import { StudentCreatorService } from '@/modules/students/services/student-creator.service';
import { StudentReaderService } from '@/modules/students/services/student-reader.service';
import { StudentWriterService } from '@/modules/students/services/student-writer.service';

/** Học sinh: danh sách / chi tiết, thêm học sinh chưa có tài khoản, sửa, đổi lớp, đặt lại mật khẩu, lịch sử điểm / ván chơi */
@Module({
  imports: [AuditModule, ExtraLessonsModule, FamiliesModule, PointsModule],
  controllers: [StudentsController],
  providers: [
    StudentRepository,
    StudentReaderService,
    StudentWriterService,
    StudentCreatorService,
    StudentActivityService,
  ],
  exports: [StudentReaderService],
})
export class StudentsModule {}
