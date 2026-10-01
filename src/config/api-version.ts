/**
 * Versioning theo URI: `/api/v1/...` (ADR 0015).
 *
 * - Controller khai báo version ngay trong decorator: `@Controller({ path: 'classes', version: API_V1 })`.
 * - Controller + DTO (wire format) của mỗi version nằm trong `modules/<module>/v<n>/`; service, module, luật
 *   nghiệp vụ dùng chung giữa các version.
 * - Thêm v2: tạo `modules/<module>/v2/` (controller + DTO mới), khai báo `API_V2`, đăng ký controller trong
 *   module. Endpoint không đổi thì không cần bản v2 — có thể cho controller v1 phục vụ cả hai:
 *   `version: [API_V1, API_V2]`.
 * - Endpoint vận hành (health) dùng `VERSION_NEUTRAL` → `/api/health`.
 */
export const API_V1 = '1';
