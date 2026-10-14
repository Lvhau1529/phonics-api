import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { AuditListQueryDto } from '@/modules/audit/dto/requests/audit.dto';
import { AuditService } from '@/modules/audit/services/audit.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller({ path: 'admin/audit', version: API_V1 })
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: AuditListQueryDto) {
    return this.audit.list(query);
  }
}
