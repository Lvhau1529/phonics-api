import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { TeachersService } from '@/modules/teachers/services/teachers.service';
import { AdminTeachersController } from '@/modules/teachers/controllers/teachers-admin.controller';

@Module({
  imports: [AuditModule],
  controllers: [AdminTeachersController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
