import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { AccountDeletionController } from '@/modules/users/controllers/account-deletion.controller';
import { MeController } from '@/modules/users/controllers/users-me.controller';
import { AccountDeletionRepository } from '@/modules/users/repositories/account-deletion.repository';
import { AccountDeletionService } from '@/modules/users/services/account-deletion.service';
import { UsersService } from '@/modules/users/services/users.service';

@Module({
  imports: [AuditModule],
  controllers: [MeController, AccountDeletionController],
  providers: [UsersService, AccountDeletionRepository, AccountDeletionService],
  exports: [UsersService],
})
export class UsersModule {}
