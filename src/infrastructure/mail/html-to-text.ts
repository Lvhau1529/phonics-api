const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/**
 * Bản chữ thuần của mail HTML (phần `text/plain` đi kèm — trình đọc mail không hiện HTML và bộ lọc spam đều cần).
 * Không cố dựng lại bố cục: đoạn cách nhau một dòng trống, khối khác xuống dòng, link thành `chữ (url)`, mục danh
 * sách thành `- `.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // Xuống dòng trong mã nguồn HTML không có nghĩa — chỉ thẻ mới tạo dòng
    .replace(/\s+/g, ' ')
    .replace(
      /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, label: string) => {
        const inner = label.replace(/<[^>]+>/g, '').trim();
        return !inner || inner === href ? href : `${inner} (${href})`;
      },
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|h[1-6]|blockquote)>/gi, '\n\n')
    .replace(/<\/(div|tr|table|ul|ol|section)>/gi, '\n')
    .replace(/<(td|th)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
