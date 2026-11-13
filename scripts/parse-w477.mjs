// ⚠️ GENERATOR — สร้าง lib/ruleset-w477-2569.ts จาก PDF ต้นฉบับ (mupdf geometry ทีละหน้า)
// เอกสาร: "ตารางค่าขนส่งวัสดุก่อสร้าง"
//         หนังสือกรมบัญชีกลาง ด่วนที่สุด ที่ กค 0433.2/ว 477 ลงวันที่ 26 มิถุนายน 2569 (280 หน้า)
//
// ใช้: node scripts/parse-w477.mjs           → เขียน lib/ruleset-w477-2569.ts
//      node scripts/parse-w477.mjs --dry     → ตรวจ/รายงานอย่างเดียว ไม่เขียนไฟล์
//      node scripts/parse-w477.mjs --strict  → ถือว่ามี "ปัญหา" (issues) = ล้มเหลว ไม่เขียนไฟล์
//
// หลักการ:
// - อ่าน geometry (y baseline / x0) จาก text layer — คอลัมน์ระบุด้วย anchor จากหัวตาราง "ระยะ" (3 คอลัมน์/หน้า)
// - 1 ช่วงราคาน้ำมัน = 2 หน้า: หน้าแรก ระยะ 1–120 (3 คอลัมน์ × 40 แถว), หน้าที่สอง ระยะ 121–200
//   (27/27/26 แถว) + แถวพิเศษ "201–1000 กม. คิดเป็น กม.ละ" + หมายเหตุ 3 ข้อ
// - ตัวเลขราคาในตารางเป็นทศนิยม 2 ตำแหน่ง (บาท) → เก็บเป็น "สตางค์" จำนวนเต็ม (integer) ตามกฎเงิน
// - ตัวเลขกฎหมาย (ช่วงน้ำมัน 25.00–69.99, ระยะ 1–200/201–1000, อัตรา กม.ละ) ดึงจากเอกสารเอง — ไม่ hardcode
// - FAIL LOUDLY: sha256 เปลี่ยน / จำนวนหน้าไม่ตรง / หัวตารางไม่ตรง / ลำดับระยะไม่ต่อเนื่อง / เซลล์ไม่ครบ 3 ช่อง
//   / ราคาไม่ใช่ทศนิยม 2 ตำแหน่ง / ค่าจากแถวพิเศษไม่ตรงกับหมายเหตุ / ช่วงน้ำมันขาดตอน → throw พร้อมหน้า+y
// - เช็คแยก 2 ระดับ: `notes` = ข้อมูลที่ตั้งใจแปลง (เช่น ฟอนต์ต่างใน section 3) · `issues` = ต้องมีคนตรวจ
//   (ราคาไม่ monotonic, ค่าเฉลี่ยน้ำมันไม่ตรงกลางช่วง, ลำดับราคาข้ามประเภทรถผิดปกติ) → `--strict` ล้มเหลวถ้ามี issues
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { PDFDocument } from "mupdf";

const ROOT = path.resolve(import.meta.dirname, "..");
const PDF = path.join(ROOT, "docs/reg-2569/w477.pdf");
const URLS = path.join(ROOT, "docs/reg-2569/extract/pdf-urls.json");
const OUT = path.join(ROOT, "lib/ruleset-w477-2569.ts");
const DRY = process.argv.includes("--dry");
const STRICT = process.argv.includes("--strict");

// sha256 ของว 477 ฉบับที่ใช้สกัด (Yotathai mirror) — ต้องตรงกับ docs/reg-2569/manifest.md
// ถ้าไฟล์ถูกสลับ/อัปเดต ต้องอัปเดตค่าที่นี่และ manifest พร้อมกัน (กัน regenerate เงียบ ๆ ใต้ชื่อเดิม)
const EXPECTED_PDF_SHA256 = "181c866f5350af2644a338b75634f7899938f742e772d9d7d8efc87e7995c497";
const EXPECTED_PAGES = 280;

const fail = (msg) => {
  throw new Error("parse-w477: " + msg);
};

// — normalize ข้อความไทย (สระ ำ/า เพี้ยนตามฟอนต์) — ตรรกะเดียวกับ parse-w480.mjs —
function norm(s) {
  let t = s.replace(/\s+/g, " ").trim();
  t = t.replace(/ำ/g, "า");
  t = t.replace(/ า/g, "ำ");
  return t;
}

// — ราคา: ตัวประกาศพิมพ์ทศนิยม 2 ตำแหน่ง (บาท) → สตางค์เป็นจำนวนเต็ม —
function parseSatang(text, where) {
  const t = text.replace(/\s+/g, "");
  const m = /^(\d+)\.(\d{2})$/.exec(t);
  if (!m) fail(`${where}: ราคาไม่ใช่ทศนิยม 2 ตำแหน่ง (บาท): ${JSON.stringify(text)}`);
  const v = Number(m[1]) * 100 + Number(m[2]);
  if (!Number.isSafeInteger(v) || v <= 0) fail(`${where}: ราคาผิดปกติ: ${JSON.stringify(text)}`);
  return v;
}
function parseBahtSatang(text, where) {
  // ค่าในช่วงหัวตาราง เช่น "25.00" (ใช้หน่วยบาท/ลิตร) — แปลงเป็นสตางค์เช่นกัน
  return parseSatang(text, where);
}
const baht = (satang) => (satang / 100).toFixed(2);

// — checksum (ต้องตรงกับ lib/ruleset.ts: computeChecksum = FNV-1a 2×32 บน stableStringify) —
function stableStringify(data) {
  if (data === null || typeof data !== "object") return JSON.stringify(data);
  if (Array.isArray(data)) return "[" + data.map((v) => stableStringify(v)).join(",") + "]";
  const keys = Object.keys(data).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(data[k])).join(",") + "}";
}
function fnv1aHex(s) {
  let h1 = 2166136261 >>> 0;
  let h2 = 14695981039970662767 >>> 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 ^ c) * 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 1099511628211);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}
const checksum = (data) => fnv1aHex(stableStringify(data));

// — อ่าน geometry ทั้งไฟล์ —
const pdfBytes = fs.readFileSync(PDF);
const pdfSha = crypto.createHash("sha256").update(pdfBytes).digest("hex");
if (pdfSha !== EXPECTED_PDF_SHA256) {
  fail(`sha256 ของ w477.pdf ไม่ตรงกับที่ pin ไว้ (พบ ${pdfSha.slice(0, 16)}… / คาด ${EXPECTED_PDF_SHA256.slice(0, 16)}…) — ไฟล์เปลี่ยน ต้องยืนยันต้นฉบับและอัปเดต manifest ก่อน`);
}

const doc = PDFDocument.openDocument(pdfBytes, "application/pdf");
const PAGES = doc.countPages();
if (PAGES !== EXPECTED_PAGES) fail(`จำนวนหน้าไม่ตรงกับ manifest (คาด ${EXPECTED_PAGES}, พบ ${PAGES})`);

// sourceUrl — ต้องมีใน pdf-urls.json (หลักฐานว่าไฟล์มาจากไหน)
let sourceUrl = "";
try {
  const urls = JSON.parse(fs.readFileSync(URLS, "utf8"));
  sourceUrl = urls.find((u) => u.id === "w477")?.url ?? "";
} catch (e) {
  fail(`อ่าน ${URLS} ไม่ได้: ${e.message}`);
}
if (!sourceUrl) fail("ไม่พบ URL ของ w477 ใน docs/reg-2569/extract/pdf-urls.json");

