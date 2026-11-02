import { describe, expect, it } from 'vitest';
import { MailRenderer, MailTemplateError } from '@/infrastructure/mail/mail-renderer';

const renderer = new MailRenderer();

describe('MailRenderer', () => {
  it('render tiêu đề + HTML + chữ thuần, vòng lặp / filter Liquid chạy được', async () => {
    const out = await renderer.render(
      {
        subject: 'Tổng hợp {{ month }}',
        bodyHtml:
          '<p>Chào {{ name }},</p><ul>{% for s in students %}<li>{{ s | upcase }}</li>{% endfor %}</ul>',
      },
      { month: '11/2026', name: 'chị Lan', students: ['An', 'Bình'] },
    );
    expect(out.subject).toBe('Tổng hợp 11/2026');
    expect(out.html).toBe('<p>Chào chị Lan,</p><ul><li>AN</li><li>BÌNH</li></ul>');
    expect(out.text).toBe('Chào chị Lan,\n\n- AN\n- BÌNH');
  });

  it('HTML tự escape biến; `| raw` giữ nguyên; tiêu đề không escape', async () => {
    const out = await renderer.render(
      { subject: '{{ name }} & co', bodyHtml: '<p>{{ name }}</p>{{ block | raw }}' },
      { name: 'Tom <b>&', block: '<hr>' },
    );
    expect(out.html).toBe('<p>Tom &lt;b&gt;&amp;</p><hr>');
    expect(out.subject).toBe('Tom <b>& & co');
  });

  it('tiêu đề luôn một dòng, cắt 250 ký tự', async () => {
    const out = await renderer.render(
      { subject: 'A\r\nBcc: x@y.z\n{{ long }}', bodyHtml: '' },
      { long: 'x'.repeat(400) },
    );
    expect(out.subject.startsWith('A Bcc: x@y.z x')).toBe(true);
    expect(out.subject).not.toMatch(/[\r\n]/);
    expect(out.subject).toHaveLength(250);
  });

  it('bọc khung bằng `wrap`, chữ thuần lấy cả khung', async () => {
    const out = await renderer.render(
      { subject: 's', bodyHtml: '<p>Nội dung</p>' },
      {},
      (b) => `<div>${b}</div><p>Chân</p>`,
    );
    expect(out.html).toBe('<div><p>Nội dung</p></div><p>Chân</p>');
    expect(out.text).toBe('Nội dung\n\nChân');
  });

  it('biến không có / filter lạ / cú pháp sai → MailTemplateError', async () => {
    await expect(renderer.render({ subject: 's', bodyHtml: '{{ missing }}' }, {})).rejects.toBeInstanceOf(
      MailTemplateError,
    );
    await expect(renderer.render({ subject: 's', bodyHtml: '{{ "a" | nope }}' }, {})).rejects.toBeInstanceOf(
      MailTemplateError,
    );
    await expect(renderer.render({ subject: '{% if %}', bodyHtml: '' }, {})).rejects.toBeInstanceOf(
      MailTemplateError,
    );
  });

  it('không đọc được file qua include / render', async () => {
    await expect(
      renderer.render({ subject: 's', bodyHtml: '{% include "/etc/passwd" %}' }, {}),
    ).rejects.toBeInstanceOf(MailTemplateError);
    await expect(
      renderer.render({ subject: 's', bodyHtml: "{% render '../../.env' %}" }, {}),
    ).rejects.toBeInstanceOf(MailTemplateError);
  });

  it('không đọc thuộc tính kế thừa (prototype) của object', async () => {
    await expect(
      renderer.render({ subject: 's', bodyHtml: '{{ user.constructor }}' }, { user: { name: 'a' } }),
    ).rejects.toBeInstanceOf(MailTemplateError);
  });
});
