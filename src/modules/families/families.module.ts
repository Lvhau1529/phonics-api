import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { FamiliesController } from '@/modules/families/controllers/families.controller';
import { FamilyAuthController } from '@/modules/families/controllers/family-auth.controller';
import { FamilyMeController } from '@/modules/families/controllers/family-me.controller';
import { GuardiansController } from '@/modules/families/controllers/guardians.controller';
import { StudentGuardiansController } from '@/modules/families/controllers/student-guardians.controller';
import { FamilyRepository } from '@/modules/families/repositories/family.repository';
import { GuardianRepository } from '@/modules/families/repositories/guardian.repository';
import { FamilyAccountService } from '@/modules/families/services/family-account.service';
import { FamilyApprovalService } from '@/modules/families/services/family-approval.service';
import { FamilyInviteService } from '@/modules/families/services/family-invite.service';
import { FamilyRegistrationService } from '@/modules/families/services/family-registration.service';
import { FamilySessionService } from '@/modules/families/services/family-session.service';
import { GuardianReaderService } from '@/modules/families/services/guardian-reader.service';
import { GuardianWriterService } from '@/modules/families/services/guardian-writer.service';
import { MailModule } from '@/modules/mail/mail.module';
import { PointsModule } from '@/modules/points/points.module';

/**
 * Phụ huynh (guardians) + tài khoản gia đình: đăng ký, chọn hồ sơ bé, duyệt tài khoản, tạo / chuyển sang tài khoản
 * gia đình (docs/attendance-design.md §3, §10). Students dùng `GuardianReaderService` / `GuardianWriterService`.
 */
@Module({
  imports: [AuditModule, MailModule, PointsModule],
  controllers: [
    FamilyAuthController,
    FamilyMeController,
    FamiliesController,
    GuardiansController,
    StudentGuardiansController,
  ],
  providers: [
    FamilyRepository,
    GuardianRepository,
    FamilyInviteService,
    FamilyRegistrationService,
    FamilySessionService,
    FamilyApprovalService,
    FamilyAccountService,
    GuardianReaderService,
    GuardianWriterService,
  ],
  exports: [GuardianReaderService, GuardianWriterService],
})
export class FamiliesModule {}
