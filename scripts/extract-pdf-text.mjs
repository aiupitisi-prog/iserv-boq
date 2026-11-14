// ดึง text layer จาก PDF (ถ้ามี) — ใช้ตรวจว่าสแกนมี OCR layer หรือไม่
import * as fs from "fs";
import path from "path";
import { PDFDocument } from "mupdf";

const src = path.resolve(import.meta.dirname, "..", process.argv[2] ?? "docs/reg-2569/w476.pdf");
const doc = PDFDocument.openDocument(fs.readFileSync(src), "application/pdf");
for (let i = 0; i < doc.countPages(); i++) {
  const page = doc.loadPage(i);
  const st = page.toStructuredText();
  const text = st.asText();
  console.log(`— หน้า ${i + 1}: ${text.trim().length} chars —`);
  console.log(text.slice(0, 3000));
}
