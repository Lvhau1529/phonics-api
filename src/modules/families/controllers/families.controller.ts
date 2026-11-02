import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import {
  ApproveFamilyDto,
  MergeFamilyDto,
  RejectFamilyDto,
} from '@/modules/families/dto/requests/families.dto';
import { FamilyApprovalService } from '@/modules/families/services/family-approval.service';

/** Duyệt tài khoản tự đăng ký (ADMIN mọi đơn, GV bé đăng ký vào lớp mình). `:id` = tài khoản đăng ký. */
@ApiTags('families')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@RequirePermission('families.approve')
@Controller({ path: 'families', version: API_V1 })
export class FamiliesController {
  constructor(private readonly approval: FamilyApprovalService) {}

  @Get('pending')
  pending(@CurrentUser() user: AuthUser) {
    return this.approval.pending(user);
  }

  @Get('pending/count')
  count(@CurrentUser() user: AuthUser) {
    return this.approval.count(user);
  }

  @HttpCode(200)
  @Post(':id/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApproveFamilyDto,
  ) {
    return this.approval.approve(user, id, body);
  }

  @HttpCode(200)
  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectFamilyDto,
  ) {
    return this.approval.reject(user, id, body);
  }

  @HttpCode(200)
  @Post(':id/merge')
  merge(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: MergeFamilyDto) {
    return this.approval.merge(user, id, body);
  }
}
