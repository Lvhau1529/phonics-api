/** Chuẩn hoá từ: NFKC, chữ thường, bỏ mọi ký tự không phải chữ / số / dấu nháy đơn */
export function normalizeWord(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']/gu, '')
    .trim();
}

/** Chuẩn hoá câu: NFKC, chữ thường, bỏ dấu câu cuối, gộp khoảng trắng */
export function normalizeSentence(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const sameWord = (a: string | null | undefined, b: string | null | undefined): boolean =>
  normalizeWord(a) !== '' && normalizeWord(a) === normalizeWord(b);

export const anyWord = (a: string | null | undefined, list: readonly string[]): boolean =>
  list.some((b) => sameWord(a, b));
