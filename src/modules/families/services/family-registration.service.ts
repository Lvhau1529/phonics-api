import { Injectable } from '@nestjs/common';
import {
  type ChildInput,
  DEFAULT_AVATAR,
  FAMILY_MAX_CHILDREN,
  type FamilyProfile,
  type FamilyProfilesResponse,
  type MyGuardian,
  type RegisterFamilyBody,
  type UpdateChildBody,
  type UpdateMyGuardianBody,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { normalizePhone } from '@/common/utils/phone';
import { applyNameChange, nameColumns, profileNameData } from '@/common/utils/student-names';
import { type Tx } from '@/database/types';
import { AuthService } from '@/modules/auth/services/auth.service';
import { GoogleService } from '@/modules/auth/services/google.service';
import { PasswordService } from '@/modules/auth/services/password.service';
import { type AuthResult, type AuthUser, type ClientMeta } from '@/modules/auth/types/auth.types';
import { toFamilyProfile, toMyGuardian } from '@/modules/families/dto/responses/family.view';
import { FamilyRepository } from '@/modules/families/repositories/family.repository';

/** Số bé tối đa của một phụ huynh (đăng ký + thêm sau) */
const MAX_CHILDREN_PER_GUARDIAN = FAMILY_MAX_CHILDREN * 2;

/**
 * Phụ huynh tự đăng ký tài khoản gia đình + quản lý bé đang chờ duyệt (khu phụ huynh). Mọi thứ tạo ra ở trạng thái
 * PENDING; GV / admin duyệt ở `FamilyApprovalService`.
 */
@Injectable()
export class FamilyRegistrationService {
  constructor(
    private readonly repo: FamilyRepository,
    private readonly auth: AuthService,
    private readonly google: GoogleService,
    private readonly passwords: PasswordService,
  ) {}

  /** Tạo user PARENT + guardian + các bé (MANAGED) trong một transaction, rồi đăng nhập phụ huynh (PENDING) */
  async register(body: RegisterFamilyBody, meta: ClientMeta): Promise<AuthResult> {
    const credentials = await this.resolveCredentials(body.credentials);
    if (await this.repo.findUserByEmailOrGoogle(credentials.email, credentials.googleSub)) {
      throw new AppError('EMAIL_TAKEN', 409, {
        message: 'emailTakenSignIn',
        fieldErrors: { email: ['EMAIL_TAKEN'] },
      });
    }
    await this.assertJoinable(body.children.map((c) => c.classId));

    const parentId = await this.repo.transaction(async (tx) => {
      const parent = await this.repo.createUser(tx, {
        email: credentials.email,
        passwordHash: credentials.passwordHash,
        googleSub: credentials.googleSub,
        emailVerified: credentials.emailVerified,
        provider: credentials.provider,
        role: 'PARENT',
        status: 'PENDING',
        displayName: body.parent.fullName.slice(0, 30),
      });
      // Email trùng phụ huynh có sẵn (vd trung tâm đã nhập từ trước) → để trống, người duyệt gộp đơn
      const emailFree = !(await this.repo.isGuardianEmailTaken(credentials.email, tx));
      const guardian = await this.repo.createGuardian(tx, {
        fullName: body.parent.fullName,
        email: emailFree ? credentials.email : null,
        phone: normalizePhone(body.parent.phone),
        userId: parent.id,
      });
      for (const child of body.children) await this.createChild(tx, guardian.id, child);
      return parent.id;
    });
    return this.auth.startSession(parentId, meta, { created: true });
  }

  /** Các bé phụ huynh được vào (màn chọn bé) */
  async profiles(user: AuthUser): Promise<FamilyProfilesResponse> {
    const guardian = await this.guardianOf(user);
    const children = await this.repo.accessibleChildren(guardian.id);
    return { items: children.map(toFamilyProfile) };
  }

  /** Thêm bé vào tài khoản đã có → bé PENDING, các bé khác vẫn chơi bình thường */
  async addChild(user: AuthUser, input: ChildInput): Promise<FamilyProfile> {
    const guardian = await this.guardianOf(user);
    if ((await this.repo.countChildren(guardian.id)) >= MAX_CHILDREN_PER_GUARDIAN) {
      throw new AppError('CONFLICT', 409);
    }
    await this.assertJoinable([input.classId]);
    const id = await this.repo.transaction((tx) => this.createChild(tx, guardian.id, input));
    return this.profileOf(id);
  }

  /** Sửa bé còn chờ duyệt (tên, avatar, lớp đăng ký) */
  async updateChild(user: AuthUser, studentId: string, body: UpdateChildBody): Promise<FamilyProfile> {
    const child = await this.pendingChildOf(user, studentId);
    if (body.classId) await this.assertJoinable([body.classId]);
    const next = applyNameChange(
      { vietnameseName: child.vietnameseName, englishName: child.englishName },
      body,
    );
    const names = next ? nameColumns(next) : null;
    await this.repo.updateUser(studentId, {
      displayName: names?.displayName,
      avatarKey: body.avatarKey,
      studentProfile: {
        update: {
          ...(names ? profileNameData(names) : {}),
          requestedClass: body.classId ? { connect: { id: body.classId } } : undefined,
        },
      },
    });
    return this.profileOf(studentId);
  }

  /** Huỷ đăng ký một bé còn chờ duyệt (hoặc đã bị từ chối) — xoá hẳn hồ sơ */
  async removeChild(user: AuthUser, studentId: string): Promise<void> {
    await this.pendingChildOf(user, studentId, ['PENDING', 'REJECTED']);
    await this.repo.deleteUser(studentId);
  }

  async myGuardian(user: AuthUser): Promise<MyGuardian> {
    return toMyGuardian(await this.guardianOf(user));
  }

  async updateMyGuardian(user: AuthUser, body: UpdateMyGuardianBody): Promise<MyGuardian> {
    const guardian = await this.guardianOf(user);
    const row = await this.repo.updateGuardian(guardian.id, {
      fullName: body.fullName,
      phone: body.phone !== undefined ? normalizePhone(body.phone) : undefined,
    });
    if (body.fullName) await this.repo.updateUser(user.id, { displayName: body.fullName.slice(0, 30) });
    return toMyGuardian(row);
  }

  // ---- helpers ----

  private async resolveCredentials(credentials: RegisterFamilyBody['credentials']) {
    if (credentials.type === 'password') {
      return {
        email: credentials.email,
        passwordHash: await this.passwords.hash(credentials.password),
        googleSub: undefined,
        emailVerified: false,
        provider: 'LOCAL' as const,
      };
    }
    const identity = await this.google.verify(credentials.idToken);
    return {
      email: identity.email,
      passwordHash: null,
      googleSub: identity.sub,
      emailVerified: true,
      provider: 'GOOGLE' as const,
    };
  }

  private async assertJoinable(classIds: readonly string[]): Promise<void> {
    const unique = [...new Set(classIds)];
    const found = await this.repo.findJoinableClasses(unique);
    if (found.length !== unique.length) {
      throw new AppError('CLASS_NOT_JOINABLE', 400, { fieldErrors: { classId: ['CLASS_NOT_JOINABLE'] } });
    }
  }

  /** Bé MANAGED, PENDING, chưa vào lớp (lớp muốn vào ở `requested_class_id`); phụ huynh này nhận học phí */
  private async createChild(tx: Tx, guardianId: string, input: ChildInput): Promise<string> {
    const names = nameColumns({
      vietnameseName: input.vietnameseName,
      englishName: input.englishName ?? null,
    });
    const child = await this.repo.createUser(tx, {
      role: 'STUDENT',
      status: 'PENDING',
      displayName: names.displayName,
      avatarKey: input.avatarKey ?? DEFAULT_AVATAR,
      studentProfile: {
        create: {
          ...profileNameData(names),
          requestedClass: { connect: { id: input.classId } },
          guardians: { create: { guardianId, isBillingContact: true } },
        },
      },
    });
    return child.id;
  }

  private async guardianOf(user: AuthUser) {
    const guardian = await this.repo.findGuardianOfUser(user.id);
    if (!guardian) throw notFound('guardianNotFound');
    return guardian;
  }

  private async pendingChildOf(user: AuthUser, studentId: string, statuses: readonly string[] = ['PENDING']) {
    const link = await this.repo.findAccessLink(user.id, studentId);
    if (!link) throw notFound('childNotFound');
    if (!statuses.includes(link.student.user.status)) {
      throw new AppError('CONFLICT', 409, { message: 'childNotPending' });
    }
    return link.student;
  }

  private async profileOf(studentId: string): Promise<FamilyProfile> {
    const row = await this.repo.findChild(studentId);
    if (!row) throw notFound('childNotFound');
    return toFamilyProfile(row);
  }
}
