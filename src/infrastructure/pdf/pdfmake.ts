import path from 'node:path';
import pdfmake from 'pdfmake';
import robotoFonts from 'pdfmake/fonts/Roboto';
import { type TDocumentDefinitions } from 'pdfmake/interfaces';

/**
 * pdfmake 0.3 (Node): instance toàn cục, font đọc từ file .ttf đi kèm gói (Roboto có đủ dấu tiếng Việt).
 * Khoá truy cập file / URL: chỉ cho đọc trong thư mục font của pdfmake.
 */
const FONT_DIR = path.resolve(path.dirname(robotoFonts.Roboto.normal));
pdfmake.addFonts(robotoFonts);
pdfmake.setLocalAccessPolicy((file) => path.resolve(file).startsWith(FONT_DIR));
pdfmake.setUrlAccessPolicy(() => false);

/** Sinh PDF thành Buffer (pdfmake gom stream của pdfkit) */
export function renderPdf(doc: TDocumentDefinitions): Promise<Buffer> {
  return pdfmake.createPdf(doc).getBuffer();
}
