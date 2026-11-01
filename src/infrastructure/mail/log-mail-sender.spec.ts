import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogMailSender } from '@/infrastructure/mail/log-mail-sender';

describe('LogMailSender', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phonics-mail-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('ghi mail MIME đầy đủ (from / to / cc / html + text) ra file .eml', async () => {
    const sender = new LogMailSender({
      MAIL_FROM: 'Phonics <no-reply@test.vn>',
      MAIL_LOG_DIR: join(dir, 'sub'),
    });
    await sender.send({
      to: 'a@test.vn',
      cc: ['b@test.vn'],
      subject: 'Hello',
      html: '<p>Xin chào</p>',
      text: 'Xin chào',
    });
    const files = await readdir(join(dir, 'sub'));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.eml$/);
    const eml = await readFile(join(dir, 'sub', files[0]), 'utf8');
    expect(eml).toContain('From: Phonics <no-reply@test.vn>');
    expect(eml).toContain('To: a@test.vn');
    expect(eml).toContain('Cc: b@test.vn');
    expect(eml).toContain('Subject: Hello');
    expect(eml).toContain('Content-Type: text/plain; charset=utf-8');
    expect(eml).toContain('Content-Type: text/html; charset=utf-8');
  });
});
