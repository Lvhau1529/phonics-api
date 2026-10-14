import { Module } from '@nestjs/common';
import { AuditService } from '@/modules/audit/services/audit.service';
import { AdminAuditController } from '@/modules/audit/controllers/audit-admin.controller';

@Module({ controllers: [AdminAuditController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
