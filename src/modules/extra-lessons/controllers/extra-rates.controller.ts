import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { ApplyToSessionsDto } from '@/modules/extra-lessons/dto/requests/extra.dto';
import { ExtraRateService } from '@/modules/extra-lessons/services/extra-rate.service';

/** Áp đơn giá vào buổi đã xác nhận (`affectedRecords` khi đặt giá) */
@ApiTags('extra-slots')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'extra-rates', version: API_V1 })
export class ExtraRatesController {
  constructor(private readonly rates: ExtraRateService) {}

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
