import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreatePermissionGroupBody,
  SetUserPermissionGroupsBody,
  UpdatePermissionGroupBody,
  UpdateUserPermissionsBody,
} from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';
import { type AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsService } from './permissions.service';

class UpdateUserPermissionsDto extends createZodDto(UpdateUserPermissionsBody) {}
class SetUserPermissionGroupsDto extends createZodDto(SetUserPermissionGroupsBody) {}
class CreatePermissionGroupDto extends createZodDto(CreatePermissionGroupBody) {}
class UpdatePermissionGroupDto extends createZodDto(UpdatePermissionGroupBody) {}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminPermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

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
    return this.permissions.update(actor, id, body);
  }

  @Put('users/:id/permission-groups')
  setGroups(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetUserPermissionGroupsDto,
  ) {
    return this.permissions.setGroups(actor, id, body);
  }

  // ---- nhóm quyền ----

  @Get('permission-groups')
  async listGroups() {
    return { items: await this.permissions.listGroups() };
  }

  @Post('permission-groups')
  createGroup(@CurrentUser() actor: AuthUser, @Body() body: CreatePermissionGroupDto) {
    return this.permissions.createGroup(actor, body);
  }

  @Patch('permission-groups/:id')
  updateGroup(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePermissionGroupDto,
  ) {
    return this.permissions.updateGroup(actor, id, body);
  }

  @HttpCode(204)
  @Delete('permission-groups/:id')
  async deleteGroup(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.permissions.deleteGroup(actor, id);
  }
}
