import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import {
  ConvertFamilyDto,
  CreateGuardianDto,
  GuardianListQueryDto,
  UpdateGuardianDto,
} from '@/modules/families/dto/requests/families.dto';
import { FamilyAccountService } from '@/modules/families/services/family-account.service';
import { GuardianReaderService } from '@/modules/families/services/guardian-reader.service';
import { GuardianWriterService } from '@/modules/families/services/guardian-writer.service';

/** Phụ huynh + tài khoản gia đình — chỉ admin (danh sách phụ huynh không lọc theo lớp nên không mở cho GV) */
@ApiTags('guardians')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller({ path: 'guardians', version: API_V1 })
export class GuardiansController {
  constructor(
    private readonly reader: GuardianReaderService,
    private readonly writer: GuardianWriterService,
    private readonly accounts: FamilyAccountService,
  ) {}

  @Get()
  list(@Query() query: GuardianListQueryDto) {
    return this.reader.list(query);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.reader.detail(id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateGuardianDto) {
    return this.writer.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateGuardianDto,
  ) {
    return this.writer.update(user, id, body);
  }

  /** Tạo tài khoản gia đình + mail mời đặt mật khẩu (đã có mà chưa đặt mật khẩu → gửi lại) */
  @HttpCode(200)
  @Post(':id/family-account')
  familyAccount(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.createAccount(user, id);
  }

  @HttpCode(200)
  @Post(':id/convert-preview')
  convertPreview(@Param('id', ParseUUIDPipe) id: string, @Body() body: ConvertFamilyDto) {
    return this.accounts.convertPreview(id, body);
  }

  @HttpCode(200)
  @Post(':id/convert')
  convert(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConvertFamilyDto,
  ) {
    return this.accounts.convert(user, id, body);
  }
}
