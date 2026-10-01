import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminTeachersController } from './admin-teachers.controller';
import { TeachersService } from './teachers.service';

@Module({
  imports: [AuditModule],
  controllers: [AdminTeachersController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
