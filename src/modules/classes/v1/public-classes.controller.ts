import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { API_V1 } from '../../../config/api-version';
import { ClassesService } from '../classes.service';

/** Danh sách lớp cho form đăng ký của học sinh (không cần đăng nhập) */
@ApiTags('public')
@Controller({ path: 'public', version: API_V1 })
export class PublicClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  @Get('classes')
  list() {
    return this.classes.publicList();
  }
}
