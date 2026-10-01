import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminPermissionsController } from './admin-permissions.controller';
import { PermissionsService } from './permissions.service';

/** Global vì PermissionsGuard (APP_GUARD) cần PermissionsService */
@Global()
@Module({
  imports: [AuditModule],
  controllers: [AdminPermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
