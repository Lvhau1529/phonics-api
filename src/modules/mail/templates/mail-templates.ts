import { type MailTemplateSource } from '@/infrastructure/mail/mail-renderer';

/**
 * Catalog mẫu mail: khoá + mẫu mặc định + dữ liệu mẫu (để kiểm tra mẫu admin sửa có render được không và để xem
 * trước). Thêm loại mail = thêm một dòng ở đây; mẫu mặc định được ghi vào DB (phiên bản 1) khi API khởi động.
 */
export const MAIL_TEMPLATE_KEYS = [
  'system.test',
  'parent.invite',
  'family.approved',
  'family.rejected',
  'teacher.digest',
] as const;
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
  'parent.invite': {
    description: 'Mời phụ huynh đặt mật khẩu tài khoản gia đình (admin tạo / chuyển đổi)',
    variables: {
      parentName: 'Tên phụ huynh',
      childrenText: 'Tên các bé, cách nhau bởi dấu phẩy',
      link: 'Link đặt mật khẩu (dùng một lần)',
      expiresHours: 'Số giờ link còn hiệu lực',
      email: 'Email đăng nhập',
    },
    sample: {
      parentName: 'Nguyễn Thị Lan',
      childrenText: 'Nguyễn Văn An (Andy), Nguyễn Thị Bình',
      link: 'https://game.example.vn/#/set-password?token=abc',
      expiresHours: 72,
      email: 'lan@example.vn',
    },
    subject: '[Phonics] Tài khoản gia đình của {{ parentName }}',
    bodyHtml: [
      '<p>Chào {{ parentName }},</p>',
      '<p>Trung tâm đã tạo <b>tài khoản gia đình</b> để phụ huynh và các bé ({{ childrenText }}) vào học trên Phonics.</p>',
      '<p>Email đăng nhập: <b>{{ email }}</b></p>',
      '<p><a href="{{ link }}" style="display:inline-block;padding:10px 18px;background:#ffdc58;color:#18181b;border-radius:6px;text-decoration:none;font-weight:bold">Đặt mật khẩu</a></p>',
      '<p>Link dùng một lần, hết hạn sau {{ expiresHours }} giờ. Hết hạn thì nhờ trung tâm gửi lại.</p>',
      '<p>Sau khi đăng nhập, chọn bé để vào học.</p>',
    ].join('\n'),
  },
  'family.approved': {
    description: 'Báo phụ huynh: các bé đã được duyệt vào lớp',
    variables: {
      parentName: 'Tên phụ huynh',
      approved: 'Danh sách bé đã duyệt: name, className',
      pendingCount: 'Số bé còn chờ duyệt',
      link: 'Link vào game',
    },
    sample: {
      parentName: 'Nguyễn Thị Lan',
      approved: [{ name: 'Nguyễn Văn An (Andy)', className: 'K2A' }],
      pendingCount: 1,
      link: 'https://game.example.vn',
    },
    subject: '[Phonics] Tài khoản của bé đã được duyệt',
    bodyHtml: [
      '<p>Chào {{ parentName }},</p>',
      '<p>Trung tâm đã duyệt:</p>',
      '<ul>{% for c in approved %}<li><b>{{ c.name }}</b> — lớp {{ c.className }}</li>{% endfor %}</ul>',
      '{% if pendingCount > 0 %}<p>Còn {{ pendingCount }} bé đang chờ duyệt.</p>{% endif %}',
      '<p><a href="{{ link }}">Vào Phonics</a>, đăng nhập rồi chọn bé để bắt đầu học.</p>',
    ].join('\n'),
  },
  'family.rejected': {
    description: 'Báo phụ huynh: đăng ký bị từ chối',
    variables: { parentName: 'Tên phụ huynh', childrenText: 'Tên các bé bị từ chối', reason: 'Lý do' },
    sample: { parentName: 'Nguyễn Thị Lan', childrenText: 'Nguyễn Văn An', reason: 'Lớp đã đủ sĩ số' },
    subject: '[Phonics] Đăng ký chưa được duyệt',
    bodyHtml: [
      '<p>Chào {{ parentName }},</p>',
      '<p>Trung tâm chưa duyệt đăng ký của: <b>{{ childrenText }}</b>.</p>',
      '<p>Lý do: {{ reason }}</p>',
      '<p>Phụ huynh vui lòng liên hệ trung tâm nếu cần hỗ trợ.</p>',
    ].join('\n'),
  },
  'teacher.digest': {
    description:
      'Mail 21:00 cho giáo viên: các buổi học thêm chưa xác nhận điểm danh (duyệt nhanh bằng link)',
    variables: {
      teacherName: 'Tên giáo viên',
      dateText: 'Ngày gửi, vd Thứ Ba 03/11',
      count: 'Số buổi cần xác nhận',
      sessions:
        'Danh sách buổi: name, dateText, timeText, isOld, studentCount, presentCount, absentCount, confirmLink, cancelLink, editLink',
      confirmAllLink: 'Link duyệt tất cả',
    },
    sample: {
      teacherName: 'Cô Lan',
      dateText: 'Thứ Ba 03/11',
      count: 2,
      sessions: [
        {
          name: 'Phonics nâng cao',
          dateText: '03/11',
          timeText: '17:00–18:30',
          isOld: false,
          studentCount: 12,
          presentCount: 11,
          absentCount: 1,
          confirmLink: 'https://admin.example.vn/a/attendance/abc?session=1',
          cancelLink: 'https://admin.example.vn/a/attendance/abc?session=1&action=cancel',
          editLink: 'https://admin.example.vn/attendance/sessions/1',
        },
        {
          name: 'Phonics cơ bản',
          dateText: '31/10',
          timeText: '18:00–19:00',
          isOld: true,
          studentCount: 10,
          presentCount: 10,
          absentCount: 0,
          confirmLink: 'https://admin.example.vn/a/attendance/abc?session=2',
          cancelLink: 'https://admin.example.vn/a/attendance/abc?session=2&action=cancel',
          editLink: 'https://admin.example.vn/attendance/sessions/2',
        },
      ],
      confirmAllLink: 'https://admin.example.vn/a/attendance/abc',
    },
    subject: '[Phonics] Xác nhận điểm danh học thêm {{ dateText }} — {{ count }} buổi',
    bodyHtml: [
      '<p>Chào {{ teacherName }},</p>',
      '<p>Các buổi học thêm cần xác nhận điểm danh:</p>',
      '<table style="width:100%;border-collapse:collapse">',
      '{% for s in sessions %}<tr style="border-top:1px solid #e4e4e7">',
      '<td style="padding:8px 4px">{% if s.isOld %}<i>Còn treo — {{ s.dateText }}</i><br>{% endif %}<b>{{ s.name }}</b> {{ s.timeText }}<br>',
      '{{ s.studentCount }} HS ({{ s.presentCount }} có mặt{% if s.absentCount > 0 %}, {{ s.absentCount }} vắng{% endif %})</td>',
      '<td style="padding:8px 4px;white-space:nowrap;text-align:right"><a href="{{ s.confirmLink }}">Duyệt</a> · <a href="{{ s.editLink }}">Sửa</a> · <a href="{{ s.cancelLink }}">Nghỉ</a></td>',
      '</tr>{% endfor %}',
      '</table>',
      '<p style="text-align:center;margin-top:20px"><a href="{{ confirmAllLink }}" style="display:inline-block;padding:10px 18px;background:#ffdc58;color:#18181b;border-radius:6px;text-decoration:none;font-weight:bold">Duyệt tất cả {{ count }} buổi</a></p>',
      '<p style="font-size:13px;color:#71717a">Có thay đổi (vắng, thêm học sinh) thì bấm Sửa, đăng nhập rồi xác nhận. Buổi không học (GV / lớp nghỉ) thì bấm Nghỉ — buổi được huỷ, không tính học phí. Link hết hạn sau 7 ngày.</p>',
    ].join('\n'),
  },
};

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
