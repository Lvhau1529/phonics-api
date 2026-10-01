import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditListQuery } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from './audit.service';

class AuditListQueryDto extends createZodDto(AuditListQuery) {}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/audit')
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: AuditListQueryDto) {
    return this.audit.list(query);
  }
}
