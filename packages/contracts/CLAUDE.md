# Quy tắc cho `packages/contracts`

Gói này là **hợp đồng wire** giữa game, admin và api. Mọi request / response / hằng số dùng chung định nghĩa ở
đây, không định nghĩa lại ở từng app.

- Chỉ chứa zod schema, type suy ra (`export type X = z.infer<typeof X>`) và hằng số thuần. **Không** import Nest,
  Prisma, React, Phaser hay bất kỳ runtime nào ngoài `zod` (peer dependency, để cả 3 app dùng chung một instance).
- Body nhận vào dùng `z.strictObject` (từ chối field lạ). Response dùng `z.object`. Ngày giờ trên wire là ISO
  string (`IsoDateTime` / `IsoDate`), id là `Id` (uuid).
- Mỗi nhóm endpoint một file (`auth.ts`, `classes.ts`, `games.ts`…); `endpoints.ts` giữ đường dẫn (không prefix
  `/api`); `index.ts` re-export tất cả. Import tương đối **phải có đuôi `.js`** (`./common/ids.js`) vì build
  NodeNext.
- Hằng số nghiệp vụ dùng chung: `POINT_RULES` (điểm), `PERMISSIONS` / `ROLE_DEFAULT_PERMISSIONS` (phân quyền),
  `AVATARS`, `GAME_IDS`, `ErrorCode`. Thêm quyền / game / avatar = sửa ở đây trước.
- Build: `pnpm build` → `dist/esm` (tsc, kèm `.d.ts`) + `dist/cjs/index.js` (rolldown, cho NestJS). Sửa xong phải
  build lại rồi `pnpm typecheck` ở root để mọi app bắt lỗi.
- Đổi không tương thích (đổi tên field, bỏ field, đổi kiểu): tăng `CONTRACTS_VERSION`, sửa cả 3 app trong cùng
  commit; grep tên cũ toàn repo.
- Test (`src/index.test.ts`, Vitest): thêm case cho schema có refine / coerce / default mới.
