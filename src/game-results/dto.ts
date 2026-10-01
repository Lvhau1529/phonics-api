import { GameResultBody, GameResultListQuery } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class GameResultDto extends createZodDto(GameResultBody) {}
export class GameResultListQueryDto extends createZodDto(GameResultListQuery) {}
