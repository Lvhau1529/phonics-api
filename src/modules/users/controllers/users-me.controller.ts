import { Body, Controller, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/types/auth.types';
import { UpdateProfileDto } from '../dto/requests/users.dto';
import { UsersService } from '../services/users.service';

/** /me/profile — các endpoint /me khác nằm ở module tương ứng (points, games, notifications) */
@ApiTags('me')
@ApiBearerAuth()
@Controller({ path: 'me', version: API_V1 })
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto) {
    return this.users.updateProfile(user.id, body);
  }
}