function pageLines(pn) {
  const j = JSON.parse(doc.loadPage(pn - 1).toStructuredText().asJSON());
  const lines = [];
  for (const block of j.blocks ?? []) {
    for (const line of block.lines ?? []) {
      const text = norm(line.text ?? "");
      if (!text) continue;
      lines.push({ text, x: line.bbox.x, y: line.y ?? line.bbox.y, size: line.font?.size ?? 0 });
    }
  }
  lines.sort((a, b) => a.y - b.y || a.x - b.x);
  return lines;
}

const notes = []; // ข้อมูลที่ตั้งใจแปลง (ไม่ใช่ความผิดพลาด)
const issues = []; // ต้องมีคนตรวจ
const pageCache = new Map();
function linesOf(pn) {
  if (!pageCache.has(pn)) pageCache.set(pn, pageLines(pn));
  return pageCache.get(pn);
}

// — ตรวจหน้าที่ไม่มี text layer (ปก/คำนำเป็นภาพ) —
const charCounts = [];
for (let pn = 1; pn <= PAGES; pn++) {
  const n = linesOf(pn).reduce((a, l) => a + l.text.length, 0);
  charCounts.push({ pn, n });
}
const blankPages = charCounts.filter((c) => c.n === 0).map((c) => c.pn);
if (blankPages.join(",") !== "1,2,3,4,5,6,7") {
  fail(`หน้าที่ไม่มี text layer ต้องเป็น 1–7 (พบ ${blankPages.join(",") || "ไม่มี"}) — โครงสร้างไฟล์เปลี่ยน ต้องตรวจก่อน generate`);
}

// — หาหน้าปกของแต่ละ section (ฟอนต์ขนาดใหญ่ ≥ 30) —
const coverPages = [];
for (let pn = 8; pn <= PAGES; pn++) {
  if (linesOf(pn).some((l) => l.size >= 30)) coverPages.push(pn);
}
if (coverPages.length !== 3) fail(`ต้องพบหน้าปก 3 หน้า (6 ล้อ / 10 ล้อ / 10 ล้อ+พ่วง) — พบ ${coverPages.length} หน้า: ${coverPages.join(",")}`);
for (let i = 1; i < coverPages.length; i++) {
  if (coverPages[i] - coverPages[i - 1] !== 91) fail(`ระยะห่างระหว่างหน้าปกไม่คงที่: ${coverPages[i - 1]} → ${coverPages[i]} (คาด 91 = 1 หน้าปก + 45 ช่วง × 2 หน้า)`);
}
const lastCover = coverPages[coverPages.length - 1];
if (lastCover + 90 !== PAGES) fail(`หน้าสุดท้ายของ section สุดท้ายต้องเป็นหน้า ${PAGES} (พบ ${lastCover + 90})`);

// — อ่านหัวเรื่องจากหน้าปก (ใช้เป็นแหล่งของชื่อประเภท/น้ำหนัก/ช่วงน้ำมันรวม) —
function parseSectionCover(pn) {
  const lines = linesOf(pn).filter((l) => l.size >= 30);
  if (lines.length !== 4) fail(`หน้าปก ${pn}: ต้องมี 4 บรรทัดหัวเรื่อง (พบ ${lines.length})`);
  const [title, truck, capacity, fuelRange] = lines.map((l) => l.text);
  if (!/ตารางค่าขนส่งวัสดุก่อสร้าง/.test(title)) fail(`หน้าปก ${pn}: บรรทัดแรกไม่ใช่ชื่อตาราง: ${JSON.stringify(title)}`);
  const mLorry = /รถบรรทุก\s*(\d+)\s*ล้อ/.exec(truck);
  if (!mLorry) fail(`หน้าปก ${pn}: อ่านจำนวนล้อไม่ได้: ${JSON.stringify(truck)}`);
  const hasTrailer = /รถลากพ่วง|ลากพ่วง|พ่วง/.test(truck);
  const mTon = /ไม่เกิน\s*([\d,]+)\s*ตัน/.exec(capacity);
  if (!mTon) fail(`หน้าปก ${pn}: อ่านน้ำหนักรวมสูงสุดไม่ได้: ${JSON.stringify(capacity)}`);
  const mFuel = /(\d{2}\.\d{2})\s*-\s*(\d{2}\.\d{2})/.exec(fuelRange);
  if (!mFuel) fail(`หน้าปก ${pn}: อ่านช่วงราคาน้ำมันไม่ได้: ${JSON.stringify(fuelRange)}`);
  const maxGrossTons = Number(mTon[1].replace(/,/g, ""));
  if (!Number.isInteger(maxGrossTons) || maxGrossTons <= 0) fail(`หน้าปก ${pn}: น้ำหนักรวมผิดปกติ: ${JSON.stringify(mTon[1])}`);
  return {
    title,
    truck,
    capacity,
    lorryCount: Number(mLorry[1]),
    hasTrailer,
    maxGrossTons,
    fuelMin: parseBahtSatang(mFuel[1], `หน้าปก ${pn} ช่วงน้ำมัน`),
    fuelMax: parseBahtSatang(mFuel[2], `หน้าปก ${pn} ช่วงน้ำมัน`),
  };
}

// — เงื่อนไข/ฐานราคาน้ำมันจากหัวตาราง: ต้องเหมือนกันทุกหน้าและทุก section (เก็บเป็นข้อมูลของทั้งชุด) —
let conditionsTemplate = null;
let fuelPriceBasisTemplate = null;

// แยกบรรทัด "ภูมิประเทศ… ผิวทาง… และการจราจร…" เป็น 3 เงื่อนไขตามที่พิมพ์
function splitConditionLine(text, pn) {
  const m = /^(.*?ภูมิประเทศ.*?)\s*(ผิวทาง.*?)\s*(และการจราจร.*)$/.exec(text);
  if (!m) fail(`หน้า ${pn}: อ่านเงื่อนไขหัวตาราง (ภูมิประเทศ/ผิวทาง/การจราจร) ไม่ได้: ${JSON.stringify(text)}`);
  return [m[1].trim(), m[2].trim(), m[3].trim()];
}

// — ตรวจหัวคอลัมน์: ทุกคอลัมน์ต้องมี "บาท / ตัน" ทางซ้ายของ "บาท / ลบ.ม." (3 คู่) —
// กันหัวคอลัมน์สลับ/ถูกตัด จนอ่านราคาผิดช่อง (ราคา/ลบ.ม. > ราคา/ตัน ทุกแถวตามเอกสาร)
function assertColumnHeaders(pn) {
  const compact = (t) => t.replace(/\s+/g, "");
  const headerLines = linesOf(pn).filter((l) => l.y > 80 && l.y < 132);
  const tons = headerLines.filter((l) => compact(l.text) === "บาท/ตัน").sort((a, b) => a.x - b.x);
  const m3 = headerLines.filter((l) => compact(l.text) === "บาท/ลบ.ม.").sort((a, b) => a.x - b.x);
  if (tons.length !== 3 || m3.length !== 3) {
    fail(`หน้า ${pn}: หัวคอลัมน์ "บาท / ตัน" และ "บาท / ลบ.ม." ต้องมีอย่างละ 3 (พบ ${tons.length}/${m3.length})`);
  }
  for (let i = 0; i < 3; i++) {
    if (!(tons[i].x < m3[i].x)) {
      fail(`หน้า ${pn}: คอลัมน์ที่ ${i + 1}: "บาท / ตัน" (x=${tons[i].x}) ต้องอยู่ซ้าย "บาท / ลบ.ม." (x=${m3[i].x})`);
    }
    if (i > 0 && !(m3[i - 1].x < tons[i].x)) fail(`หน้า ${pn}: หัวคอลัมน์ที่ ${i + 1} ทับกับคอลัมน์ก่อนหน้า`);
  }
  return { tons, m3 };
}

