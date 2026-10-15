import { Injectable } from '@nestjs/common';
import {
  type SetStudentGameUnlockBody,
  type StudentGameStatus,
  type StudentGamesResponse,
  type UnlockClassBody,
  type UnlockClassResponse,
  type UnlockWithGemsBody,
} from '@phonics/contracts';
import { partition } from 'es-toolkit';
import { AppError, notFound } from '@/common/errors/app-error';
import { AccessService } from '@/core/access/access.service';
import { type Tx } from '@/database/types';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { NotificationsService } from '@/modules/notifications/services/notifications.service';
import { gameUnlockedNotification, toStudentGameStatus } from '@/modules/games/dto/responses/game.view';
import { GameRepository } from '@/modules/games/repositories/game.repository';
import { type GameGate, type GameRow, NO_STATS } from '@/modules/games/types/game.types';
import { GameCatalogService } from '@/modules/games/services/game-catalog.service';

/** Mở khoá game theo học sinh (kim cương / GV cấp / thu hồi) và theo cả lớp */
@Injectable()
export class GameUnlockService {
  constructor(
    private readonly repo: GameRepository,
    private readonly catalog: GameCatalogService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** GET /me/games — một dòng cho mỗi game trong catalog */
  async studentGames(studentId: string): Promise<StudentGamesResponse> {
    const [games, unlocks, stats] = await Promise.all([
      this.repo.findAll(),
      this.repo.findActiveUnlocks(studentId),
      this.repo.statsByGame(studentId),
    ]);
    const unlockByGame = new Map(unlocks.map((u) => [u.gameId, u]));
    return {
      items: games.map((g) => toStudentGameStatus(g, unlockByGame.get(g.id), stats.get(g.id) ?? NO_STATS)),
    };
  }

  /** GET /students/:id/games — ADMIN mọi học sinh, TEACHER chỉ học sinh lớp mình */
  async studentGamesFor(actor: AuthUser, studentId: string): Promise<StudentGamesResponse> {
    await this.access.assertStudentAccess(actor, studentId);
    return this.studentGames(studentId);
  }

  /**
   * POST /me/games/:gameId/unlock — client đã trừ kim cương, server chỉ ghi nhận. Idempotent:
   * đã mở → trả nguyên trạng; bị giáo viên thu hồi → 403; game miễn phí → không tạo dòng.
   */
  async unlockWithGems(
    studentId: string,
    gameId: string,
    body: UnlockWithGemsBody,
  ): Promise<StudentGameStatus> {
    const game = await this.catalog.getGame(gameId);
    if (game.price == null) return this.statusOf(studentId, game);
    const existing = await this.repo.findUnlock(studentId, gameId);
    if (existing?.revokedAt) throw new AppError('FORBIDDEN', 403, { message: 'gameLocked' });
    if (!existing) await this.repo.createGemsUnlock(studentId, gameId, body.gemsSpent);
    return this.statusOf(studentId, game);
  }

  /** PUT /students/:id/games/:gameId — admin / GV (games.unlock) mở hoặc thu hồi */
  async setStudentUnlock(
    actor: AuthUser,
    studentId: string,
    gameId: string,
    body: SetStudentGameUnlockBody,
  ): Promise<StudentGameStatus> {
    await this.access.assertStudentAccess(actor, studentId);
    const game = await this.catalog.getGame(gameId);
    if (!(await this.repo.studentExists(studentId))) throw notFound('studentNotFound');

    const before = await this.statusOf(studentId, game);
    // Chỉ thông báo khi trước đó chưa có dòng unlock đang hoạt động (FREE không tính)
    const wasActive = before.source === 'GEMS' || before.source === 'ADMIN';
    const now = new Date();
    await this.repo.transaction(async (tx) => {
      if (body.unlocked) {
        await this.repo.grant(tx, studentId, gameId, { grantedById: actor.id, note: body.note }, now);
        if (!wasActive) await this.notifications.create(gameUnlockedNotification(studentId, game), tx);
      } else {
        await this.repo.revoke(tx, studentId, gameId, now);
      }
    });

    const after = await this.statusOf(studentId, game);
    await this.audit.record(
      actor,
      'game.unlock',
      'StudentGameUnlock',
      `${studentId}:${gameId}`,
      { unlocked: before.unlocked, source: before.source },
      { unlocked: after.unlocked, source: after.source, note: body.note ?? null },
    );
    return after;
  }

  /**
   * POST /classes/:classId/games/:gameId/unlock — mở cho mọi thành viên đang hoạt động:
   * bỏ qua ai đã mở, hồi phục dòng bị thu hồi, tạo mới cho người chưa có.
   */
  async unlockClass(
    actor: AuthUser,
    classId: string,
    gameId: string,
    body: Pick<UnlockClassBody, 'note'>,
  ): Promise<UnlockClassResponse> {
    await this.access.assertClassAccess(actor, classId);
    const game = await this.catalog.getGame(gameId);
    if (!(await this.repo.classExists(classId))) throw notFound('classNotFound');

    const memberIds = await this.repo.activeMemberIds(classId);
    // Game miễn phí: ai cũng đã mở, không có gì để làm
    if (game.price == null || !memberIds.length) return { unlocked: 0, alreadyUnlocked: memberIds.length };

    const existing = await this.repo.unlocksOf(gameId, memberIds);
    const [active, revoked] = partition(existing, (u) => u.revokedAt == null);
    const activeCount = active.length;
    const revivedIds = revoked.map((u) => u.studentId);
    const knownIds = new Set(existing.map((u) => u.studentId));
    const newIds = memberIds.filter((id) => !knownIds.has(id));
    const grant = { grantedById: actor.id, note: body.note };
    const now = new Date();

    await this.repo.transaction(async (tx) => {
      await this.repo.grantMany(tx, gameId, newIds, grant);
      await this.repo.reviveMany(tx, gameId, revivedIds, grant, now);
      await this.notifications.createMany(
        [...newIds, ...revivedIds].map((id) => gameUnlockedNotification(id, game)),
        tx,
      );
    });

    const result = { unlocked: newIds.length + revivedIds.length, alreadyUnlocked: activeCount };
    await this.audit.record(actor, 'game.unlockClass', 'Class', classId, null, {
      gameId,
      note: body.note ?? null,
      ...result,
    });
    return result;
  }

  /** Cho module game-results: game có tồn tại / đang bật / học sinh đã mở khoá chưa (trong cùng transaction) */
  isUnlockedFor(tx: Tx, studentId: string, gameId: string): Promise<GameGate> {
    return this.repo.gate(tx, studentId, gameId);
  }

  private async statusOf(studentId: string, game: GameRow): Promise<StudentGameStatus> {
    const [unlock, stats] = await Promise.all([
      this.repo.findUnlock(studentId, game.id),
      this.repo.statsByGame(studentId, game.id),
    ]);
    return toStudentGameStatus(game, unlock, stats.get(game.id) ?? NO_STATS);
  }
}
