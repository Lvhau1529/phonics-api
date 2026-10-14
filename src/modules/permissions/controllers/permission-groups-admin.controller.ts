import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import {
  CreatePermissionGroupDto,
  UpdatePermissionGroupDto,
} from '@/modules/permissions/dto/requests/permissions.dto';
import { PermissionGroupsService } from '@/modules/permissions/services/permission-groups.service';

/** Nhóm quyền (chỉ admin) */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller({ path: 'admin/permission-groups', version: API_V1 })
export class PermissionGroupsAdminController {
  constructor(private readonly groups: PermissionGroupsService) {}

  @Get()
  async list() {
    return { items: await this.groups.list() };
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() body: CreatePermissionGroupDto) {
    return this.groups.create(actor, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePermissionGroupDto,
  ) {
    return this.groups.update(actor, id, body);
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.groups.remove(actor, id);
  }
}