// — อ่านหัวตารางของหน้าตาราง (ทุกหน้าต้องมีครบ) —
function parseTableHeader(pn, ctx) {
  const lines = linesOf(pn).filter((l) => l.y < 80);
  const titleLine = lines.find((l) => /ตารางค่าขนส่งวัสดุก่อสร้าง/.test(l.text));
  if (!titleLine) fail(`หน้า ${pn}: ไม่พบหัวตาราง "ตารางค่าขนส่งวัสดุก่อสร้าง"`);
  const condLine = lines.find((l) => /ภูมิประเทศ/.test(l.text));
  if (!condLine) fail(`หน้า ${pn}: ไม่พบหัว "ภูมิประเทศ"`);
  const condParts = splitConditionLine(condLine.text, pn);
  if (conditionsTemplate === null) conditionsTemplate = condParts;
  else if (condParts.join("\u0000") !== conditionsTemplate.join("\u0000")) {
    fail(`หน้า ${pn}: เงื่อนไขหัวตารางไม่เหมือนช่วงแรก: ${JSON.stringify(condParts)} ≠ ${JSON.stringify(conditionsTemplate)}`);
  }
  const fuelLine = lines.find((l) => /ราคาน.*มันดีเซล/.test(l.text));
  if (!fuelLine) fail(`หน้า ${pn}: ไม่พบหัวช่วงราคาน้ำมันดีเซล`);
  const mBasis = /^(.*?)\s*\d{2}\.\d{2}\s*-/.exec(fuelLine.text);
  if (!mBasis || !mBasis[1].trim()) fail(`หน้า ${pn}: อ่านฐานราคาน้ำมันจากหัวตารางไม่ได้: ${JSON.stringify(fuelLine.text)}`);
  const fuelPriceBasis = mBasis[1].trim();
  if (fuelPriceBasisTemplate === null) fuelPriceBasisTemplate = fuelPriceBasis;
  else if (fuelPriceBasis !== fuelPriceBasisTemplate) {
    fail(`หน้า ${pn}: ฐานราคาน้ำมันในหัวตารางไม่เหมือนช่วงแรก: ${JSON.stringify(fuelPriceBasis)} ≠ ${JSON.stringify(fuelPriceBasisTemplate)}`);
  }
  const mFuel = /(\d{2}\.\d{2})\s*-\s*(\d{2}\.\d{2})/.exec(fuelLine.text);
  if (!mFuel) fail(`หน้า ${pn}: อ่านช่วงราคาน้ำมันจากหัวตารางไม่ได้: ${JSON.stringify(fuelLine.text)}`);
  const mLorry = /รถบรรทุก\s*(\d+)\s*ล้อ/.exec(titleLine.text);
  if (!mLorry) fail(`หน้า ${pn}: อ่านจำนวนล้อจากหัวตารางไม่ได้: ${JSON.stringify(titleLine.text)}`);
  const mTon = /ไม่เกิน\s*([\d,]+)\s*ตัน/.exec(titleLine.text);
  if (!mTon) fail(`หน้า ${pn}: อ่านน้ำหนักรวมจากหัวตารางไม่ได้: ${JSON.stringify(titleLine.text)}`);
  const hdr = {
    fuelMin: parseBahtSatang(mFuel[1], `หน้า ${pn} ช่วงน้ำมัน`),
    fuelMax: parseBahtSatang(mFuel[2], `หน้า ${pn} ช่วงน้ำมัน`),
    lorryCount: Number(mLorry[1]),
    hasTrailer: /พ่วง/.test(titleLine.text),
    maxGrossTons: Number(mTon[1].replace(/,/g, "")),
  };
  if (hdr.lorryCount !== ctx.lorryCount || hdr.hasTrailer !== ctx.hasTrailer || hdr.maxGrossTons !== ctx.maxGrossTons) {
    fail(`หน้า ${pn}: ประเภท/น้ำหนักรถไม่ตรงกับหน้าปก (${JSON.stringify(hdr)} ≠ ${JSON.stringify({ lorryCount: ctx.lorryCount, hasTrailer: ctx.hasTrailer, maxGrossTons: ctx.maxGrossTons })})`);
  }
  if (hdr.fuelMin !== ctx.bandMin || hdr.fuelMax !== ctx.bandMax) {
    fail(`หน้า ${pn}: ช่วงน้ำมันในหัวตาราง ${baht(hdr.fuelMin)}–${baht(hdr.fuelMax)} ไม่ตรงกับที่คาด ${baht(ctx.bandMin)}–${baht(ctx.bandMax)}`);
  }
  if (!/ไม่เกิน\s*[\d,]+\s*ตัน/.test(titleLine.text)) {
    fail(`หน้า ${pn}: หัวตารางไม่มี "ไม่เกิน … ตัน": ${JSON.stringify(titleLine.text)}`);
  }
  // ไม่เทียบข้อความหัวตารางแบบตรงตัว: แต่ละหน้าวางสระ/ช่องว่างต่างกัน (ฟอนต์เดียวกันแต่ layout ต่าง)
  // — ตัวชี้ตัวตนของ section คือ lorryCount/hasTrailer/maxGrossTons ที่เทียบด้านบนแล้ว
  assertColumnHeaders(pn);
  return hdr;
}

// — คอลัมน์: anchor จากบรรทัด "ระยะ" ของหัวตาราง —
function columnAnchors(pn) {
  const xs = linesOf(pn)
    .filter((l) => l.text === "ระยะ" && l.y < 130)
    .map((l) => l.x);
  if (xs.length !== 3) fail(`หน้า ${pn}: ต้องพบหัวคอลัมน์ "ระยะ" 3 จุด (พบ ${xs.length})`);
  for (let i = 1; i < xs.length; i++) if (!(xs[i] > xs[i - 1])) fail(`หน้า ${pn}: ตำแหน่งคอลัมน์ไม่เรียงจากซ้ายไปขวา: ${xs.join(",")}`);
  return xs;
}
function columnOf(x, anchors) {
  let k = 0;
  for (let i = 0; i < anchors.length; i++) if (x >= anchors[i] - 6) k = i;
  return k;
}

const RE_DIST = /^\d{1,3}$/;
const RE_AMOUNT = /^\d+\.\d{2}$/;

// — จัดกลุ่มบรรทัดเป็นแถว (±4) แล้วแบ่งเป็น 3 คอลัมน์ —
function groupRows(pn, yMin, yMax, anchors) {
  const lines = linesOf(pn).filter((l) => l.y >= yMin && l.y <= yMax);
  const groups = [];
  for (const ln of lines) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(ln.y - g.y) <= 4) g.cells.push(ln);
    else groups.push({ y: ln.y, cells: [ln] });
  }
  return groups.map((g) => {
    const cols = [[], [], []];
    for (const c of g.cells) cols[columnOf(c.x, anchors)].push(c.text);
    return { y: g.y, cells: g.cells, cols };
  });
}

function rowToTriples(row, pn, where) {
  return row.cols.map((c) => {
    if (c.length === 0) return null;
    if (c.length !== 3) fail(`${where}: คอลัมน์ต้องมี 3 ช่อง (พบ ${JSON.stringify(c)})`);
    if (!RE_DIST.test(c[0])) fail(`${where}: ค่าในช่องระยะไม่ใช่จำนวนเต็ม: ${JSON.stringify(c[0])}`);
    if (!RE_AMOUNT.test(c[1])) fail(`${where}: ราคา/ตันไม่ใช่ทศนิยม 2 ตำแหน่ง: ${JSON.stringify(c[1])}`);
    if (!RE_AMOUNT.test(c[2])) fail(`${where}: ราคา/ลบ.ม. ไม่ใช่ทศนิยม 2 ตำแหน่ง: ${JSON.stringify(c[2])}`);
    return { km: Number(c[0]), perTonSatang: parseSatang(c[1], where), perM3Satang: parseSatang(c[2], where) };
  });
}

