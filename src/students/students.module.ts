import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PointsModule } from '../points/points.module';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [AuditModule, PointsModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
