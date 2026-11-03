/**
 * Chuỗi VietQR (chuẩn EMVCo của NAPAS) để app ngân hàng quét ra sẵn tài khoản, số tiền, nội dung — hàm thuần, không
 * gọi dịch vụ ngoài. Mỗi trường dạng TLV: id (2 số) + độ dài (2 số) + giá trị; cuối là CRC16-CCITT (trường 63).
 */

const tlv = (id: string, value: string): string => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF), 4 ký tự hex in hoa */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface VietQrInput {
  /** Mã BIN ngân hàng (6 số) */
  bin: string;
  accountNo: string;
  /** VND; không có / ≤ 0 = để người chuyển tự nhập */
  amount?: number;
  /** Nội dung chuyển khoản (ASCII) */
  content?: string | null;
}

export function vietQrPayload({ bin, accountNo, amount, content }: VietQrInput): string {
  const hasAmount = !!amount && amount > 0;
  const merchant =
    tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', accountNo)) + tlv('02', 'QRIBFTTA');
  const body =
    tlv('00', '01') +
    // 12 = QR động (có số tiền), 11 = tĩnh
    tlv('01', hasAmount ? '12' : '11') +
    tlv('38', merchant) +
    tlv('53', '704') +
    (hasAmount ? tlv('54', String(Math.round(amount))) : '') +
    tlv('58', 'VN') +
    (content ? tlv('62', tlv('08', content)) : '') +
    '6304';
  return body + crc16(body);
}