// อ่านตามคอลัมน์ (คอลัมน์ที่ 1 = ระยะต้น, 2 = กลาง, 3 = ปลาย) — ไม่ใช่อ่านตามแถว
// คอลัมน์สุดท้ายอาจสั้นกว่า (ตารางจบก่อน) — ยอมให้คอลัมน์ว่างได้เมื่อข้อมูลจบแล้ว
function collectColumns(pn, yMin, yMax, excluded) {
  const anchors = columnAnchors(pn);
  const skip = excluded ?? new Set();
  const rows = groupRows(pn, yMin, yMax, anchors).filter((r) =>
    r.cells.some((c) => !skip.has(`${c.x}|${c.y}|${c.text}`)),
  );
  if (rows.length === 0) fail(`หน้า ${pn}: ไม่พบแถวข้อมูล`);
  const cols = [[], [], []];
  for (const r of rows) {
    const live = r.cells.filter((c) => !skip.has(`${c.x}|${c.y}|${c.text}`));
    if (live.length === 0) continue;
    const row = { y: r.y, cols: [[], [], []] };
    for (const c of live) row.cols[columnOf(c.x, anchors)].push(c.text);
    const filled = row.cols.filter((c) => c.length > 0);
    if (filled.some((c) => c.length !== 3)) {
      fail(`หน้า ${pn} y=${r.y.toFixed(1)}: แถวต้องมี 3 ช่องต่อคอลัมน์ (พบ ${JSON.stringify(row.cols)})`);
    }
    const t = rowToTriples(row, pn, `หน้า ${pn} y=${r.y.toFixed(1)}`);
    for (let k = 0; k < 3; k++) if (row.cols[k].length > 0) cols[k].push(t[k]);
  }
  for (let k = 0; k < 3; k++) {
    if (cols[k].length === 0) fail(`หน้า ${pn}: คอลัมน์ที่ ${k + 1} ไม่มีแถว`);
    for (let i = 1; i < cols[k].length; i++) {
      if (cols[k][i].km !== cols[k][i - 1].km + 1) {
        fail(`หน้า ${pn}: ลำดับระยะในคอลัมน์ที่ ${k + 1} ไม่ต่อเนื่อง ${cols[k][i - 1].km} → ${cols[k][i].km}`);
      }
    }
  }
  const flat = [...cols[0], ...cols[1], ...cols[2]];
  for (let i = 1; i < flat.length; i++) {
    if (flat[i].km !== flat[i - 1].km + 1) fail(`หน้า ${pn}: ลำดับระยะรวมไม่ต่อเนื่อง ${flat[i - 1].km} → ${flat[i].km}`);
  }
  return flat;
}

// — หมายเหตุท้ายหน้า (3 ข้อ + ค่าที่แนบมา) —
function parsePageNotes(pn, afterY) {
  const lines = linesOf(pn).filter((l) => l.y > afterY && l.y < 815);
  const bullets = lines.filter((l) => l.text.startsWith("-")).map((l) => l.text.replace(/^-\s*/, ""));
  const values = lines.filter((l) => !l.text.startsWith("-"));
  const RE_VAL = /^(\d+\.\d{2})\s*บาท\s*\/\s*(ตัน|ลบ\.ม\.|ลิตร)$/;
  const got = { ton: null, m3: null, liter: null };
  for (const v of values) {
    const m = RE_VAL.exec(v.text);
    if (!m) fail(`หน้า ${pn}: บรรทัดในหมายเหตุที่ไม่รู้จัก: ${JSON.stringify(v.text)}`);
    const key = m[2] === "ตัน" ? "ton" : m[2] === "ลบ.ม." ? "m3" : "liter";
    if (got[key] !== null) fail(`หน้า ${pn}: ค่า "${m[2]}" ในหมายเหตุซ้ำ`);
    got[key] = parseSatang(m[1], `หน้า ${pn} หมายเหตุ ${m[2]}`);
  }
  for (const [k, v] of Object.entries(got)) if (v === null) fail(`หน้า ${pn}: หมายเหตุขาดค่า ${k}`);
  if (bullets.length !== 3) fail(`หน้า ${pn}: หมายเหตุต้องมี 3 ข้อ (พบ ${bullets.length}): ${JSON.stringify(bullets)}`);
  if (!/ระยะขนส่ง/.test(bullets[0])) fail(`หน้า ${pn}: หมายเหตุข้อ 1 ไม่ใช่เรื่องระยะขนส่ง: ${JSON.stringify(bullets[0])}`);
  if (!/การคิดค่าขนส่งใช้ระยะทางขนส่งคูณ/.test(bullets[1])) fail(`หน้า ${pn}: หมายเหตุข้อ 2 ไม่ใช่สูตรคูณระยะทาง: ${JSON.stringify(bullets[1])}`);
  if (!/เชื้อเพลิงเฉลี่ย/.test(bullets[2])) fail(`หน้า ${pn}: หมายเหตุข้อ 3 ไม่ใช่ค่าเฉลี่ยน้ำมัน: ${JSON.stringify(bullets[2])}`);
  const mRange = /(\d+)\s*กม\.\s*ถึง\s*(\d+)\s*กม\./.exec(bullets[0]);
  if (!mRange) fail(`หน้า ${pn}: อ่านช่วงระยะทางจากหมายเหตุข้อ 1 ไม่ได้: ${JSON.stringify(bullets[0])}`);
  return { bullets, ...got, farMinKm: Number(mRange[1]), farMaxKm: Number(mRange[2]) };
}

// — ประกอบทั้งชุด —
const sections = [];
let distanceStartKm = null;
let distanceEndKm = null;
const noticeTemplates = [];
const amountBySection = new Map(); // sectionIndex → Map(km|fuelMin → {ton,m3}) สำหรับตรวจข้าม section

