// สกัดข้อความทั้งไฟล์ PDF ประกาศ (mupdf ESM) เป็นไฟล์ .txt แบ่งหน้า — รูปแบบเดียวกับ extract/w481-pages.txt
// ใช้: node scripts/extract-pdf-pages.mjs <src.pdf> <out.txt>
import * as fs from "fs";
import * as path from "path";
import { PDFDocument } from "mupdf";

const [, , srcArg, outArg] = process.argv;
if (!srcArg || !outArg) {
  console.error("ใช้: node scripts/extract-pdf-pages.mjs <src.pdf> <out.txt>");
  process.exit(1);
}
const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.resolve(ROOT, srcArg);
const OUT = path.resolve(ROOT, outArg);

const buf = fs.readFileSync(SRC);
const doc = PDFDocument.openDocument(buf, "application/pdf");
const n = doc.countPages();
let all = [];
let empty = 0;
for (let i = 0; i < n; i++) {
  const page = doc.loadPage(i);
  const st = page.toStructuredText();
  const text = typeof st.asPageText === "function" ? st.asPageText(false) : st.asText();
  if (text.trim() === "") empty++;
  all.push(`======== PAGE ${i + 1}/${n} ========\n` + text);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, all.join("\n\n"), "utf8");
console.log(`pages=${n} empty=${empty} -> ${OUT}`);
