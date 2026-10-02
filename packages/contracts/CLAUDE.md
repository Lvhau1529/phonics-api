# Quy tắc cho `packages/contracts` (`@lvhau1529/phonics-contracts`)

Gói này là **hợp đồng wire** giữa game (phonics-game), admin (phonics-admin) và api (repo này). Phát hành lên
GitHub Packages (README gốc > Contracts); game / admin import qua alias `@phonics/contracts`. Mọi request / response / hằng số dùng chung định nghĩa ở
đây, không định nghĩa lại ở từng app.

- Chỉ chứa zod schema, type suy ra (`export type X = z.infer<typeof X>`) và hằng số thuần. **Không** import Nest,
  Prisma, React, Phaser hay bất kỳ runtime nào ngoài `zod` (peer dependency, để cả 3 app dùng chung một instance).
- Body nhận vào dùng `z.strictObject` (từ chối field lạ). Response dùng `z.object`. Ngày giờ trên wire là ISO
  string (`IsoDateTime` / `IsoDate`), id là `Id` (uuid).
- Mỗi nhóm endpoint một file (`auth.ts`, `classes.ts`, `games.ts`…); `endpoints.ts` giữ đường dẫn (không prefix) +
  `API_PREFIX` = `/api/v1` (`API_ROOT` + `API_VERSION`); `index.ts` re-export tất cả. Import tương đối **phải có đuôi
  `.js`** (`./common/ids.js`) vì build NodeNext.
- Hằng số nghiệp vụ dùng chung: `POINT_RULES` (điểm), `PERMISSIONS` / `ROLE_DEFAULT_PERMISSIONS` (phân quyền),
  `AVATARS`, `GAME_IDS`, `ErrorCode`. Thêm quyền / game / avatar = sửa ở đây trước.
- Build: `pnpm build` → `dist/esm` (tsc, kèm `.d.ts`) + `dist/cjs/index.js` (rolldown, cho NestJS). Sửa xong `pnpm typecheck`
  ở gốc repo (build lại contracts rồi typecheck API); game / admin bắt lỗi khi nâng version (hoặc ngay trong
  phonics-dev).
- Version theo semver trong `package.json` (tag `contracts-v<version>` để phát hành). Đổi không tương thích (đổi tên
  field, bỏ field, đổi kiểu): tăng major + `CONTRACTS_VERSION`, API giữ route cũ ở v1 và thêm v2 nếu client cũ còn
  dùng; game / admin nâng version trong PR riêng của từng repo.
- Test (`src/index.test.ts`, Vitest): thêm case cho schema có refine / coerce / default mới.
