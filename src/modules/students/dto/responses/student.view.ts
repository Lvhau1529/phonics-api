/** Dựng view học sinh / kết quả game (shape contracts) từ dòng Prisma — hàm thuần */
import {
  AvatarKey,
  DEFAULT_AVATAR,
  type GameResultView,
  type ParentContact,
  type StudentSummary,
} from '@phonics/contracts';
import { type GameResult } from '@/generated/prisma/client';
import { type StudentRow } from '@/modules/students/types/student.types';

export function toGameResultView(row: GameResult): GameResultView {
  return {
    id: row.id,
    studentId: row.studentId,
    classId: row.classId,
    gameId: row.gameId as GameResultView['gameId'],
    mode: 'solo',
    levelId: row.levelId,
    packId: row.packId,
    correct: row.correct,
    total: row.total,
    score: row.score,
    durationMs: row.durationMs,
    endedBy: row.endedBy as GameResultView['endedBy'],
    playedAt: row.playedAt.toISOString(),
    pointsAwarded: row.pointsAwarded,
    details: (row.details as Record<string, unknown> | null) ?? {},
    createdAt: row.createdAt.toISOString(),
  };
}

/** Liên hệ phụ huynh từ profile (chỉ giữ trường có dữ liệu) */
export function toParentContact(profile: StudentRow['studentProfile']): ParentContact {
  const parent: ParentContact = {};
  if (profile?.parentName) parent.name = profile.parentName;
  if (profile?.parentEmail) parent.email = profile.parentEmail;
  if (profile?.parentPhone) parent.phone = profile.parentPhone;
  return parent;
}

/** Học sinh + lớp đang học + tổng điểm + hạng trong lớp (null khi chưa vào lớp) */
export function toStudentSummary(row: StudentRow, points: number, rank: number | null): StudentSummary {
  const membership = row.studentProfile?.memberships[0];
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarKey: AvatarKey.safeParse(row.avatarKey).data ?? DEFAULT_AVATAR,
    status: row.status,
    class: membership ? { ...membership.class, joinedAt: membership.joinedAt.toISOString() } : null,
    points,
    rank: membership ? rank : null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
