import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { RangeQueryDto } from '@/common/dto/query.dto';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { StudentActivityService } from '@/modules/students/services/student-activity.service';
import { StudentReaderService } from '@/modules/students/services/student-reader.service';
import { StudentWriterService } from '@/modules/students/services/student-writer.service';
import {
  GameResultListQueryDto,
  MoveClassDto,
  ResetPasswordDto,
  StudentListQueryDto,
  StudentPointsQueryDto,
  UpdateStudentDto,
} from '@/modules/students/dto/requests/students.dto';

/**
 * Học sinh (admin + giáo viên trong phạm vi lớp mình). `/students/:id/games*` thuộc module games.
 */
@ApiTags('students')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'students', version: API_V1 })
export class StudentsController {
  constructor(
    private readonly reader: StudentReaderService,
    private readonly writer: StudentWriterService,
    private readonly activity: StudentActivityService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: StudentListQueryDto) {
    return this.reader.list(user, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reader.detail(user, id);
  }

  /** ADMIN mọi trường; TEACHER cần students.edit và chỉ được sửa displayName / avatarKey */
  @RequirePermission('students.edit')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStudentDto,
  ) {
    return this.writer.update(user, id, body);
  }

  @RequirePermission('class.changeStudentClass')
  @Post(':id/move-class')
  moveClass(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MoveClassDto,
  ) {
    return this.writer.moveClass(user, id, body);
  }

  @Roles('ADMIN')
  @HttpCode(204)
  @Post(':id/reset-password')
  async resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResetPasswordDto,
  ): Promise<void> {
    await this.writer.resetPassword(user, id, body);
  }

  @Get(':id/points')
  points(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StudentPointsQueryDto,
  ) {
    return this.activity.pointsList(user, id, query);
  }

  @Get(':id/points/by-game')
  pointsByGame(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RangeQueryDto,
  ) {
    return this.activity.pointsByGame(user, id, query);
  }

  @Get(':id/game-results')
  gameResults(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GameResultListQueryDto,
  ) {
    return this.activity.gameResults(user, id, query);
  }
}
