import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { ApplyToSessionsDto, UpdateExtraRateDto } from '@/modules/extra-lessons/dto/requests/extra.dto';
import { ExtraRateService } from '@/modules/extra-lessons/services/extra-rate.service';

/** Sửa một dòng đơn giá; áp đơn giá vào buổi đã xác nhận (`affectedRecords` khi đặt / sửa giá) */
@ApiTags('extra-slots')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'extra-rates', version: API_V1 })
export class ExtraRatesController {
  constructor(private readonly rates: ExtraRateService) {}

  @RequirePermission('extra.viewPricing', 'extra.managePricing')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateExtraRateDto,
  ) {
    return this.rates.update(user, id, body);
  }

  @RequirePermission('extra.viewPricing', 'extra.managePricing')
  @HttpCode(200)
  @Post(':id/apply')
  apply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApplyToSessionsDto,
  ) {
    return this.rates.apply(user, id, body);
  }
}
