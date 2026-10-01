import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UpdateUserPermissionsBody } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';
import { type AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsService } from './permissions.service';

class UpdateUserPermissionsDto extends createZodDto(UpdateUserPermissionsBody) {}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminPermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  /** Catalog quyền (từ contracts) */
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
}
