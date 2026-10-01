import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TeachersService } from './teachers.service';
import { AdminTeachersController } from './v1/admin-teachers.controller';

@Module({
  imports: [AuditModule],
  controllers: [AdminTeachersController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
