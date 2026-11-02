import { Injectable } from '@nestjs/common';
import { Liquid, type LiquidOptions } from 'liquidjs';
import { htmlToText } from '@/infrastructure/mail/html-to-text';

/** Mẫu mail (Liquid): tiêu đề + nội dung HTML */
export interface MailTemplateSource {
  subject: string;
  bodyHtml: string;
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

/** Mẫu sai cú pháp / dùng biến không có / render quá giới hạn — message của LiquidJS, đủ để người sửa mẫu biết lỗi */
export class MailTemplateError extends Error {}

const SUBJECT_MAX = 250;

/**
 * Mẫu do admin sửa trên giao diện → coi là dữ liệu không tin cậy: không đọc file (`templates: {}` — `include` /
 * `render` / `layout` không với ra đĩa được), chỉ đọc thuộc tính riêng của object, biến / filter lạ là lỗi, có giới hạn
 * kích thước + thời gian render.
 */
const BASE: LiquidOptions = {
  templates: {},
  ownPropertyOnly: true,
  strictVariables: true,
  strictFilters: true,
  parseLimit: 200_000,
  renderLimit: 2_000,
  memoryLimit: 10_000_000,
};

@Injectable()
export class MailRenderer {
  /** Nội dung HTML: mọi `{{ x }}` tự escape (tên học sinh có `<` không phá mail); cần HTML thô thì `| raw` */
  private readonly htmlEngine = new Liquid({ ...BASE, outputEscape: 'escape' });
  /** Tiêu đề là chữ thuần (header mail), không escape HTML */
  private readonly plainEngine = new Liquid(BASE);

  /**
   * Render mẫu với `context`. `wrap` bọc nội dung đã render (khung chung: logo, chân trang) — khung là code, không
   * phải dữ liệu người dùng, nên không đi qua Liquid.
   */
  async render(
    source: MailTemplateSource,
    context: Record<string, unknown>,
    wrap: (bodyHtml: string) => string = (body) => body,
  ): Promise<RenderedMail> {
    try {
      const [subject, body] = await Promise.all([
        this.plainEngine.parseAndRender(source.subject, context),
        this.htmlEngine.parseAndRender(source.bodyHtml, context),
      ]);
      const html = wrap(String(body));
      return { subject: oneLine(String(subject)), html, text: htmlToText(html) };
    } catch (err) {
      throw new MailTemplateError(err instanceof Error ? err.message : String(err));
    }
  }
}

/** Tiêu đề một dòng (không cho xuống dòng chen header), cắt độ dài */
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, SUBJECT_MAX);
}
