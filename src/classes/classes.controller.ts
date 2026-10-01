import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { StudentsService } from '../students/students.service';
import { ClassesService } from './classes.service';
import {
  ClassListQueryDto,
  ClassStudentsQueryDto,
  CreateClassDto,
  SetClassTeachersDto,
  UpdateClassDto,
} from './dto';

/**
 * Lớp học. Ranking / sổ điểm / điểm thưởng theo lớp nằm ở module points (`ClassPointsController`),
 * mở khoá game cho cả lớp nằm ở module games.
 */
@ApiTags('classes')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller('classes')
export class ClassesController {
  constructor(
    private readonly classes: ClassesService,
    private readonly students: StudentsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ClassListQueryDto) {
    return this.classes.list(user, query);
  }

  @Roles('ADMIN')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateClassDto) {
    return this.classes.create(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.classes.get(user, id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateClassDto,
  ) {
    return this.classes.update(user, id, body);
  }

  /** Xoá = lưu trữ (giữ dữ liệu điểm / thành viên) */
  @Roles('ADMIN')
  @HttpCode(204)
  @Delete(':id')
  async archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.classes.archive(user, id);
  }

  @Roles('ADMIN')
  @Put(':id/teachers')
  setTeachers(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetClassTeachersDto,
  ) {
    return this.classes.setTeachers(user, id, body);
  }

  /** Học sinh đang học trong lớp (kèm tổng điểm + hạng) */
  @Get(':id/students')
  async listStudents(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ClassStudentsQueryDto,
  ) {
    // 404 nếu lớp không tồn tại, 403 nếu GV không dạy lớp này
    await this.classes.get(user, id);
    return this.students.list(user, { ...query, classId: id });
  }
}
