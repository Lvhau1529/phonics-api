import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TeachersService } from './services/teachers.service';
import { AdminTeachersController } from './controllers/teachers-admin.controller';

@Module({
  imports: [AuditModule],
  controllers: [AdminTeachersController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
