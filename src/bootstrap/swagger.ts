import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_ROOT } from '@phonics/contracts';
import { cleanupOpenApiDoc } from 'nestjs-zod';

/** Đường dẫn Swagger UI (không có version — tài liệu liệt kê route của mọi version) */
export const SWAGGER_PATH = `${API_ROOT}/docs`;

/** Swagger UI ở /api/docs, JSON ở /api/docs-json (bật bằng SWAGGER_ENABLED) */
export function setupSwagger(app: NestExpressApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Phonics Arcade API')
    .setDescription(
      'Tài khoản, lớp học, điểm, xếp hạng, thông báo, game, báo cáo. Route theo version: /api/v1/... ' +
        'Lỗi theo envelope ApiErrorBody.',
    )
    .setVersion('1')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH.slice(1), app, cleanupOpenApiDoc(doc), {
    jsonDocumentUrl: `${SWAGGER_PATH.slice(1)}-json`,
  });
}
