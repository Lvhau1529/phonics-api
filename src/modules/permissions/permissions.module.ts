import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionsService } from './permissions.service';
import { AdminPermissionsController } from './v1/admin-permissions.controller';

/** Global vì PermissionsGuard (APP_GUARD) cần PermissionsService */
@Global()
@Module({
  imports: [AuditModule],
  controllers: [AdminPermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
