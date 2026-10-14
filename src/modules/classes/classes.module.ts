import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { StudentsModule } from '@/modules/students/students.module';
import { ClassesService } from '@/modules/classes/services/classes.service';
import { ClassesController } from '@/modules/classes/controllers/classes.controller';
import { PublicClassesController } from '@/modules/classes/controllers/classes-public.controller';

@Module({
  imports: [AuditModule, StudentsModule],
  controllers: [PublicClassesController, ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
