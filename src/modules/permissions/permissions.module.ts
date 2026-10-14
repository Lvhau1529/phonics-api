import { Global, Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { PermissionGroupsAdminController } from '@/modules/permissions/controllers/permission-groups-admin.controller';
import { PermissionsAdminController } from '@/modules/permissions/controllers/permissions-admin.controller';
import { PermissionRepository } from '@/modules/permissions/repositories/permission.repository';
import { PermissionGroupsService } from '@/modules/permissions/services/permission-groups.service';
import { PermissionsService } from '@/modules/permissions/services/permissions.service';
import { UserPermissionsWriterService } from '@/modules/permissions/services/user-permissions-writer.service';

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
