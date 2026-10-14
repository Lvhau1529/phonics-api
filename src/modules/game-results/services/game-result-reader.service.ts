import { Injectable } from '@nestjs/common';
import { type GameResultListQuery, type GameResultView, type Paginated } from '@phonics/contracts';
import { paginate } from '@/common/utils/paginate';
import { type Prisma } from '@/generated/prisma/client';
import { toResultView } from '@/modules/game-results/dto/responses/game-result.view';
import { GameResultRepository } from '@/modules/game-results/repositories/game-result.repository';

/** Lịch sử ván của học sinh */
@Injectable()
export class GameResultReaderService {
  constructor(private readonly repo: GameResultRepository) {}

  /** GET /me/game-results — mới nhất trước */
  async listMine(studentId: string, query: GameResultListQuery): Promise<Paginated<GameResultView>> {
    const where: Prisma.GameResultWhereInput = { studentId, gameId: query.gameId };
    return paginate(
      query,
      async (args) => (await this.repo.findPage(where, args)).map(toResultView),
      () => this.repo.count(where),
    );
  }
}
