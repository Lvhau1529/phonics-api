import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { AccountDeletionService } from '@/modules/users/services/account-deletion.service';

/**
 * Xoá (mềm) tài khoản tạo nhầm — chỉ admin. Đường dẫn nằm cạnh tài nguyên tương ứng (students / admin/teachers /
 * guardians); `delete-preview` cho biết liên kết sẽ gỡ (lớp, ca, phụ huynh). Dữ liệu giữ nguyên trong DB.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller({ version: API_V1 })
export class AccountDeletionController {
  constructor(private readonly deletion: AccountDeletionService) {}

  @Get('students/:id/delete-preview')
  studentPreview(@Param('id', ParseUUIDPipe) id: string) {
    return this.deletion.studentPreview(id);
  }

  @HttpCode(204)
  @Delete('students/:id')
  async deleteStudent(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deletion.deleteStudent(user, id);
  }

  @Get('admin/teachers/:id/delete-preview')
  teacherPreview(@Param('id', ParseUUIDPipe) id: string) {
    return this.deletion.teacherPreview(id);
  }

  @HttpCode(204)
  @Delete('admin/teachers/:id')
  async deleteTeacher(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deletion.deleteTeacher(user, id);
  }

  @RequirePermission('guardians.manage')
  @Get('guardians/:id/delete-preview')
  guardianPreview(@Param('id', ParseUUIDPipe) id: string) {
    return this.deletion.guardianPreview(id);
  }

  @RequirePermission('guardians.manage')
  @HttpCode(204)
  @Delete('guardians/:id')
  async deleteGuardian(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deletion.deleteGuardian(user, id);
  }
}
