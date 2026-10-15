import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { currentLocale, resolveLocale, runWithLocale } from '@/common/i18n/locale';
import { translate } from '@/common/i18n/translate';
import { configureZodLocale } from '@/common/i18n/zod-locale';

describe('resolveLocale', () => {
  it.each([
    [undefined, 'vi'],
    ['', 'vi'],
    ['vi', 'vi'],
    ['vi-VN,vi;q=0.9,en;q=0.8', 'vi'],
    ['en', 'en'],
    ['en-US,en;q=0.9,vi;q=0.8', 'en'],
    ['fr-FR,fr;q=0.9,en;q=0.5', 'en'],
    ['vi;q=0.2,en;q=0.8', 'en'],
    ['en;q=0', 'vi'],
    ['fr', 'vi'],
    [['en', 'vi'], 'en'],
  ])('%j → %s', (header, expected) => {
    expect(resolveLocale(header as string | string[] | undefined)).toBe(expected);
  });
});

describe('translate', () => {
  it('khoá thường + khoá có tham số theo từng ngôn ngữ', () => {
    expect(translate('vi', 'classNotFound')).toBe('Không tìm thấy lớp');
    expect(translate('en', 'classNotFound')).toBe('Class not found');
    expect(translate('en', ['notTeacherId', { id: 'u1' }])).toBe('u1 is not a teacher');
    expect(translate('vi', 'EMAIL_TAKEN')).toBe('Email đã được sử dụng');
  });
});

describe('runWithLocale + zod', () => {
  it('ngoài request → mặc định vi; trong request → locale của request', () => {
    expect(currentLocale()).toBe('vi');
    expect(runWithLocale('en', currentLocale)).toBe('en');
  });

  it('message mặc định của zod theo locale, message tự viết trong schema giữ nguyên', () => {
    configureZodLocale();
    const Min = z.string().min(3);
    const Custom = z.string().min(3, 'Tự viết');
    const first = (schema: z.ZodType) => schema.safeParse('a').error?.issues[0]?.message;
    const en = runWithLocale('en', () => first(Min));
    const vi = runWithLocale('vi', () => first(Min));
    expect(en).toMatch(/too small/i);
    expect(vi).not.toBe(en);
    expect(runWithLocale('en', () => first(Custom))).toBe('Tự viết');
  });
});
