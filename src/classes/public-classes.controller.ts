import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ClassesService } from './classes.service';

/** Danh sách lớp cho form đăng ký của học sinh (không cần đăng nhập) */
@ApiTags('public')
@Controller('public')
export class PublicClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  @Get('classes')
  list() {
    return this.classes.publicList();
  }
}
