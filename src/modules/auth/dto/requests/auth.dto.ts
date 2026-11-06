import {
  ChangePasswordBody,
  GoogleBody,
  LinkGoogleBody,
  LoginBody,
  LogoutBody,
  RefreshBody,
} from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class LoginDto extends createZodDto(LoginBody) {}
export class GoogleDto extends createZodDto(GoogleBody) {}
export class LinkGoogleDto extends createZodDto(LinkGoogleBody) {}
export class RefreshDto extends createZodDto(RefreshBody) {}
export class LogoutDto extends createZodDto(LogoutBody) {}
export class ChangePasswordDto extends createZodDto(ChangePasswordBody) {}
