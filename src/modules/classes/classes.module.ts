import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StudentsModule } from '../students/students.module';
import { ClassesService } from './services/classes.service';
import { ClassesController } from './controllers/classes.controller';
import { PublicClassesController } from './controllers/classes-public.controller';

@Module({
  imports: [AuditModule, StudentsModule],
  controllers: [PublicClassesController, ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
