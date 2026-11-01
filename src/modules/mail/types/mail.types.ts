/** Mail vừa lấy ra khỏi hàng đợi để gửi (`attempts` đã gồm lần này) */
export interface ClaimedMail {
  id: string;
  toEmail: string;
  cc: string[];
  subject: string;
  html: string;
  text: string;
  attempts: number;
}

/** Một mail cần xếp hàng */
export interface OutboxItem {
  /** Khoá template (= loại mail) */
  kind: string;
  /** null / rỗng → lưu SKIPPED (vd chưa có email phụ huynh), không gửi */
  to: string | null | undefined;
  cc?: readonly string[];
  subject: string;
  html: string;
  text: string;
  /** Chống gửi trùng: cùng khoá thì chỉ dòng đầu tiên được lưu */
  dedupeKey: string;
  refType?: string;
  refId?: string;
  /** Hẹn giờ gửi; mặc định gửi ngay */
  sendAt?: Date;
}

/** Kết quả một lượt gửi */
export interface DeliveryResult {
  sent: number;
  retried: number;
  failed: number;
}
