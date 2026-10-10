import { Module } from '@nestjs/common';
import { UsersService } from './services/users.service';
import { MeController } from './controllers/users-me.controller';

@Module({ controllers: [MeController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
