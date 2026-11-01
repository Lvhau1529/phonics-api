import { describe, expect, it } from 'vitest';
import { htmlToText } from '@/infrastructure/mail/html-to-text';

describe('htmlToText', () => {
  it('đoạn cách một dòng trống, bỏ xuống dòng của mã nguồn, style / comment', () => {
    const html =
      '<style>p{color:red}</style><!-- x --><p>Xin   chào,</p><p>Dòng 1<br>Dòng 2</p>\n\n\n<div>Cuối</div>';
    expect(htmlToText(html)).toBe('Xin chào,\n\nDòng 1\nDòng 2\n\nCuối');
  });

  it('link thành "chữ (url)", link trần giữ url', () => {
    expect(htmlToText('<a href="https://x.vn/a">Duyệt</a> · <a href="https://x.vn">https://x.vn</a>')).toBe(
      'Duyệt (https://x.vn/a) · https://x.vn',
    );
  });

  it('danh sách thành gạch đầu dòng, ô bảng cách nhau', () => {
    expect(htmlToText('<ul><li>An</li><li>Bình</li></ul><table><tr><td>A</td><td>B</td></tr></table>')).toBe(
      '- An\n- Bình\nA B',
    );
  });

  it('giải mã entity', () => {
    expect(htmlToText('<p>A &amp; B &lt;3 &quot;x&quot; &#39;y&#39; &#x2014;&nbsp;z</p>')).toBe(
      `A & B <3 "x" 'y' — z`,
    );
  });
});
