import { Module } from '@nestjs/common';
import { AdminAuditController } from './admin-audit.controller';
import { AuditService } from './audit.service';

@Module({ controllers: [AdminAuditController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