for (let s = 0; s < coverPages.length; s++) {
  const coverPage = coverPages[s];
  const cover = parseSectionCover(coverPage);
  const tablePages = [];
  for (let i = 1; i <= 90; i++) tablePages.push(coverPage + i);
  if (tablePages[tablePages.length - 1] !== coverPages[s] + 90) fail("ช่วงหน้าตารางของ section ไม่ครบ 90 หน้า");

  const truckType = `${cover.lorryCount} ล้อ${cover.hasTrailer ? " + รถลากพ่วง" : ""}`;
  const section = {
    truckType,
    lorryCount: cover.lorryCount,
    hasTrailer: cover.hasTrailer,
    maxGrossTons: cover.maxGrossTons,
    titlePrinted: cover.truck + " " + cover.capacity,
    bands: [],
  };

  if (s > 0) {
    const prev = sections[s - 1];
    if (cover.fuelMin !== prev.__fuelMin || cover.fuelMax !== prev.__fuelMax) fail(`หน้าปก ${coverPage}: ช่วงน้ำมันรวมไม่ตรงกับ section ก่อนหน้า`);
    if (cover.lorryCount <= prev.lorryCount && !(cover.hasTrailer && !prev.hasTrailer)) {
      issues.push(`section ${s + 1}: จำนวนล้อ (${cover.lorryCount}) ไม่ได้มากขึ้นเมื่อเทียบกับ section ก่อนหน้า (${prev.lorryCount}) — ตรวจเอกสาร`);
    }
  }

  for (let b = 0; b < 45; b++) {
    const pnA = tablePages[2 * b];
    const pnB = tablePages[2 * b + 1];
    const bandMin = cover.fuelMin + b * 100;
    const bandMax = bandMin + 99;
    if (bandMax > cover.fuelMax) fail(`section ${s + 1} ช่วง ${b + 1}: ช่วงน้ำมันเกินขอบบนของหน้าปก`);
    const ctx = {
      lorryCount: cover.lorryCount,
      hasTrailer: cover.hasTrailer,
      maxGrossTons: cover.maxGrossTons,
      bandMin,
      bandMax,
      titleExpected: norm(cover.truck + " " + cover.capacity),
    };

    // ---- หน้าแรกของช่วง (ระยะต้นช่วง) ----
    const hdrA = parseTableHeader(pnA, ctx);
    const rowsA = collectColumns(pnA, 128, 815);
    const seqA = rowsA.map((t) => t.km);
    if (distanceStartKm === null) distanceStartKm = seqA[0];
    if (seqA[0] !== distanceStartKm) fail(`หน้า ${pnA}: ระยะเริ่มต้นของช่วง ${seqA[0]} ไม่ตรงกับ ${distanceStartKm}`);
    if (b === 0 && seqA[0] !== 1) notes.push(`ตารางเริ่มที่ระยะ ${seqA[0]} กม. (ตามต้นฉบับ)`);

    // ---- หน้าที่สองของช่วง ----
    const hdrB = parseTableHeader(pnB, ctx);
    if (hdrA.fuelMin !== hdrB.fuelMin || hdrA.fuelMax !== hdrB.fuelMax) {
      fail(`หน้า ${pnA}/${pnB}: ช่วงน้ำมันในหัวตารางสองหน้าไม่ตรงกัน (${baht(hdrA.fuelMin)}–${baht(hdrA.fuelMax)} ≠ ${baht(hdrB.fuelMin)}–${baht(hdrB.fuelMax)})`);
    }
    const anchorsB = columnAnchors(pnB);
    const marker = linesOf(pnB).find((l) => /^201\s*-\s*$/.test(l.text));
    if (!marker) fail(`หน้า ${pnB}: ไม่พบแถวพิเศษ "201-" (อัตราคิดเป็น กม.ละ)`);
    const specialLines = linesOf(pnB).filter((l) => l.y >= marker.y - 6 && l.y <= marker.y + 45);
    const specialIntegers = specialLines.filter((l) => /^\d+$/.test(l.text) && Number(l.text) > 200);
    if (specialIntegers.length !== 1) fail(`หน้า ${pnB}: แถวพิเศษต้องมีขอบบน 1 ค่า (พบ ${specialIntegers.length})`);
    const farMaxKm = Number(specialIntegers[0].text);
    const specialAmounts = specialLines
      .filter((l) => RE_AMOUNT.test(l.text) && columnOf(l.x, anchorsB) === 2)
      .map((l) => parseSatang(l.text, `หน้า ${pnB} แถวพิเศษ`));
    if (specialAmounts.length !== 2) fail(`หน้า ${pnB}: แถวพิเศษต้องมีอัตรา ต่อ กม. 2 ค่า (ต่อตัน/ต่อลบ.ม.) — พบ ${specialAmounts.length}`);
    const perKmMarker = specialLines.filter((l) => /ต่อ\s*กม\./.test(l.text)).length;
    if (perKmMarker !== 2) fail(`หน้า ${pnB}: แถวพิเศษต้องมีข้อความ "ต่อ กม." 2 จุด (พบ ${perKmMarker})`);
    // แถวปกติสุดท้าย (147/174) อยู่บรรทัดเดียวกับแถวพิเศษ (201-) ในคอลัมน์ที่ 3
    // → ตัดเฉพาะบรรทัดของแถวพิเศษออก แล้วอ่านแถวปกติที่เหลือ
    const excluded = new Set();
    for (const l of specialLines) {
      const isSpecialText = /^201\s*-\s*$/.test(l.text) || /ต่อ\s*กม\./.test(l.text) || l.text === "@" || (/^\d+$/.test(l.text) && Number(l.text) > 200);
      const isSpecialAmount = RE_AMOUNT.test(l.text) && columnOf(l.x, anchorsB) === 2;
      if (isSpecialText || isSpecialAmount) excluded.add(`${l.x}|${l.y}|${l.text}`);
    }
    if (excluded.size !== 7) fail(`หน้า ${pnB}: แถวพิเศษต้องมี 7 บรรทัด (201- · 1000 · ต่อ กม. ×2 · @ · ราคา ×2) — พบ ${excluded.size}`);

    const rowsB = collectColumns(pnB, 128, marker.y + 6, excluded);
    const seqB = rowsB.map((t) => t.km);
    if (seqB[0] !== seqA[seqA.length - 1] + 1) fail(`หน้า ${pnB}: ระยะเริ่มหน้า 2 (${seqB[0]}) ไม่ต่อจากหน้าแรก (${seqA[seqA.length - 1]})`);
    if (distanceEndKm === null) distanceEndKm = seqB[seqB.length - 1];
    if (seqB[seqB.length - 1] !== distanceEndKm) fail(`หน้า ${pnB}: ระยะสุดท้าย ${seqB[seqB.length - 1]} ไม่ตรงกับ ${distanceEndKm}`);

    const note = parsePageNotes(pnB, marker.y + 45);
    if (noticeTemplates.length === 0) noticeTemplates.push(...note.bullets);
    else if (note.bullets.join("\u0000") !== noticeTemplates.join("\u0000")) {
      fail(`หน้า ${pnB}: ข้อความหมายเหตุไม่เหมือนช่วงแรกของตาราง: ${JSON.stringify(note.bullets)}`);
    }
    if (note.farMinKm !== distanceEndKm + 1) fail(`หน้า ${pnB}: หมายเหตุบอกช่วงไกลเริ่ม ${note.farMinKm} กม. แต่ตารางสิ้นสุดที่ ${distanceEndKm} กม.`);
    if (note.farMaxKm !== farMaxKm) fail(`หน้า ${pnB}: ขอบบนช่วงไกลในหมายเหตุ (${note.farMaxKm}) ไม่ตรงกับแถวพิเศษ (${farMaxKm})`);
    if (note.ton !== specialAmounts[0] || note.m3 !== specialAmounts[1]) {
      fail(`หน้า ${pnB}: อัตรา กม.ละ ในหมายเหตุ (${baht(note.ton)}/${baht(note.m3)}) ไม่ตรงกับแถวพิเศษ (${baht(specialAmounts[0])}/${baht(specialAmounts[1])})`);
    }

    const rows = [...rowsA, ...rowsB];
    if (rows.length !== distanceEndKm - distanceStartKm + 1) fail(`หน้า ${pnA}/${pnB}: จำนวนแถว ${rows.length} ไม่ครบช่วง ${distanceStartKm}–${distanceEndKm}`);
    for (let i = 1; i < rows.length; i++) if (rows[i].km !== rows[i - 1].km + 1) fail(`ช่วง ${baht(bandMin)}: ลำดับระยะรวมไม่ต่อเนื่องที่ ${rows[i - 1].km} → ${rows[i].km}`);

    // ราคาต้องไม่ลดลงเมื่อระยะทางเพิ่ม — เป็น **hard fail** (ตรงกับ import validator ที่ปฏิเสธไฟล์แบบนี้)
    // ตัวประกาศเป็นตารางสะสมต่อ กม. ราคาลดลงแปลว่าอ่านผิดช่อง/ผิดแถว ไม่ใช่ข้อยกเว้นของเอกสาร
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].perTonSatang < rows[i - 1].perTonSatang)
        fail(`หน้า ${pnA}/${pnB} ช่วง ${baht(bandMin)}: ราคา/ตัน ลดลงที่ระยะ ${rows[i].km} (${baht(rows[i - 1].perTonSatang)} → ${baht(rows[i].perTonSatang)}) — ตารางสะสมต้องไม่ลดลง`);
      if (rows[i].perM3Satang < rows[i - 1].perM3Satang)
        fail(`หน้า ${pnA}/${pnB} ช่วง ${baht(bandMin)}: ราคา/ลบ.ม. ลดลงที่ระยะ ${rows[i].km} (${baht(rows[i - 1].perM3Satang)} → ${baht(rows[i].perM3Satang)}) — ตารางสะสมต้องไม่ลดลง`);
    }
    const mid = bandMin + 50;
    if (note.liter !== mid) issues.push(`หน้า ${pnB} ช่วง ${baht(bandMin)}–${baht(bandMax)}: ค่าเฉลี่ยน้ำมันในหมายเหตุ ${baht(note.liter)} ไม่เท่ากับกลางช่วง ${baht(mid)}`);

    section.bands.push({
      // B8: ใช้ค่าที่อ่านได้จาก "หัวตาราง" (สตริงที่พิมพ์) เป็นแหล่งของค่าใน band —
      // parseTableHeader ตรวจแล้วว่าตรงกับค่าที่คำนวณจากหน้าปก (bandMin/bandMax)
      fuelMinSatang: hdrA.fuelMin,
      fuelMaxSatang: hdrA.fuelMax,
      avgFuelSatang: note.liter,
      farMinKm: note.farMinKm,
      farMaxKm: note.farMaxKm,
      farPerTonSatang: note.ton,
      farPerM3Satang: note.m3,
      perTonSatang: rows.map((r) => r.perTonSatang),
      perM3Satang: rows.map((r) => r.perM3Satang),
      sourcePages: [pnA, pnB],
    });

    // เก็บเพื่อตรวจ monotonic ข้ามช่วงน้ำมัน (ราคาต้องไม่ลดลงเมื่อน้ำมันแพงขึ้น)
    const key = `${s}|${bandMin}`;
    amountBySection.set(key, new Map(rows.map((r) => [r.km, r])));
  }

  if (section.bands.length !== 45) fail(`section ${s + 1}: ต้องมี 45 ช่วงราคาน้ำมัน (พบ ${section.bands.length})`);
  for (let i = 1; i < section.bands.length; i++) {
    const a = section.bands[i - 1];
    const b = section.bands[i];
    if (b.fuelMinSatang !== a.fuelMinSatang + 100) fail(`section ${s + 1}: ช่วงน้ำมันไม่ต่อเนื่อง ${baht(a.fuelMinSatang)} → ${baht(b.fuelMinSatang)}`);
    if (b.fuelMaxSatang !== b.fuelMinSatang + 99) fail(`section ${s + 1}: ช่วงน้ำมัน ${baht(b.fuelMinSatang)}–${baht(b.fuelMaxSatang)} ไม่กว้าง 0.99 บาท`);
  }
  const firstBand = section.bands[0];
  const lastBand = section.bands[section.bands.length - 1];
  if (firstBand.fuelMinSatang !== cover.fuelMin || lastBand.fuelMaxSatang !== cover.fuelMax) {
    fail(`section ${s + 1}: ช่วงน้ำมันของตาราง (${baht(firstBand.fuelMinSatang)}–${baht(lastBand.fuelMaxSatang)}) ไม่ตรงกับหน้าปก (${baht(cover.fuelMin)}–${baht(cover.fuelMax)})`);
  }
  // ราคาต้องไม่ลดลงเมื่อน้ำมันแพงขึ้น (ต่อช่วงน้ำมันถัดไป)
  for (let i = 1; i < section.bands.length; i++) {
    const prevB = section.bands[i - 1];
    const curB = section.bands[i];
    const a = amountBySection.get(`${s}|${prevB.fuelMinSatang}`);
    const b = amountBySection.get(`${s}|${curB.fuelMinSatang}`);
    for (const km of [distanceStartKm, Math.round((distanceStartKm + distanceEndKm) / 2), distanceEndKm]) {
      const pa = a.get(km);
      const pb = b.get(km);
      if (pa && pb) {
        if (pb.perTonSatang < pa.perTonSatang) issues.push(`section ${s + 1} ระยะ ${km}: ราคา/ตัน ลดลงเมื่อน้ำมันแพงขึ้น (${baht(prevB.fuelMinSatang)}: ${baht(pa.perTonSatang)} → ${baht(curB.fuelMinSatang)}: ${baht(pb.perTonSatang)})`);
        if (pb.perM3Satang < pa.perM3Satang) issues.push(`section ${s + 1} ระยะ ${km}: ราคา/ลบ.ม. ลดลงเมื่อน้ำมันแพงขึ้น (${baht(prevB.fuelMinSatang)}: ${baht(pa.perM3Satang)} → ${baht(curB.fuelMinSatang)}: ${baht(pb.perM3Satang)})`);
      }
    }
  }
  sections.push(section);
  Object.defineProperty(section, "__fuelMin", { value: cover.fuelMin, enumerable: false });
  Object.defineProperty(section, "__fuelMax", { value: cover.fuelMax, enumerable: false });
}

