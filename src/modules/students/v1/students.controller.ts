import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../../../common/decorators/roles.decorator';
import { RangeQueryDto } from '../../../common/dto/query.dto';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/auth.types';
import { StudentsService } from '../students.service';
import {
  GameResultListQueryDto,
  MoveClassDto,
  ResetPasswordDto,
  StudentListQueryDto,
  StudentPointsQueryDto,
  UpdateStudentDto,
} from './dto';

/**
 * Học sinh (admin + giáo viên trong phạm vi lớp mình). `/students/:id/games*` thuộc module games.
 */
@ApiTags('students')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'students', version: API_V1 })
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: StudentListQueryDto) {
    return this.students.list(user, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.detail(user, id);
  }

  /** ADMIN mọi trường; TEACHER cần students.edit và chỉ được sửa displayName / avatarKey */
  @RequirePermission('students.edit')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStudentDto,
  ) {
    return this.students.update(user, id, body);
  }

  @RequirePermission('class.changeStudentClass')
  @Post(':id/move-class')
  moveClass(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MoveClassDto,
  ) {
    return this.students.moveClass(user, id, body);
  }

  @Roles('ADMIN')
  @HttpCode(204)
  @Post(':id/reset-password')
  async resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResetPasswordDto,
  ): Promise<void> {
    await this.students.resetPassword(user, id, body);
  }

  @Get(':id/points')
  points(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StudentPointsQueryDto,
  ) {
    return this.students.pointsList(user, id, query);
  }

  @Get(':id/points/by-game')
  pointsByGame(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RangeQueryDto,
  ) {
    return this.students.pointsByGame(user, id, query);
  }

  @Get(':id/game-results')
  gameResults(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GameResultListQueryDto,
  ) {
    return this.students.gameResults(user, id, query);
  }
}
