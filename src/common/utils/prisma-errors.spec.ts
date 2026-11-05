import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from '@/common/utils/prisma-errors';
import { Prisma } from '@/generated/prisma/client';

describe('isUniqueViolation', () => {
  it('P2002 của Prisma → true; mã khác / lỗi thường → false', () => {
    const known = (code: string) =>
      new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test' });
    expect(isUniqueViolation(known('P2002'))).toBe(true);
    expect(isUniqueViolation(known('P2025'))).toBe(false);
    expect(isUniqueViolation(new Error('P2002'))).toBe(false);
    expect(isUniqueViolation({ code: 'P2002' })).toBe(false);
  });
});
