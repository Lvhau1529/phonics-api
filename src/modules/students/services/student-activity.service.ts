import { Injectable } from '@nestjs/common';
import {
  type GameResultListQuery,
  type GameResultView,
  type Paginated,
  type PointEntryView,
  type PointsByGame,
  type PointsListQuery,
  type RangeQuery,
} from '@phonics/contracts';
import { orderBy, paginate } from '../../../common/utils/paginate';
import { TimeService } from '../../../core/time/time.service';
import { type Prisma } from '../../../generated/prisma/client';
import { type AuthUser } from '../../auth/types/auth.types';
import { PointReaderService } from '../../points/services/point-reader.service';
import { toGameResultView } from '../dto/responses/student.view';
import { StudentRepository } from '../repositories/student.repository';
import { GAME_RESULT_SORT_FIELDS } from '../types/student.types';
import { StudentReaderService } from './student-reader.service';

/** Lịch sử của một học sinh: sổ điểm, điểm theo game, kết quả từng ván (đã kiểm tra phạm vi) */
@Injectable()
export class StudentActivityService {
  constructor(
    private readonly repo: StudentRepository,
    private readonly reader: StudentReaderService,
    private readonly points: PointReaderService,
    private readonly time: TimeService,
  ) {}

  async pointsList(
    user: AuthUser,
    id: string,
    query: Omit<PointsListQuery, 'studentId'>,
  ): Promise<Paginated<PointEntryView>> {
    await this.reader.assertStudent(user, id);
    return this.points.list({ ...query, studentId: id });
  }

  async pointsByGame(user: AuthUser, id: string, query: RangeQuery): Promise<{ items: PointsByGame[] }> {
    await this.reader.assertStudent(user, id);
    const totals = await this.points.totals(id, this.time.resolveRange(query));
    return { items: totals.byGame };
  }

  async gameResults(
    user: AuthUser,
    id: string,
    query: GameResultListQuery,
  ): Promise<Paginated<GameResultView>> {
    await this.reader.assertStudent(user, id);
    const where: Prisma.GameResultWhereInput = { studentId: id, gameId: query.gameId };
    const sort = [orderBy(query.sort, GAME_RESULT_SORT_FIELDS, { playedAt: 'desc' }), { id: 'asc' as const }];
    return paginate(
      query,
      async (page) => (await this.repo.findGameResults(where, page, sort)).map(toGameResultView),
      () => this.repo.countGameResults(where),
    );
  }
}
