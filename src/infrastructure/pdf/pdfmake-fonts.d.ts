/**
 * `pdfmake/fonts/Roboto` (pdfmake 0.3) xuất bảng đường dẫn tuyệt đối tới 4 file Roboto .ttf đi kèm gói;
 * @types/pdfmake không khai báo subpath này nên bổ sung ở đây.
 */
declare module 'pdfmake/fonts/Roboto' {
  const fonts: {
    Roboto: { normal: string; bold: string; italics: string; bolditalics: string };
  };
  export = fonts;
}
