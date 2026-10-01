import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StudentsModule } from '../students/students.module';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { PublicClassesController } from './public-classes.controller';

@Module({
  imports: [AuditModule, StudentsModule],
  controllers: [PublicClassesController, ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
