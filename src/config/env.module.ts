import { resolve } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { config as loadDotenv } from 'dotenv';
import { type Env, validateEnv } from './env.schema';

/** `.env` nằm ở gốc repo (cạnh package.json) — nạp theo vị trí file này để không phụ thuộc cwd */
const ENV_FILE = resolve(__dirname, '../../.env');
loadDotenv({ path: ENV_FILE, quiet: true });

/** Token inject: `@Inject(ENV) private readonly env: Env` */
export const ENV = Symbol('ENV');

/**
 * Validate biến môi trường bằng zod một lần khi khởi động và cung cấp object `Env` đã parse (có kiểu, đã
 * transform) thay cho ConfigService.get<string>() rải rác. Thiếu / sai biến → app không chạy, lỗi đọc được.
 */
@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: [ENV_FILE], validate: validateEnv })],
  providers: [{ provide: ENV, useFactory: (): Env => validateEnv(process.env) }],
  exports: [ENV],
})
export class EnvModule {}