// — ตรวจความสัมพันธ์ข้ามประเภทารถ: รถใหญ่กว่า → ราคาต่อหน่วยถูกกว่า ณ ช่วงน้ำมัน/ระยะเดียวกัน —
for (let b = 0; b < 45; b++) {
  for (const km of [distanceStartKm, Math.round((distanceStartKm + distanceEndKm) / 2), distanceEndKm]) {
    const vals = sections.map((sec, s) => {
      const band = sec.bands[b];
      if (!band) return null;
      const a = amountBySection.get(`${s}|${band.fuelMinSatang}`);
      return a ? a.get(km) : null;
    });
    for (let s = 1; s < vals.length; s++) {
      const p = vals[s - 1];
      const c = vals[s];
      if (!p || !c) continue;
      if (c.perTonSatang > p.perTonSatang) issues.push(`ช่วง ${baht(sections[0].bands[b].fuelMinSatang)} ระยะ ${km}: ประเภทที่ ${s + 1} แพงกว่าประเภทที่ ${s} ต่อตัน (${baht(p.perTonSatang)} → ${baht(c.perTonSatang)})`);
      if (c.perM3Satang > p.perM3Satang) issues.push(`ช่วง ${baht(sections[0].bands[b].fuelMinSatang)} ระยะ ${km}: ประเภทที่ ${s + 1} แพงกว่าประเภทที่ ${s} ต่อลบ.ม. (${baht(p.perM3Satang)} → ${baht(c.perM3Satang)})`);
    }
  }
}

// — หมายเหตุ: section ที่ใช้ฟอนต์ต่างจากที่อื่น (ตั้งใจแปลง ไม่ใช่ปัญหา) —
for (let s = 0; s < sections.length; s++) {
  const sizes = new Set();
  for (const band of sections[s].bands) for (const pn of band.sourcePages) for (const l of linesOf(pn)) if (l.size < 20 && l.y > 80) sizes.add(Math.round(l.size));
  if (sizes.size === 1 && [...sizes][0] !== 11) notes.push(`section ${s + 1} (${sections[s].truckType}): ตัวอักษรขนาด ${[...sizes][0]} ทั้ง section (section อื่นเป็น 11) — ตั้งใจแปลงตามต้นฉบับ`);
}

