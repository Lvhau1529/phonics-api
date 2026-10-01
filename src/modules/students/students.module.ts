import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PointsModule } from '../points/points.module';
import { StudentsService } from './students.service';
import { StudentsController } from './v1/students.controller';

@Module({
  imports: [AuditModule, PointsModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
