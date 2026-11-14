// เรนเดอร์หน้าเลือกของ PDF ทางการเป็น PNG — ใช้ตรวจประกาศที่ text layer เข้ารหัส legacy
// ใช้: node scripts/render-pdf-pages.mjs <src.pdf> <outDir> <first> <last>
import * as fs from "fs";
import * as path from "path";
import { PDFDocument, Matrix, ColorSpace } from "mupdf";

const [, , srcArg, outDirArg, firstArg, lastArg, scaleArg] = process.argv;
if (!srcArg || !outDirArg) {
  console.error("ใช้: node scripts/render-pdf-pages.mjs <src.pdf> <outDir> <first> <last>");
  process.exit(1);
}
const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.resolve(ROOT, srcArg);
const OUT = path.resolve(ROOT, outDirArg);
const first = parseInt(firstArg ?? "1", 10);
const last = parseInt(lastArg ?? firstArg ?? "1", 10);

const buf = fs.readFileSync(SRC);
const doc = PDFDocument.openDocument(buf, "application/pdf");
fs.mkdirSync(OUT, { recursive: true });
const s = parseFloat(scaleArg ?? "1.47"); // 1.47× ≈ 238 dpi; 2.6× ≈ 380 dpi สำหรับซูมตัวเลข
for (let i = first; i <= last; i++) {
  const page = doc.loadPage(i - 1);
  const pix = page.toPixmap(Matrix.scale(s, s), ColorSpace.DeviceRGB, false, true);
  fs.writeFileSync(path.join(OUT, `page-${String(i).padStart(4, "0")}.png`), pix.asPNG());
  console.log(`rendered page ${i}`);
}