// — ตรวจจำนวนแถวของแต่ละหน้าตามที่ต้นฉบับพิมพ์ — บันทึกเป็น note (แถวต่อหน้าไม่ใช่ตัวเลขกฎหมาย) —
{
  const aCounts = new Set();
  const bCounts = new Set();
  for (const sec of sections) {
    for (const band of sec.bands) {
      aCounts.add(sizeOfPage(band.sourcePages[0], true));
      bCounts.add(sizeOfPage(band.sourcePages[1], false));
    }
  }
  if (aCounts.size !== 1) fail(`จำนวนแถวต่อหน้าแรกของช่วงไม่คงที่: ${[...aCounts].join(",")}`);
  if (bCounts.size !== 1) fail(`จำนวนแถวต่อหน้าที่สองของช่วงไม่คงที่: ${[...bCounts].join(",")}`);
  const [a] = [...aCounts];
  const [b] = [...bCounts];
  if (distanceEndKm - distanceStartKm + 1 !== a + b) fail(`จำนวนแถวรวมไม่ตรงกับต่อหน้า (${distanceEndKm - distanceStartKm + 1} ≠ ${a} + ${b})`);
  notes.push(`แบ่งหน้า: หน้าแรก ${a} แถว (3 คอลัมน์) · หน้าที่สอง ${b} แถว + แถว 201–1000 กม. คิดเป็น กม.ละ + หมายเหตุ 3 ข้อ`);
}
function sizeOfPage(pn, first) {
  if (first) return collectColumns(pn, 128, 815).length;
  const marker = linesOf(pn).find((l) => /^201\s*-\s*$/.test(l.text));
  if (!marker) fail(`หน้า ${pn}: ไม่พบแถวพิเศษ "201-"`);
  const anchors = columnAnchors(pn);
  const excluded = new Set();
  for (const l of linesOf(pn)) {
    if (l.y < marker.y - 6 || l.y > marker.y + 45) continue;
    if (/^201\s*-\s*$/.test(l.text) || /ต่อ\s*กม\./.test(l.text) || l.text === "@" || (/^\d+$/.test(l.text) && Number(l.text) > 200)) excluded.add(`${l.x}|${l.y}|${l.text}`);
    if (RE_AMOUNT.test(l.text) && columnOf(l.x, anchors) === 2) excluded.add(`${l.x}|${l.y}|${l.text}`);
  }
  return collectColumns(pn, 128, marker.y + 6, excluded).length;
}

// — stats / รายงาน —
const totalRows = sections.reduce((a, s) => a + s.bands.reduce((x, b) => x + b.perTonSatang.length, 0), 0);
console.log(`pages=${PAGES} sections=${sections.length} bands/section=${sections.map((s) => s.bands.length).join("/")} distances=${distanceStartKm}–${distanceEndKm} rows=${totalRows}`);
for (const s of sections) {
  const b0 = s.bands[0];
  const bN = s.bands[s.bands.length - 1];
  console.log(`  ${s.truckType} ≤${s.maxGrossTons} ตัน · ${s.bands.length} ช่วง · ${baht(b0.fuelMinSatang)}–${baht(bN.fuelMaxSatang)} · หน้า ${b0.sourcePages[0]}–${bN.sourcePages[1]}`);
}
console.log(`notices=${noticeTemplates.length}: ${JSON.stringify(noticeTemplates)}`);
console.log(`conditions: ${JSON.stringify(conditionsTemplate)} · fuelPriceBasis: ${JSON.stringify(fuelPriceBasisTemplate)}`);
if (conditionsTemplate === null || fuelPriceBasisTemplate === null) fail("อ่านเงื่อนไข/ฐานราคาน้ำมันจากหัวตารางไม่ครบ");

const notesUnique = [...new Set(notes)];
const issuesUnique = [...new Set(issues)];
if (notesUnique.length) {
  console.log(`ℹ notes ${notesUnique.length} รายการ (การแปลงที่ตั้งใจ):`);
  for (const n of notesUnique) console.log("  - " + n);
}
if (issuesUnique.length) {
  console.log(`⚠ issues ${issuesUnique.length} รายการ (ต้องตรวจ):`);
  for (const i of issuesUnique.slice(0, 40)) console.log("  - " + i);
  if (issuesUnique.length > 40) console.log(`  … อีก ${issuesUnique.length - 40} รายการ`);
}

// — checksums —
const schedule = {
  distanceStartKm,
  sections: sections.map((s) => ({
    truckType: s.truckType,
    lorryCount: s.lorryCount,
    hasTrailer: s.hasTrailer,
    maxGrossTons: s.maxGrossTons,
    titlePrinted: s.titlePrinted,
    bands: s.bands,
  })),
  conditions: conditionsTemplate,
  fuelPriceBasis: fuelPriceBasisTemplate,
  notices: noticeTemplates,
  unit: "satang",
};
const bandChecksums = {};
const sectionChecksums = {};
for (let s = 0; s < schedule.sections.length; s++) {
  const sec = schedule.sections[s];
  for (const b of sec.bands) bandChecksums[`${s + 1}:${b.fuelMinSatang}`] = checksum(b);
  sectionChecksums[String(s + 1)] = checksum(sec);
}
const setChecksum = checksum(schedule);
// rulesetChecksum: ต้องตรงกับ canonical ใน lib/ruleset.ts (rulesetChecksum) —
// ฟิลด์บังคับมีเสมอ: factorF/labor/contingencyPct/swcPct/durableHandlingPct (null ถ้าไม่มี)
// + transportSchedule ใส่เฉพาะเมื่อมี sections · ถ้าแก้ canonical ที่ lib/ruleset.ts ต้องแก้ที่นี่พร้อมกัน
const rulesetChecksum = checksum({
  factorF: null,
  labor: null,
  contingencyPct: null,
  swcPct: null,
  durableHandlingPct: null,
  transportSchedule: schedule,
});
console.log(`setChecksum=${setChecksum} rulesetChecksum=${rulesetChecksum} pdfSha=${pdfSha}`);

if (STRICT && issuesUnique.length > 0) {
  fail(`--strict: พบ issues ${issuesUnique.length} รายการ — ต้องแก้/ยืนยันก่อน generate`);
}
if (DRY) {
  console.log("— dry run: ไม่เขียนไฟล์ —");
  process.exit(0);
}

// — pretty printer: อาร์เรย์ตัวเลขยาว ๆ พับเป็นบรรทัดละ 12 ค่า —
function pretty(v, indent = 0) {
  const pad = "  ".repeat(indent);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    if (v.every((x) => typeof x === "number")) {
      if (v.join(", ").length <= 80) return "[" + v.join(", ") + "]";
      const rows = [];
      for (let i = 0; i < v.length; i += 12) rows.push(pad + "  " + v.slice(i, i + 12).join(", "));
      return "[\n" + rows.join(",\n") + "\n" + pad + "]";
    }
    const rows = v.map((x) => pretty(x, indent + 1));
    return "[\n" + rows.map((r) => pad + "  " + r).join(",\n") + "\n" + pad + "]";
  }
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    if (keys.length === 0) return "{}";
    return "{\n" + keys.map((k) => pad + "  " + (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k)) + ": " + pretty(v[k], indent + 1)).join(",\n") + "\n" + pad + "}";
  }
  return JSON.stringify(v);
}

