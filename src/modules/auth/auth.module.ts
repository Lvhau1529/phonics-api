import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AUTH } from '@/config/constants';
import { ENV } from '@/config/env.module';
import { type Env } from '@/config/env.schema';
import { AuditModule } from '@/modules/audit/audit.module';
import { UsersModule } from '@/modules/users/users.module';
import { AuthService } from '@/modules/auth/services/auth.service';
import { GoogleLinkService } from '@/modules/auth/services/google-link.service';
import { GoogleService } from '@/modules/auth/services/google.service';
import { PasswordService } from '@/modules/auth/services/password.service';
import { TokenService } from '@/modules/auth/services/token.service';
import { AuthController } from '@/modules/auth/controllers/auth.controller';

/**
 * Global: JwtModule / AuthService / PasswordService / TokenService được guard và các module khác dùng (students reset
 * password, families cấp phiên cho phụ huynh / bé).
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: {
          expiresIn: env.JWT_ACCESS_TTL as `${number}${'s' | 'm' | 'h' | 'd'}`,
          issuer: AUTH.jwtIssuer,
          audience: AUTH.jwtAudience,
        },
        verifyOptions: { issuer: AUTH.jwtIssuer, audience: AUTH.jwtAudience },
      }),
    }),
    UsersModule,
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, GoogleService, GoogleLinkService],
  exports: [JwtModule, AuthService, PasswordService, TokenService, GoogleService],
})
export class AuthModule {}
