import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PointsModule } from '../points/points.module';
import { StudentsController } from './controllers/students.controller';
import { StudentRepository } from './repositories/student.repository';
import { StudentActivityService } from './services/student-activity.service';
import { StudentReaderService } from './services/student-reader.service';
import { StudentWriterService } from './services/student-writer.service';

/** Học sinh: danh sách / chi tiết, sửa, đổi lớp, đặt lại mật khẩu, lịch sử điểm / ván chơi */
@Module({
  imports: [AuditModule, PointsModule],
  controllers: [StudentsController],
  providers: [StudentRepository, StudentReaderService, StudentWriterService, StudentActivityService],
  exports: [StudentReaderService],
})
export class StudentsModule {}
