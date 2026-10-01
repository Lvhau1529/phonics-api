import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { type AuthUser } from '../../modules/auth/auth.types';
import { PrismaService } from '../database/prisma.service';

/**
 * Kiểm tra phạm vi dữ liệu (resource scope) — khác với quyền (permission):
 * ADMIN thấy tất cả; TEACHER chỉ lớp mình dạy và học sinh trong các lớp đó.
 * Service gọi các hàm này trước khi đọc / ghi.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Id các lớp giáo viên đang dạy */
  async teacherClassIds(teacherId: string): Promise<string[]> {
    const rows = await this.prisma.classTeacher.findMany({ where: { teacherId }, select: { classId: true } });
    return rows.map((r) => r.classId);
  }

  async canAccessClass(user: AuthUser, classId: string): Promise<boolean> {
    if (user.role === 'ADMIN') return true;
    if (user.role !== 'TEACHER') return false;
    const row = await this.prisma.classTeacher.findUnique({
      where: { classId_teacherId: { classId, teacherId: user.id } },
      select: { classId: true },
    });
    return !!row;
  }

  async assertClassAccess(user: AuthUser, classId: string): Promise<void> {
    if (!(await this.canAccessClass(user, classId))) throw new AppError('FORBIDDEN_SCOPE', 403);
  }

  /** Học sinh có membership đang hoạt động ở lớp giáo viên dạy (ADMIN luôn được) */
  async assertStudentAccess(user: AuthUser, studentId: string): Promise<void> {
    if (user.role === 'ADMIN') return;
    if (user.role !== 'TEACHER') throw new AppError('FORBIDDEN', 403);
    const row = await this.prisma.classMembership.findFirst({
      where: { studentId, leftAt: null, class: { teachers: { some: { teacherId: user.id } } } },
      select: { id: true },
    });
    if (!row) throw new AppError('FORBIDDEN_SCOPE', 403);
  }

  /** Lọc classId cho danh sách: ADMIN → tuỳ chọn; TEACHER → phải thuộc lớp mình (hoặc toàn bộ lớp mình) */
  async scopedClassIds(user: AuthUser, classId?: string): Promise<string[] | undefined> {
    if (user.role === 'ADMIN') return classId ? [classId] : undefined;
    if (user.role !== 'TEACHER') throw new AppError('FORBIDDEN', 403);
    const own = await this.teacherClassIds(user.id);
    if (classId) {
      if (!own.includes(classId)) throw new AppError('FORBIDDEN_SCOPE', 403);
      return [classId];
    }
    return own;
  }
}
