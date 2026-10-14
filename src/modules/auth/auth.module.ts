import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AUTH } from '@/config/constants';
import { ENV } from '@/config/env.module';
import { type Env } from '@/config/env.schema';
import { PointsModule } from '@/modules/points/points.module';
import { UsersModule } from '@/modules/users/users.module';
import { AuthService } from '@/modules/auth/services/auth.service';
import { GoogleService } from '@/modules/auth/services/google.service';
import { PasswordService } from '@/modules/auth/services/password.service';
import { TokenService } from '@/modules/auth/services/token.service';
import { AuthController } from '@/modules/auth/controllers/auth.controller';

/** Global: JwtModule / PasswordService / TokenService được guard và các module khác (students reset password) dùng */
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
    PointsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, GoogleService],
  exports: [JwtModule, PasswordService, TokenService, GoogleService],
})
export class AuthModule {}
