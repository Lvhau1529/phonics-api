import { GAME_IDS, type GameId } from '@phonics/contracts';
import { type PrismaClient } from '@/generated/prisma/client';

const GAME_TITLES: Record<GameId, string> = {
  'bread-catcher': 'Bread Catcher',
  'food-stream': 'Food Stream',
  'phonics-ocean': 'Phonics Ocean',
  'odd-one-out': 'Odd One Out',
  'english-explorers': 'Little English Explorers',
};

/** Catalog game: chỉ tạo khi thiếu — không ghi đè title / enabled / price admin đã chỉnh */
export async function seedGames(prisma: PrismaClient): Promise<void> {
  for (const [index, id] of GAME_IDS.entries()) {
    await prisma.game.upsert({
      where: { id },
      update: {},
      create: { id, title: GAME_TITLES[id], enabled: true, price: null, sortOrder: index },
    });
  }
  console.log(`[seed] games: ${GAME_IDS.join(', ')}`);
}
