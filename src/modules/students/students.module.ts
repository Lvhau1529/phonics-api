import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { PointsModule } from '@/modules/points/points.module';
import { StudentsController } from '@/modules/students/controllers/students.controller';
import { StudentRepository } from '@/modules/students/repositories/student.repository';
import { StudentActivityService } from '@/modules/students/services/student-activity.service';
import { StudentReaderService } from '@/modules/students/services/student-reader.service';
import { StudentWriterService } from '@/modules/students/services/student-writer.service';

/** Học sinh: danh sách / chi tiết, sửa, đổi lớp, đặt lại mật khẩu, lịch sử điểm / ván chơi */
@Module({
  imports: [AuditModule, PointsModule],
  controllers: [StudentsController],
  providers: [StudentRepository, StudentReaderService, StudentWriterService, StudentActivityService],
  exports: [StudentReaderService],
})
export class StudentsModule {}
