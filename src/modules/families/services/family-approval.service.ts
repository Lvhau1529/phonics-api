import { Inject, Injectable } from '@nestjs/common';
import {
  type ApproveFamilyBody,
  type DuplicateMatch,
  type FamilyReviewResult,
  type MergeFamilyBody,
  type PendingCountResponse,
  type PendingFamiliesResponse,
  type PendingFamily,
  type RejectFamilyBody,
  studentFullName,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { nameColumns } from '@/common/utils/student-names';
import { ENV } from '@/config/env.module';
import { type Env } from '@/config/env.schema';
import { AccessService } from '@/core/access/access.service';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { toPendingChild } from '@/modules/families/dto/responses/family.view';
import { FamilyRepository } from '@/modules/families/repositories/family.repository';
import { type PendingChildRow } from '@/modules/families/types/family.types';
import {
  belongsToFamily,
  familyParentOf,
  groupPendingChildren,
  type PendingGroup,
} from '@/modules/families/utils/family-rules';
import { MailOutboxService } from '@/modules/mail/services/mail-outbox.service';
import { RankingService } from '@/modules/points/services/ranking.service';

/**
 * Duyệt tài khoản tự đăng ký (theo từng bé). ADMIN: mọi đơn; GV: bé đăng ký vào lớp mình dạy, chỉ xếp vào lớp mình.
 * Hai người cùng xử lý: cập nhật có điều kiện `status = PENDING`, người sau nhận 409 `alreadyReviewed`.
 */
@Injectable()
export class FamilyApprovalService {
  constructor(
    private readonly repo: FamilyRepository,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly ranking: RankingService,
    private readonly mail: MailOutboxService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async pending(user: AuthUser): Promise<PendingFamiliesResponse> {
    const scope = await this.scopeOf(user);
    const groups = groupPendingChildren(await this.repo.pendingChildren(scope));
    const guardianIds = groups.flatMap((g) => (g.parent ? [g.parent.guardianId] : []));
    const siblings = await this.repo.childrenOfGuardians(guardianIds);
    const items = await Promise.all(
      groups.map(async (group): Promise<PendingFamily> => {
        const visible = new Set(group.children.map((c) => c.userId));
        const others = group.parent
          ? siblings.filter((s) => s.guardianId === group.parent!.guardianId && !visible.has(s.studentId))
          : [];
        return {
          id: group.id,
          parent: group.parent && {
            userId: group.parent.userId,
            guardianId: group.parent.guardianId,
            fullName: group.parent.fullName,
            email: group.parent.email,
            phone: group.parent.phone,
            status: group.parent.status,
          },
          children: group.children.map(toPendingChild),
          otherChildren: others.length,
          duplicates: await this.duplicatesOf(group, scope),
          createdAt: (group.parent?.createdAt ?? group.children[0].createdAt).toISOString(),
        };
      }),
    );
    return { items };
  }

  async count(user: AuthUser): Promise<PendingCountResponse> {
    return { count: await this.repo.countPendingChildren(await this.scopeOf(user)) };
  }

  /** Duyệt các bé được chọn + xếp lớp; phụ huynh thành ACTIVE khi bé đầu tiên được duyệt */
  async approve(user: AuthUser, accountId: string, body: ApproveFamilyBody): Promise<FamilyReviewResult> {
    const rows = await this.familyChildren(
      user,
      accountId,
      body.children.map((c) => c.studentId),
    );
    const classes = await this.repo.findClasses(body.children.map((c) => c.classId));
    for (const { classId } of body.children) {
      const cls = classes.find((c) => c.id === classId);
      if (!cls) throw notFound('classNotFound');
      if (cls.archivedAt) {
        throw new AppError('CLASS_NOT_JOINABLE', 400, { fieldErrors: { classId: ['classArchived'] } });
      }
      await this.access.assertClassAccess(user, classId);
    }

    const parent = familyParentOf(rows[0]);
    const now = new Date();
    const ids = body.children.map((c) => c.studentId);
    const parentStatus = await this.repo.transaction(async (tx) => {
      const changed = await this.repo.reviewChildren(tx, ids, 'ACTIVE', {
        reviewedById: user.id,
        reviewedAt: now,
      });
      if (changed !== ids.length) throw new AppError('CONFLICT', 409, { message: 'alreadyReviewed' });
      for (const { studentId, classId } of body.children) {
        await this.repo.createMembership(tx, studentId, classId, now);
      }
      for (const classId of new Set(body.children.map((c) => c.classId))) {
        await this.ranking.recomputeAndNotify(tx, classId);
      }
      if (!parent?.user) return null;
      await this.repo.setUserStatus(tx, parent.user.id, ['PENDING', 'REJECTED'], 'ACTIVE');
      const pendingLeft = await this.pendingLeft(parent.id, ids);
      await this.mail.enqueueTemplate(
        [
          {
            key: 'family.approved',
            to: parent.email ?? (await this.repo.findUserStatus(parent.user.id, tx))?.email,
            dedupeKey: `familyApproved:${accountId}:${now.getTime()}`,
            refType: 'User',
            refId: accountId,
            context: {
              parentName: parent.fullName,
              approved: body.children.map(({ studentId, classId }) => ({
                name: studentFullName(rows.find((r) => r.userId === studentId)!),
                className: classes.find((c) => c.id === classId)!.name,
              })),
              pendingCount: pendingLeft,
              link: this.env.GAME_APP_URL,
            },
          },
        ],
        tx,
      );
      return 'ACTIVE' as const;
    });
    if (parent?.user) this.mail.flush();

    await this.audit.record(user, 'family.approve', 'User', accountId, null, { children: body.children });
    return { approved: ids, rejected: [], parentStatus };
  }

  /** Từ chối bé (mặc định: mọi bé chờ trong phạm vi). Mọi bé bị từ chối → tài khoản phụ huynh REJECTED. */
  async reject(user: AuthUser, accountId: string, body: RejectFamilyBody): Promise<FamilyReviewResult> {
    const scope = await this.scopeOf(user);
    const rows = body.studentIds
      ? await this.familyChildren(user, accountId, body.studentIds)
      : (await this.repo.pendingChildren(scope)).filter((r) => belongsToFamily(r, accountId));
    if (!rows.length) throw new AppError('CONFLICT', 409, { message: 'noPendingChildren' });

    const parent = familyParentOf(rows[0]);
    const ids = rows.map((r) => r.userId);
    const now = new Date();
    const parentStatus = await this.repo.transaction(async (tx) => {
      const changed = await this.repo.reviewChildren(tx, ids, 'REJECTED', {
        reviewedById: user.id,
        reviewedAt: now,
        rejectReason: body.reason,
      });
      if (changed !== ids.length) throw new AppError('CONFLICT', 409, { message: 'alreadyReviewed' });
      const to = parent?.user
        ? (parent.email ?? (await this.repo.findUserStatus(parent.user.id, tx))?.email)
        : (await this.repo.findUserStatus(accountId, tx))?.email;
      await this.mail.enqueueTemplate(
        [
          {
            key: 'family.rejected',
            to,
            dedupeKey: `familyRejected:${accountId}:${now.getTime()}`,
            refType: 'User',
            refId: accountId,
            context: {
              parentName: parent?.fullName ?? studentFullName(rows[0]),
              childrenText: rows.map((r) => studentFullName(r)).join(', '),
              reason: body.reason,
            },
          },
        ],
        tx,
      );
      if (!parent?.user) return null;
      // Còn bé chờ / đã duyệt thì giữ trạng thái tài khoản phụ huynh
      const remaining = await this.repo.childrenOfGuardians([parent.id]);
      const allRejected = remaining.every(
        (c) => ids.includes(c.studentId) || c.student.user.status === 'REJECTED',
      );
      if (!allRejected) return parent.user.status;
      await this.repo.setUserStatus(tx, parent.user.id, ['PENDING'], 'REJECTED');
      return parent.user.status === 'PENDING' ? ('REJECTED' as const) : parent.user.status;
    });
    this.mail.flush();

    await this.audit.record(user, 'family.reject', 'User', accountId, null, {
      studentIds: ids,
      reason: body.reason,
    });
    return { approved: [], rejected: ids, parentStatus };
  }

  /**
   * Gộp đơn vào phụ huynh có sẵn (đăng ký trùng): các bé chuyển sang phụ huynh đó (vẫn chờ duyệt). Phụ huynh có sẵn
   * chưa có tài khoản → nhận luôn tài khoản vừa đăng ký; đã có → xoá tài khoản trùng.
   */
  async merge(user: AuthUser, accountId: string, body: MergeFamilyBody): Promise<FamilyReviewResult> {
    const scope = await this.scopeOf(user);
    const rows = (await this.repo.pendingChildren(scope)).filter((r) => belongsToFamily(r, accountId));
    const source = rows.length ? familyParentOf(rows[0]) : null;
    if (!source?.user) throw notFound('familyNotFound');
    if (source.id === body.guardianId) throw new AppError('CONFLICT', 409, { message: 'mergeSameGuardian' });

    const target = await this.repo.findGuardianForMerge(body.guardianId);
    if (!target) throw notFound('guardianNotFound');
    if (scope) {
      const inScope = await this.repo.studentsInClasses(
        target.students.map((s) => s.studentId),
        scope,
      );
      if (!inScope.size) throw new AppError('FORBIDDEN_SCOPE', 403, { message: 'mergeOutOfScope' });
    }

    const links = await this.repo.linksOfGuardian(source.id);
    const parentUserId = source.user.id;
    const parentStatus = await this.repo.transaction(async (tx) => {
      await this.repo.moveLinks(
        tx,
        links.map(({ createdAt: _createdAt, ...link }) => ({ ...link, guardianId: target.id })),
      );
      await this.repo.deleteGuardian(tx, source.id);
      if (target.userId) {
        await this.repo.deleteUser(parentUserId, tx);
        return (await this.repo.findUserStatus(target.userId, tx))?.status ?? null;
      }
      await this.repo.attachUser(tx, target.id, parentUserId);
      return source.user!.status;
    });

    await this.audit.record(
      user,
      'family.merge',
      'Guardian',
      target.id,
      { guardianId: source.id },
      {
        guardianId: target.id,
        studentIds: links.map((l) => l.studentId),
        parentUserKept: !target.userId,
      },
    );
    return { approved: [], rejected: [], parentStatus };
  }

  // ---- helpers ----

  /** undefined = mọi lớp (ADMIN); GV: các lớp mình dạy */
  private scopeOf(user: AuthUser): Promise<string[] | undefined> {
    return this.access.scopedClassIds(user);
  }

  /** Bé được chọn: cùng đơn, đang chờ, trong phạm vi người duyệt */
  private async familyChildren(
    user: AuthUser,
    accountId: string,
    studentIds: readonly string[],
  ): Promise<PendingChildRow[]> {
    const scope = await this.scopeOf(user);
    const rows = await this.repo.findPendingChildren(studentIds);
    if (rows.length !== studentIds.length || rows.some((r) => !belongsToFamily(r, accountId))) {
      throw notFound('childNotFound');
    }
    if (rows.some((r) => r.user.status !== 'PENDING')) {
      throw new AppError('CONFLICT', 409, { message: 'alreadyReviewed' });
    }
    if (scope && rows.some((r) => !r.requestedClassId || !scope.includes(r.requestedClassId))) {
      throw new AppError('FORBIDDEN_SCOPE', 403);
    }
    return rows;
  }

  /** Số bé còn chờ của phụ huynh sau khi duyệt `ids` */
  private async pendingLeft(guardianId: string, ids: readonly string[]): Promise<number> {
    const children = await this.repo.childrenOfGuardians([guardianId]);
    return children.filter((c) => c.student.user.status === 'PENDING' && !ids.includes(c.studentId)).length;
  }

  /**
   * Cảnh báo trùng: email / SĐT trùng phụ huynh khác, bé trùng họ tên với học sinh đã có. GV chỉ thấy chi tiết khi
   * gia đình / học sinh kia có con trong lớp mình.
   */
  private async duplicatesOf(group: PendingGroup, scope: string[] | undefined): Promise<DuplicateMatch[]> {
    const matches: DuplicateMatch[] = [];
    const empty = { childId: null, studentId: null, studentName: null, className: null };
    if (group.parent) {
      const { guardianId, email, phone } = group.parent;
      const userEmail = (await this.repo.findUserStatus(group.parent.userId))?.email ?? null;
      const emails = [...new Set([email, userEmail].filter((e): e is string => !!e))];
      const checks = [
        { kind: 'GUARDIAN_EMAIL' as const, where: emails.length ? { email: { in: emails } } : null },
        { kind: 'GUARDIAN_PHONE' as const, where: phone ? { phone } : null },
      ];
      for (const check of checks) {
        if (!check.where) continue;
        const found = await this.repo.guardiansMatching({ ...check.where, NOT: { id: guardianId } });
        for (const g of found) {
          const inScope = await this.isInScope(
            g.students.map((s) => s.studentId),
            scope,
          );
          matches.push({
            ...empty,
            kind: check.kind,
            inScope,
            guardianId: inScope ? g.id : null,
            guardianName: inScope ? g.fullName : null,
          });
        }
      }
    }

    // Cùng `name_sort_key` = cùng họ tên tiếng Việt (bỏ dấu)
    const keys = new Map(
      group.children.map((c) => [
        nameColumns({ vietnameseName: c.vietnameseName, englishName: null }).nameSortKey,
        c.userId,
      ]),
    );
    const familyIds = group.children.map((c) => c.userId);
    for (const s of await this.repo.studentsWithSortKeys([...keys.keys()], familyIds)) {
      const childId = keys.get(s.nameSortKey);
      if (!childId) continue;
      const cls = s.memberships[0]?.class ?? null;
      const inScope = !scope || (!!cls && scope.includes(cls.id));
      matches.push({
        kind: 'STUDENT_NAME',
        childId,
        inScope,
        guardianId: null,
        guardianName: null,
        studentId: inScope ? s.userId : null,
        studentName: inScope ? studentFullName(s) : null,
        className: inScope ? (cls?.name ?? null) : null,
      });
    }
    return matches;
  }

  private async isInScope(studentIds: readonly string[], scope: string[] | undefined): Promise<boolean> {
    if (!scope) return true;
    return (await this.repo.studentsInClasses(studentIds, scope)).size > 0;
  }
}
