import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AUTH } from '../config/constants';
import { ENV } from '../config/env.module';
import { type Env } from '../config/env.schema';
import { PointsModule } from '../points/points.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleService } from './google.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

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
