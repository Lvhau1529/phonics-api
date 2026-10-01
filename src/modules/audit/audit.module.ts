import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AdminAuditController } from './v1/admin-audit.controller';

@Module({ controllers: [AdminAuditController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
