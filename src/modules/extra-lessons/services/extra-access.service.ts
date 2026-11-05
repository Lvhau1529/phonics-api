import { Injectable } from '@nestjs/common';
import { type Permission } from '@phonics/contracts';
import { AppError } from '@/common/errors/app-error';
import { AccessService } from '@/core/access/access.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { ExtraScheduleRepository } from '@/modules/extra-lessons/repositories/extra-schedule.repository';
import { ExtraSlotRepository } from '@/modules/extra-lessons/repositories/extra-slot.repository';
import { PermissionsService } from '@/modules/permissions/services/permissions.service';

/**
 * Phạm vi học thêm của GV (§6): ca mình dạy; học sinh trong lớp chính mình dạy hoặc từng học ca mình. ADMIN mọi thứ.
 * Quyền (permission) kiểm tra ở controller; ở đây chỉ phạm vi + cờ quyền cho view.
 */
@Injectable()
export class ExtraAccessService {
  constructor(
    private readonly slots: ExtraSlotRepository,
    private readonly schedule: ExtraScheduleRepository,
    private readonly access: AccessService,
    private readonly permissions: PermissionsService,
  ) {}

  /** undefined = mọi ca (ADMIN); GV: id các ca mình dạy */
  async slotScope(user: AuthUser): Promise<string[] | undefined> {
    if (user.role === 'ADMIN') return undefined;
    if (user.role !== 'TEACHER') throw new AppError('FORBIDDEN', 403);
    return this.slots.teacherSlotIds(user.id);
  }

  async teachesSlot(user: AuthUser, slotId: string): Promise<boolean> {
    const scope = await this.slotScope(user);
    return !scope || scope.includes(slotId);
  }

  async assertSlotAccess(user: AuthUser, slotId: string): Promise<void> {
    if (!(await this.teachesSlot(user, slotId))) throw new AppError('FORBIDDEN_SCOPE', 403);
  }

  /** Học sinh trong lớp chính GV dạy, hoặc từng / đang học ca GV dạy */
  async canAccessStudent(user: AuthUser, studentId: string): Promise<boolean> {
    const scope = await this.slotScope(user);
    if (!scope) return true;
    if (await this.schedule.everInSlots(studentId, scope)) return true;
    try {
      await this.access.assertStudentAccess(user, studentId);
      return true;
    } catch {
      return false;
    }
  }

  /** Bản batch của `canAccessStudent`: các id trong `studentIds` người dùng được truy cập */
  async accessibleStudentIds(user: AuthUser, studentIds: readonly string[]): Promise<Set<string>> {
    const scope = await this.slotScope(user);
    if (!scope) return new Set(studentIds);
    const inSlots = await this.schedule.studentsEverInSlots(studentIds, scope);
    const rest = studentIds.filter((id) => !inSlots.has(id));
    const inClasses = await this.access.accessibleStudentIds(user, rest);
    return new Set([...inSlots, ...inClasses]);
  }

  async assertStudentAccess(user: AuthUser, studentId: string): Promise<void> {
    if (!(await this.canAccessStudent(user, studentId))) throw new AppError('FORBIDDEN_SCOPE', 403);
  }

  /**
   * Giá riêng học sinh áp cho mọi ca → GV chỉ đặt được khi mọi ca học sinh đang / sắp học đều do mình dạy (và học sinh
   * có ít nhất một ca của mình).
   */
  async canSetStudentRate(user: AuthUser, studentId: string, today: string): Promise<boolean> {
    const scope = await this.slotScope(user);
    if (!scope) return true;
    const open = await this.schedule.openSlotIds(studentId, today);
    return open.length > 0 && open.every((id) => scope.includes(id));
  }

  async has(user: AuthUser, permission: Permission): Promise<boolean> {
    if (user.role === 'ADMIN') return true;
    return (await this.permissions.effectiveFor(user)).has(permission);
  }
}
