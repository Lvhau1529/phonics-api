import {
  ChangePasswordBody,
  GoogleBody,
  LoginBody,
  LogoutBody,
  RefreshBody,
  RegisterBody,
} from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class RegisterDto extends createZodDto(RegisterBody) {}
export class LoginDto extends createZodDto(LoginBody) {}
export class GoogleDto extends createZodDto(GoogleBody) {}
export class RefreshDto extends createZodDto(RefreshBody) {}
export class LogoutDto extends createZodDto(LogoutBody) {}
export class ChangePasswordDto extends createZodDto(ChangePasswordBody) {}
