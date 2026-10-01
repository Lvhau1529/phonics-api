import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/auth.types';
import { TeachersService } from '../teachers.service';
import { CreateTeacherDto, SetTeacherClassesDto, TeacherListQueryDto, UpdateTeacherDto } from './dto';

/** Quản lý giáo viên — chỉ admin */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller({ path: 'admin/teachers', version: API_V1 })
export class AdminTeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  list(@Query() query: TeacherListQueryDto) {
    return this.teachers.list(query);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() body: CreateTeacherDto) {
    return this.teachers.create(actor, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTeacherDto,
  ) {
    return this.teachers.update(actor, id, body);
  }

  @Put(':id/classes')
  setClasses(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetTeacherClassesDto,
  ) {
    return this.teachers.setClasses(actor, id, body);
  }
}