const file = `// ⚠️ ไฟล์นี้ GENERATED อัตโนมัติ — ห้ามแก้มือ
// generator: node scripts/parse-w477.mjs (mupdf geometry จาก docs/reg-2569/w477.pdf)
// เอกสาร: ตารางค่าขนส่งวัสดุก่อสร้าง
//         หนังสือกรมบัญชีกลาง ด่วนที่สุด ที่ กค 0433.2/ว 477 ลงวันที่ 26 มิถุนายน 2569 (280 หน้า)
//         ทางการ: ต้นฉบับราชกิจจานุเบกษา — ไฟล์ที่ใช้สกัดเป็นสำเนา Yotathai mirror (ดู docs/reg-2569/manifest.md)
//         provenance: mirror-unverified · ยังไม่ยืนยันกับราชกิจจานุเบกษา
//
// ⚠️ กฎเหล็ก: ก่อนใช้คำนวณเพื่อเอกสารส่งราชการจริง ต้องยืนยันตัวเลขกับต้นฉบับทางการก่อน
//    (sha256 ของไฟล์ที่สกัด: ${pdfSha})
//
// หน่วยเงิน: ตัวประกาศพิมพ์เป็นบาททศนิยม 2 ตำแหน่ง — ไฟล์นี้เก็บเป็น "สตางค์" จำนวนเต็มทุกค่า
//   แปลงเป็นบาทเพื่อแสดงผลด้วย (satang / 100) และปัดเฉพาะตอนแสดง ไม่ปัดตอนคำนวณ
//
// สถิติ: ${sections.length} ประเภทารถ · ${sections[0].bands.length} ช่วงราคาน้ำมัน/ประเภท · ระยะ ${distanceStartKm}–${distanceEndKm} กม. · แถวราคา ${totalRows.toLocaleString("en-US")}
//   ${sections.map((s) => `${s.truckType} ≤${s.maxGrossTons} ตัน`).join(" · ")}
// อัตราเกินตาราง: ระยะ ${sections[0].bands[0].farMinKm}–${sections[0].bands[0].farMaxKm} กม. คิดเป็น กม.ละ (ต่อตัน/ต่อลบ.ม.) — ตามหมายเหตุข้อ 1/2 ของตาราง
// เงื่อนไขการใช้ตาราง (หัวตารางทุกหน้า): ${conditionsTemplate.join(" · ")} · ${fuelPriceBasisTemplate}
//   ⚠️ ตารางนี้ใช้กับเงื่อนไขที่ระบุเท่านั้น — สภาพงานอื่นต้องใช้ตาราง/วิธีอื่น (ยังไม่มี UI เตือน)
// คุณภาพการถอด: notes ${notesUnique.length} (ตั้งใจแปลง) · issues ${issuesUnique.length} (ต้องตรวจ — 0 = ผ่าน)
//
// checksum: FNV-1a 2×32 (hex 16) บน stableStringify — ตรงกับ computeChecksum ใน lib/ruleset.ts
import { computeChecksum, rulesetChecksum } from "./ruleset";
import type { Ruleset, TransportSchedule, TransportTruckSection } from "./ruleset";

export const W477_2569_NUMBERING: string = "กค 0433.2/ว 477 ลงวันที่ 26 มิถุนายน 2569";
export const W477_2569_PDF_SHA256: string = ${JSON.stringify(pdfSha)};
export const W477_2569_SOURCE_URL: string = ${JSON.stringify(sourceUrl)};
export const W477_2569_DISTANCE_START_KM: number = ${distanceStartKm};
export const W477_2569_DISTANCE_END_KM: number = ${distanceEndKm};

// เงื่อนไขการใช้ตารางตามหัวตารางทุกหน้า — ผู้เรียกต้องเตือนเมื่อสภาพงานไม่ตรง
// ⚠️ ยังไม่มี UI เตือน — V4 ใน PROGRESS §9 ยังเปิดอยู่
export const W477_2569_CONDITIONS: string[] = ${pretty(conditionsTemplate)};
export const W477_2569_FUEL_PRICE_BASIS: string = ${JSON.stringify(fuelPriceBasisTemplate)};

export const W477_2569_SECTIONS: TransportTruckSection[] = ${pretty(schedule.sections)};

export const W477_2569_BAND_CHECKSUMS: Record<string, string> = ${pretty(bandChecksums)};
export const W477_2569_SECTION_CHECKSUMS: Record<string, string> = ${pretty(sectionChecksums)};
export const W477_2569_SET_CHECKSUM: string = ${JSON.stringify(setChecksum)};
export const W477_2569_RULESET_CHECKSUM: string = ${JSON.stringify(rulesetChecksum)};
export const W477_2569_QUALITY = { notes: ${notesUnique.length}, issues: ${issuesUnique.length} } as const;
export const W477_2569_STATS = {
  sections: ${sections.length},
  bandsPerSection: ${sections[0].bands.length},
  distanceStartKm: ${distanceStartKm},
  distanceEndKm: ${distanceEndKm},
  distanceRows: ${totalRows},
} as const;

// freeze ลึก — กันผู้เรียก mutate ค่าคงที่ระดับโมดูล (ทำให้ checksum เพี้ยนทั้ง session)
function freezeDeep<T>(v: T): T {
  if (v !== null && typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    for (const k of Object.keys(o)) freezeDeep(o[k]);
    Object.freeze(v);
  }
  return v;
}

export const W477_2569_SCHEDULE: TransportSchedule = freezeDeep({
  distanceStartKm: W477_2569_DISTANCE_START_KM,
  sections: W477_2569_SECTIONS,
  conditions: W477_2569_CONDITIONS,
  fuelPriceBasis: W477_2569_FUEL_PRICE_BASIS,
  notices: ${pretty(noticeTemplates)},
  unit: "satang",
});

export function getW477Ruleset(): Ruleset {
  return {
    id: "reg2569-transport-w477",
    name: "ตารางค่าขนส่งวัสดุก่อสร้าง (หลักเกณฑ์ราคากลางงานก่อสร้าง พ.ศ. 2569)",
    sourceDoc: "หนังสือกรมบัญชีกลาง ด่วนที่สุด ที่ " + W477_2569_NUMBERING,
    sourceUrl: W477_2569_SOURCE_URL,
    effectiveFrom: "2026-06-26", // วันที่ลงหนังสือ — ยังไม่ยืนยันวันมีผลบังคับใช้ (ดู docs/reg-2569/README.md)
    checksum: W477_2569_RULESET_CHECKSUM,
    transportSchedule: W477_2569_SCHEDULE,
    transportScheduleChecksum: W477_2569_SET_CHECKSUM,
    notices: W477_2569_SCHEDULE.notices,
    provenance: {
      sourceKind: "mirror-unverified",
      verifiedAgainstGazette: false,
      retrievedFrom: W477_2569_SOURCE_URL,
    },
    createdAt: "2026-11-13T00:00:00.000Z",
  };
}

// ตรวจ checksum รายช่วงน้ำมัน + รายประเภท + ชุดรวม + ruleset — คืนรายการที่เพี้ยน (อาร์เรย์ว่าง = ผ่าน)
export async function verifyW477Checksums(): Promise<string[]> {
  const bad: string[] = [];
  for (let s = 0; s < W477_2569_SCHEDULE.sections.length; s++) {
    const sec = W477_2569_SCHEDULE.sections[s];
    const secExpect = W477_2569_SECTION_CHECKSUMS[String(s + 1)];
    if (secExpect === undefined) bad.push("section " + (s + 1) + " (ไม่มี checksum อ้างถึง)");
    else if ((await computeChecksum(sec)) !== secExpect) bad.push("section " + (s + 1) + " (checksum เพี้ยน)");
    for (const b of sec.bands) {
      const key = (s + 1) + ":" + b.fuelMinSatang;
      const expect = W477_2569_BAND_CHECKSUMS[key];
      if (expect === undefined) bad.push(key + " (ไม่มี checksum อ้างถึง)");
      else if ((await computeChecksum(b)) !== expect) bad.push(key + " (checksum เพี้ยน)");
    }
  }
  const wantBands = W477_2569_SCHEDULE.sections.reduce((a, s) => a + s.bands.length, 0);
  if (Object.keys(W477_2569_BAND_CHECKSUMS).length !== wantBands) bad.push("__BAND_COUNT__");
  if ((await computeChecksum(W477_2569_SCHEDULE)) !== W477_2569_SET_CHECKSUM) bad.push("__SET__");
  if ((await rulesetChecksum(getW477Ruleset())) !== W477_2569_RULESET_CHECKSUM) bad.push("__RULESET__");
  return bad;
}
`;

fs.writeFileSync(OUT, file, "utf8");
console.log(`wrote ${OUT} (${file.split("\n").length} lines)`);
