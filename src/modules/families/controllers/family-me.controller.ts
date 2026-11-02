import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AllowPending } from '@/common/decorators/account.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import {
  ChildInputDto,
  UpdateChildDto,
  UpdateMyGuardianDto,
} from '@/modules/families/dto/requests/families.dto';
import { FamilyRegistrationService } from '@/modules/families/services/family-registration.service';

/** Khu phụ huynh: các bé, thêm / sửa / huỷ bé chờ duyệt, thông tin liên hệ — dùng được cả khi đang chờ duyệt */
@ApiTags('me')
@ApiBearerAuth()
@Roles('PARENT')
@AllowPending()
@Controller({ path: 'me', version: API_V1 })
export class FamilyMeController {
  constructor(private readonly registration: FamilyRegistrationService) {}

  @Get('children')
  children(@CurrentUser() user: AuthUser) {
    return this.registration.profiles(user);
  }

  @Post('children')
  addChild(@CurrentUser() user: AuthUser, @Body() body: ChildInputDto) {
    return this.registration.addChild(user, body);
  }

  @Patch('children/:id')
  updateChild(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateChildDto,
  ) {
    return this.registration.updateChild(user, id, body);
  }

  @HttpCode(204)
  @Delete('children/:id')
  async removeChild(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.registration.removeChild(user, id);
  }

  @Get('guardian')
  guardian(@CurrentUser() user: AuthUser) {
    return this.registration.myGuardian(user);
  }

  @Patch('guardian')
  updateGuardian(@CurrentUser() user: AuthUser, @Body() body: UpdateMyGuardianDto) {
    return this.registration.updateMyGuardian(user, body);
  }
}
