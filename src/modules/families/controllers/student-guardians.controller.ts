import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { SetStudentGuardiansDto } from '@/modules/families/dto/requests/families.dto';
import { GuardianReaderService } from '@/modules/families/services/guardian-reader.service';
import { GuardianWriterService } from '@/modules/families/services/guardian-writer.service';

/** Phụ huynh của một học sinh: xem (admin + GV lớp mình có quyền xem liên hệ), thay (chỉ admin) */
@ApiTags('students')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'students', version: API_V1 })
export class StudentGuardiansController {
  constructor(
    private readonly reader: GuardianReaderService,
    private readonly writer: GuardianWriterService,
  ) {}

  @Get(':id/guardians')
  list(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reader.ofStudent(user, id);
  }

  @Roles('ADMIN')
  @Put(':id/guardians')
  replace(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetStudentGuardiansDto,
  ) {
    return this.writer.setStudentGuardians(user, id, body);
  }
}
