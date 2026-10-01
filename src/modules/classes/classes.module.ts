import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StudentsModule } from '../students/students.module';
import { ClassesService } from './classes.service';
import { ClassesController } from './v1/classes.controller';
import { PublicClassesController } from './v1/public-classes.controller';

@Module({
  imports: [AuditModule, StudentsModule],
  controllers: [PublicClassesController, ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
