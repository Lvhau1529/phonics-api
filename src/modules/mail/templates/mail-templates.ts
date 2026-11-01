import { type MailTemplateSource } from '@/infrastructure/mail/mail-renderer';

/**
 * Catalog mẫu mail: khoá + mẫu mặc định + dữ liệu mẫu (để kiểm tra mẫu admin sửa có render được không và để xem
 * trước). Thêm loại mail = thêm một dòng ở đây; mẫu mặc định được ghi vào DB (phiên bản 1) khi API khởi động.
 */
export const MAIL_TEMPLATE_KEYS = ['system.test'] as const;
export type MailTemplateKey = (typeof MAIL_TEMPLATE_KEYS)[number];

export interface MailTemplateDef extends MailTemplateSource {
  /** Mô tả cho người sửa mẫu */
  description: string;
  /** Biến dùng được: tên → mô tả (hiện cạnh editor) */
  variables: Record<string, string>;
  /** Dữ liệu mẫu đủ mọi biến */
  sample: Record<string, unknown>;
}

export const MAIL_TEMPLATES: Record<MailTemplateKey, MailTemplateDef> = {
  'system.test': {
    description: 'Mail thử để kiểm tra cấu hình gửi mail',
    variables: { sentAtText: 'Thời điểm gửi (dd/MM/yyyy HH:mm)' },
    sample: { sentAtText: '01/11/2026 21:00' },
    subject: '[Phonics] Mail thử — {{ sentAtText }}',
    bodyHtml: [
      '<p>Xin chào,</p>',
      '<p>Đây là mail thử từ hệ thống Phonics, gửi lúc <b>{{ sentAtText }}</b>.</p>',
      '<p>Nếu bạn nhận được mail này, cấu hình gửi mail đã hoạt động.</p>',
    ].join('\n'),
  },
};

export const isMailTemplateKey = (key: string): key is MailTemplateKey =>
  (MAIL_TEMPLATE_KEYS as readonly string[]).includes(key);

/** Khung chung bao quanh nội dung mọi mail (code, không cho sửa): bề ngang đọc được trên điện thoại, chân trang */
export function mailLayout(bodyHtml: string): string {
  return [
    '<!doctype html>',
    '<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background:#f4f4f5">',
    '<div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#18181b">',
    '<div style="background:#ffffff;border-radius:8px;padding:24px">',
    bodyHtml,
    '</div>',
    '<p style="margin:16px 0 0;font-size:12px;color:#71717a;text-align:center">Phonics — mail tự động, vui lòng không trả lời.</p>',
    '</div></body></html>',
  ].join('\n');
}
