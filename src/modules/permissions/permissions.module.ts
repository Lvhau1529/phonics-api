import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionGroupsAdminController } from './controllers/permission-groups-admin.controller';
import { PermissionsAdminController } from './controllers/permissions-admin.controller';
import { PermissionRepository } from './repositories/permission.repository';
import { PermissionGroupsService } from './services/permission-groups.service';
import { PermissionsService } from './services/permissions.service';
import { UserPermissionsWriterService } from './services/user-permissions-writer.service';

/** Global vì PermissionsGuard (APP_GUARD) cần PermissionsService */
@Global()
@Module({
  imports: [AuditModule],
  controllers: [PermissionsAdminController, PermissionGroupsAdminController],
  providers: [
    PermissionRepository,
    PermissionsService,
    UserPermissionsWriterService,
    PermissionGroupsService,
  ],
  exports: [PermissionsService],
})
export class PermissionsModule {}
