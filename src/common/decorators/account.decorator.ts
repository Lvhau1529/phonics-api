import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_KEY = 'allowPending';
/**
 * Tài khoản PENDING (tự đăng ký, chờ duyệt) được gọi route này — màn "đang chờ duyệt" của phụ huynh. Route khác trả
 * 403 ACCOUNT_PENDING.
 */
export const AllowPending = () => SetMetadata(ALLOW_PENDING_KEY, true);

export const ALLOW_PARENT_KEY = 'allowParent';
/**
 * Tài khoản PARENT được gọi route không khai báo `@Roles` này (vd `auth/me`, đổi mật khẩu). PARENT bị chặn ở mọi
 * route khác trừ khi `@Roles(...)` liệt kê PARENT.
 */
export const AllowParent = () => SetMetadata(ALLOW_PARENT_KEY, true);
