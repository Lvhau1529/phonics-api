import { Body, Controller, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UpdateProfileBody } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';
import { type AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

class UpdateProfileDto extends createZodDto(UpdateProfileBody) {}

/** /me/profile — các endpoint /me khác nằm ở module tương ứng (points, games, notifications) */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto) {
    return this.users.updateProfile(user.id, body);
  }
}
