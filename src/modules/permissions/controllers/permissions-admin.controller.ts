import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/types/auth.types';
import { SetUserPermissionGroupsDto, UpdateUserPermissionsDto } from '../dto/requests/permissions.dto';
import { PermissionsService } from '../services/permissions.service';
import { UserPermissionsWriterService } from '../services/user-permissions-writer.service';

/** Catalog chức năng + quyền của từng user (chỉ admin) */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller({ path: 'admin', version: API_V1 })
export class PermissionsAdminController {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly writer: UserPermissionsWriterService,
  ) {}

  /** Catalog chức năng (từ contracts) */
  @Get('permissions')
  catalog() {
    return { items: this.permissions.catalog() };
  }

  @Get('users/:id/permissions')
  forUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissions.forUser(id);
  }

  @Put('users/:id/permissions')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserPermissionsDto,
  ) {
    return this.writer.update(actor, id, body);
  }

  @Put('users/:id/permission-groups')
  setGroups(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetUserPermissionGroupsDto,
  ) {
    return this.writer.setGroups(actor, id, body);
  }
}
