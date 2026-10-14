import { Module } from '@nestjs/common';
import { UsersService } from '@/modules/users/services/users.service';
import { MeController } from '@/modules/users/controllers/users-me.controller';

@Module({ controllers: [MeController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
