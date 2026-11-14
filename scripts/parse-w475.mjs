// ⚠️ GENERATOR — สร้าง lib/ruleset-w475-2569.ts จาก PDF ต้นฉบับ (mupdf geometry ทีละหน้า)
// เอกสาร: "ตารางค่าดำเนินการและค่าเสื่อมราคา" (งานก่อสร้างทาง สะพาน และท่อเหลี่ยม)
//         หนังสือกรมบัญชีกลาง ด่วนที่สุด ที่ กค 0433.2/ว 475 ลงวันที่ 26 มิถุนายน 2569 (91 หน้า)
//
// ใช้: node scripts/parse-w475.mjs           → เขียน lib/ruleset-w475-2569.ts
//      node scripts/parse-w475.mjs --dry     → ตรวจ/รายงานอย่างเดียว ไม่เขียนไฟล์
//      node scripts/parse-w475.mjs --strict  → ถือว่ามี "ปัญหา" (issues) = ล้มเหลว ไม่เขียนไฟล์
//
// หลักการ:
// - อ่าน geometry (y baseline / right edge ของตัวเลข) จาก text layer — คอลัมน์ตัวเลข 5 คอลัมน์
//   (ค่าดำเนินการ / ค่าเสื่อมราคา ปกติ / ค่าเสื่อมราคา ฝนชุก / รวมค่างาน ปกติ / รวมค่างาน ฝนชุก)
//   หาจาก cluster ของขอบขวาตัวเลขในแต่ละหน้าเอง แล้ว assert ว่าได้ 5 คอลัมน์ตามลำดับ (ไม่ใช้ x ตายตัว)
// - 1 ช่วงราคาน้ำมัน = 2 หน้า: หน้าแรก ลำดับ 1–12 (หน้า 2,4,…,90) · หน้าที่สอง ลำดับ 13–20 (หน้า 3,5,…,91)
// - โครงสร้างรายการ: ลำดับ (1–20) → บรรทัดย่อย; บรรทัดย่อยมี 3 แบบ: ราคา 5 ค่า · ราคาก้อนเดียว (ค่าติดตั้งเครื่องผสม)
//   · บรรทัดหัวเรื่องไม่มีราคา ("ค่าขนส่งอุปกรณ์ 80 ตัน …" / "งานปูลาดและบดทับ …")
// - ตัวเลขในตารางเป็นทศนิยม 2 ตำแหน่ง (บาท/หน่วย) → เก็บเป็น "สตางค์" จำนวนเต็ม; ค่าก้อนเดียว (250,000) = บาทเต็ม ×100
// - FAIL LOUDLY: sha256/จำนวนหน้า/หัวตาราง/หัวคอลัมน์/จำนวนคอลัมน์/โครงสร้างรายการไม่คงที่/ผลบวกไม่ลงตัว
//   / ค่าเสื่อมราคาไม่คงที่ข้ามช่วงน้ำมัน / ค่าดำเนินการลดลงเมื่อน้ำมันแพงขึ้น / เซลล์ขาด → throw พร้อมหน้า+y
// - หมายเหตุคุณภาพ: ฟอนต์ของเอกสารนี้สลับ สระอำ/า ใน text layer — normalizer กู้คืนด้วย sentinel
//   (ำ จริงถูก encode เป็น mai-tho + า; า จริงถูก encode เป็น ำ) แล้วตรวจคำที่กู้คืนได้ด้วยตา
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { PDFDocument } from "mupdf";

const ROOT = path.resolve(import.meta.dirname, "..");
const PDF = path.join(ROOT, "docs/reg-2569/w475.pdf");
const URLS = path.join(ROOT, "docs/reg-2569/extract/pdf-urls.json");
const OUT = path.join(ROOT, "lib/ruleset-w475-2569.ts");
const DRY = process.argv.includes("--dry");
const STRICT = process.argv.includes("--strict");

// sha256 ของว 475 ฉบับที่ใช้สกัด (Yotathai mirror) — ต้องตรงกับ docs/reg-2569/manifest.md
const EXPECTED_PDF_SHA256 = "ebc3df1cc958e66fb5b16723a5cd31418f554ca2627719a0102c19b3bc82a8ea";
const EXPECTED_PAGES = 91;

const fail = (msg) => {
  throw new Error("parse-w475: " + msg);
};

// — normalize ข้อความไทย —
// ฟอนต์ THSarabunPSK ในไฟล์นี้สลับ/ย่อสระอำใน text layer (ตรวจ codepoint จริงแล้ว):
//   • ำ จริง → mai-tho + า  (เช่น "อำเภอ" → "อ ้ าเภอ", "ดำเนิน" → "ด ้ าเนิน")
//     — ยกเว้น "น้ำ" ที่ mai-tho เป็นของจริง → ต้องคง ้ ไว้ (น + ้ + ำ)
//   • า จริง → ำ  (เช่น "งาน" → "งำน", "ค่า" → "ค่ำ")
//   • หัวคอลัมน์บางบรรทัด: ำ จริง → " ำ" (ช่องว่าง + ำ เช่น "ล ำดับ")
// กู้คืนด้วย sentinel S: ้+า → S · " ำ" → S · ำ ที่เหลือ (= า จริง) → า · น+S → น+้ · S → ำ
const SENTINEL = "\u0001";
function norm(s) {
  let t = s.normalize("NFC");
  t = t.replace(/\s?\u0E49\u0E32/g, SENTINEL); // ำ จริง (mai-tho + า) — มี/ไม่มีช่องว่างนำ
  t = t.replace(/\s\u0E33/g, SENTINEL); // ำ จริง ที่ถูกแยกด้วยช่องว่าง (หัวคอลัมน์)
  t = t.replace(/\u0E33/g, "\u0E32"); // ำ ที่เหลือ = า จริง ที่ถูก encode ผิด
  t = t.replace(/\u0E19(?=\u0001)/g, "\u0E19\u0E49"); // "น้ำ" — mai-tho เป็นของจริง ไม่ใช่ของ ำ
  t = t.replace(/\u0001/g, "\u0E33"); // คืน ำ จริง
  t = t.replace(/\s(?=[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E])/g, ""); // ช่องว่างแทรกก่อนสระ/วรรณยุกต์
  return t.replace(/\s+/g, " ").trim();
}

// — ราคา: ทศนิยม 2 ตำแหน่ง (บาท) หรือจำนวนเต็มมี comma (ค่าก้อนเดียว) → สตางค์ —
function parseSatang2dp(text, where) {
  const t = text.replace(/\s+/g, "");
  const m = /^(\d+)\.(\d{2})$/.exec(t);
  if (!m) fail(`${where}: ราคาไม่ใช่ทศนิยม 2 ตำแหน่ง (บาท/หน่วย): ${JSON.stringify(text)}`);
  const v = Number(m[1]) * 100 + Number(m[2]);
  if (!Number.isSafeInteger(v) || v <= 0) fail(`${where}: ราคาผิดปกติ: ${JSON.stringify(text)}`);
  return v;
}
function parseLumpSatang(text, where) {
  const t = text.replace(/,/g, "").replace(/\s+/g, "");
  if (!/^\d+$/.test(t)) fail(`${where}: ค่าก้อนเดียวไม่ใช่จำนวนเต็มบาท: ${JSON.stringify(text)}`);
  const v = Number(t) * 100;
  if (!Number.isSafeInteger(v) || v <= 0) fail(`${where}: ค่าก้อนเดียวผิดปกติ: ${JSON.stringify(text)}`);
  return v;
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

// — อ่าน PDF —
const pdfBytes = fs.readFileSync(PDF);
const pdfSha = crypto.createHash("sha256").update(pdfBytes).digest("hex");
if (pdfSha !== EXPECTED_PDF_SHA256) {
  fail(
    `sha256 ของ w475.pdf ไม่ตรงกับที่ pin ไว้ (พบ ${pdfSha.slice(0, 16)}… / คาด ${EXPECTED_PDF_SHA256.slice(0, 16)}…) — ไฟล์เปลี่ยน ต้องยืนยันต้นฉบับและอัปเดต manifest ก่อน`,
  );
}
let sourceUrl = "";
try {
  const urls = JSON.parse(fs.readFileSync(URLS, "utf8"));
  if (Array.isArray(urls)) {
    const hit = urls.find((u) => u && typeof u === "object" && u.id === "w475");
    sourceUrl = (hit && typeof hit.url === "string" && hit.url) || "";
  } else if (urls && typeof urls === "object") {
    sourceUrl = urls["w475.pdf"] || urls["w475"] || "";
  }
} catch {
  /* ไม่มีไฟล์ก็ได้ — provenance ยังระบุได้ด้วยชื่อเอกสาร */
}

const doc = PDFDocument.openDocument(pdfBytes, "application/pdf");
const PAGES = doc.countPages();
if (PAGES !== EXPECTED_PAGES) fail(`จำนวนหน้าไม่ตรงกับ manifest (คาด ${EXPECTED_PAGES}, พบ ${PAGES})`);

const notes = [];
const issues = [];

// — อ่านบรรทัดข้อความของหน้า (normalize แล้ว) —
function linesOf(pn) {
  const page = doc.loadPage(pn - 1);
  const obj = JSON.parse(page.toStructuredText().asJSON());
  const out = [];
  for (const b of obj.blocks) {
    if (b.type !== "text") continue;
    for (const l of b.lines) {
      const text = norm(l.text);
      if (!text) continue;
      out.push({ text, x: l.bbox.x, y: l.bbox.y, w: l.bbox.w });
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

// หน้า 1 เป็นภาพ (ไม่มี text layer) — บันทึกเป็น note
if (linesOf(1).length !== 0) issues.push("หน้า 1 มี text layer (คาดว่าเป็นภาพหน้าปก) — ตรวจว่าเป็นแฟ้มเดียวกับ manifest");

const TITLE_RE = /ตารางค่าดำเนินการและค่าเสื่อมราคา/;
const FUEL_RE = /^ราคาน้ำมันดีเซล\s*ที่\s*(.+?)\s+(\d{2}\.\d{2})\s*-\s*(\d{2}\.\d{2})\s*บาท\s*\/\s*ลิตร/;

let titleTemplate = null;
let basisTemplate = null;

// ตรวจหัวตาราง/หัวคอลัมน์ และคืนช่วงน้ำมันที่พิมพ์
function parseTableHeader(pn) {
  const L = linesOf(pn);
  const titleLine = L.find((l) => TITLE_RE.test(l.text));
  if (!titleLine) fail(`หน้า ${pn}: ไม่พบหัวตาราง "ตารางค่าดำเนินการและค่าเสื่อมราคา"`);
  const title = titleLine.text;
  if (titleTemplate === null) titleTemplate = title;
  else if (title !== titleTemplate) fail(`หน้า ${pn}: หัวตารางไม่เหมือนหน้าแรก: ${JSON.stringify(title)} ≠ ${JSON.stringify(titleTemplate)}`);

  const fuelLine = L.find((l) => /ราคาน้ำมันดีเซล/.test(l.text));
  if (!fuelLine) {
    const cand = L.filter((l) => /ราคา/.test(l.text)).map((l) => `${JSON.stringify(l.text)} ${[...l.text].map((c) => c.codePointAt(0).toString(16)).join(",")}`);
    fail(`หน้า ${pn}: ไม่พบหัว "ราคาน้ำมันดีเซล" — บรรทัดที่ขึ้นต้นด้วย "ราคา": ${cand.join(" | ") || "(ไม่มี)"}`);
  }
  const m = FUEL_RE.exec(fuelLine.text);
  if (!m) fail(`หน้า ${pn}: อ่านช่วงราคาน้ำมันจากหัวตารางไม่ได้: ${JSON.stringify(fuelLine.text)}`);
  const basis = m[1].trim();
  if (basisTemplate === null) basisTemplate = basis;
  else if (basis !== basisTemplate) fail(`หน้า ${pn}: ฐานราคาน้ำมันไม่เหมือนหน้าแรก: ${JSON.stringify(basis)} ≠ ${JSON.stringify(basisTemplate)}`);

  // หัวคอลัมน์ — ต้องมีครบและเรียงถูก (กันหัวตารางถูกตัด/สลับ)
  const need = ["ลำดับ", "ลักษณะงาน", "หน่วย", "ค่าดำเนินการ", "ค่าเสื่อมราคา (บาท)", "รวมค่างาน (บาท)"];
  for (const label of need) {
    if (!L.some((l) => l.text === label)) fail(`หน้า ${pn}: ไม่พบหัวคอลัมน์ ${JSON.stringify(label)}`);
  }
  const hdr = (label) => L.find((l) => l.text === label);
  const order = ["ค่าดำเนินการ", "ค่าเสื่อมราคา (บาท)", "รวมค่างาน (บาท)"].map((s) => hdr(s).x);
  if (!(order[0] < order[1] && order[1] < order[2])) fail(`หน้า ${pn}: ลำดับหัวคอลัมน์เงินผิด (${order.join(",")})`);

  const sub = L.filter((l) => /^(ปกติ|ฝนชุก)$/.test(l.text)).sort((a, b) => a.x - b.x);
  if (sub.length !== 4) fail(`หน้า ${pn}: หัวคอลัมน์ย่อย "ปกติ/ฝนชุก" ต้องมี 4 (พบ ${sub.length})`);
  const subOrder = sub.map((l) => `${l.text}@${Math.round(l.x)}`).join(" ");
  if (!(sub[0].x < sub[1].x && sub[1].x < sub[2].x && sub[2].x < sub[3].x)) fail(`หน้า ${pn}: หัวคอลัมน์ย่อยซ้อนกัน: ${subOrder}`);
  if (sub[0].text !== "ปกติ" || sub[1].text !== "ฝนชุก" || sub[2].text !== "ปกติ" || sub[3].text !== "ฝนชุก") {
    fail(`หน้า ${pn}: ลำดับ "ปกติ/ฝนชุก" ผิด: ${subOrder}`);
  }

  return { fuelMinSatang: parseSatang2dp(m[2], `หน้า ${pn} ช่วงน้ำมัน`), fuelMaxSatang: parseSatang2dp(m[3], `หน้า ${pn} ช่วงน้ำมัน`) };
}

const DEC = /^\d+\.\d{2}$/;
const LUMP = /^\d{1,3}(?:,\d{3})+$/;

function clusterEdges(edges, tol = 5) {
  const groups = [];
  for (const e of [...edges].sort((a, b) => a - b)) {
    const g = groups.find((g) => Math.abs(g.center - e) <= tol);
    if (g) g.items.push(e);
    else groups.push({ center: e, items: [e] });
    if (g) g.center = g.items.reduce((a, b) => a + b, 0) / g.items.length;
  }
  return groups.sort((a, b) => a.center - b.center);
}

// อ่านหน้าเดียว: คืนรายการ row { seq, name, unit, five?, lump? } — five = 5 ตัวเลขตามลำดับคอลัมน์
function readPage(pn, expectFiveRows, expectLumps) {
  const all = linesOf(pn);
  const footer = all.find((l) => /สิ่งที่ส่งมาด้วย/.test(l.text));
  if (!footer) fail(`หน้า ${pn}: ไม่พบบรรทัดท้าย "สิ่งที่ส่งมาด้วย"`);
  // ขอบล่างของหัวตาราง = บรรทัด "ปกติ/ฝนชุก" แถวล่างสุด — กันหัวคอลัมน์ถูกอ่านเป็นแถวข้อมูล
  const subHeaderY = Math.max(...all.filter((l) => /^(ปกติ|ฝนชุก)$/.test(l.text)).map((l) => l.y));
  if (!Number.isFinite(subHeaderY)) fail(`หน้า ${pn}: ไม่พบหัวคอลัมน์ย่อย "ปกติ/ฝนชุก"`);
  const body = all.filter((l) => l.y > subHeaderY + 4 && l.y < footer.y - 4);

  const nums = body.filter((l) => DEC.test(l.text) || LUMP.test(l.text));
  const decs = nums.filter((l) => DEC.test(l.text));
  const lumps = nums.filter((l) => LUMP.test(l.text));
  if (lumps.length !== expectLumps) {
    fail(`หน้า ${pn}: จำนวนค่าก้อนเดียว (มี comma) ต้องเป็น ${expectLumps} (พบ ${lumps.length})`);
  }
  if (decs.length !== expectFiveRows * 5) {
    fail(`หน้า ${pn}: จำนวนค่าราคา 2 ตำแหน่งต้องเป็น ${expectFiveRows * 5} (พบ ${decs.length}) — แถวราคา ${expectFiveRows} × 5 คอลัมน์`);
  }

  const clusters = clusterEdges(nums.map((l) => Math.round(l.x + l.w)));
  if (clusters.length !== 5) {
    fail(`หน้า ${pn}: คอลัมน์ตัวเลขต้องมี 5 (พบ ${clusters.length}: ${clusters.map((c) => Math.round(c.center)).join(",")})`);
  }
  const centers = clusters.map((c) => c.center);
  const expectCounts = [expectFiveRows + expectLumps, expectFiveRows, expectFiveRows, expectFiveRows, expectFiveRows];
  clusters.forEach((c, i) => {
    if (c.items.length !== expectCounts[i]) {
      fail(`หน้า ${pn}: คอลัมน์ที่ ${i + 1} มี ${c.items.length} ค่า (คาด ${expectCounts[i]}) — โครงสร้างตารางเปลี่ยน`);
    }
  });

  const rows = [];
  for (const l of body) {
    let r = rows.find((r) => Math.abs(r.y - l.y) <= 6);
    if (!r) rows.push((r = { y: l.y, lines: [] }));
    r.lines.push(l);
  }

  const outRows = [];
  for (const r of rows) {
    const seqLine = r.lines.find((l) => /^\d+$/.test(l.text) && l.x < 110);
    const valueLines = r.lines.filter((l) => DEC.test(l.text) || LUMP.test(l.text));
    const textLines = r.lines.filter((l) => !DEC.test(l.text) && !LUMP.test(l.text));
    const unitLine = textLines.find((l) => l.x >= 265 && l.x < 320);
    const nameLine = textLines.find((l) => l.x >= 110 && l.x < 265);
    // ข้อความอื่นนอกช่วงชื่อ/หน่วย/ลำดับ = ผิดปกติ
    const other = textLines.filter((l) => l !== unitLine && l !== nameLine && l !== seqLine && l.x < 265);
    if (other.length) fail(`หน้า ${pn}: บรรทัด y=${Math.round(r.y)} มีข้อความในคอลัมน์ชื่อซ้ำ/ไม่รู้จัก: ${JSON.stringify(other.map((o) => o.text))}`);

    const vals = valueLines
      .map((l) => ({ l, ci: centers.reduce((best, c, i) => (Math.abs(c - (l.x + l.w)) < Math.abs(centers[best] - (l.x + l.w)) ? i : best), 0) }))
      .sort((a, b) => a.ci - b.ci);
    // ทุกค่าต้องอยู่ใกล้ศูนย์กลางคอลัมน์ที่รับ (ไม่คลาดเกิน 6 px)
    for (const v of vals) {
      if (Math.abs(centers[v.ci] - (v.l.x + v.l.w)) > 6) {
        fail(`หน้า ${pn}: ค่า ${JSON.stringify(v.l.text)} ที่ y=${Math.round(r.y)} ไม่อยู่ในคอลัมน์ใด (ขอบขวา ${Math.round(v.l.x + v.l.w)})`);
      }
    }
    if (vals.length !== 0 && vals.length !== 1 && vals.length !== 5) {
      fail(`หน้า ${pn}: แถว y=${Math.round(r.y)} มี ${vals.length} ค่า (ต้องเป็น 0, 1 หรือ 5)`);
    }
    if (vals.length === 1 && vals[0].ci !== 0) {
      fail(`หน้า ${pn}: ค่าก้อนเดียวที่ y=${Math.round(r.y)} ต้องอยู่คอลัมน์ค่าเนินการ (คอลัมน์ 1) แต่พบคอลัมน์ ${vals[0].ci + 1}`);
    }
    if (vals.length === 5 && vals.map((v) => v.ci).join(",") !== "0,1,2,3,4") {
      fail(`หน้า ${pn}: แถว 5 ค่าที่ y=${Math.round(r.y)} ไม่ครบคอลัมน์ 1–5: ${vals.map((v) => v.ci + 1).join(",")}`);
    }
    if (!nameLine && !seqLine) fail(`หน้า ${pn}: แถว y=${Math.round(r.y)} ไม่มีชื่อรายการ`);
    if (seqLine && nameLine && vals.length > 0 && !unitLine) {
      fail(`หน้า ${pn}: แถวลำดับ ${seqLine.text} มีราคาแต่ไม่มีหน่วย`);
    }
    if (vals.length > 0 && !unitLine) fail(`หน้า ${pn}: แถว y=${Math.round(r.y)} มีราคาแต่ไม่มีหน่วย`);
    if (vals.length === 0 && unitLine) {
      fail(`หน้า ${pn}: แถว y=${Math.round(r.y)} มีหน่วยแต่ไม่มีราคา — โครงสร้างตารางเปลี่ยน`);
    }

    outRows.push({
      y: r.y,
      seq: seqLine ? Number(seqLine.text) : null,
      name: nameLine ? nameLine.text : null,
      unit: unitLine ? unitLine.text : null,
      five: vals.length === 5 ? vals.map((v) => parseSatang2dp(v.l.text, `หน้า ${pn} y=${Math.round(r.y)}`)) : null,
      lump: vals.length === 1 ? parseLumpSatang(vals[0].l.text, `หน้า ${pn} y=${Math.round(r.y)}`) : null,
    });
  }
  return outRows;
}

// — สร้าง items จาก band แรก แล้ว assert ว่าทุก band มีโครงสร้างเดียวกัน —
const ITEM_KEYS = ["entryNo", "entryName", "label", "unit", "priced", "occurrence"];

function buildItems(rowsA, rowsB, pnA, pnB) {
  const items = [];
  let curEntry = null;
  for (const r of [...rowsA, ...rowsB]) {
    if (r.seq !== null) {
      curEntry = { entryNo: r.seq, entryName: r.name ?? "" };
      items.push({
        entryNo: r.seq,
        entryName: curEntry.entryName,
        label: curEntry.entryName,
        unit: r.unit,
        priced: r.five ? "five" : r.lump !== null ? "lump" : "none",
        occurrence: 1,
      });
      continue;
    }
    if (!curEntry) fail(`หน้า ${pnA}/${pnB}: พบรายการย่อยก่อนลำดับแรก`);
    if (!r.name) fail(`หน้า ${pnA}/${pnB}: รายการย่อยไม่มีชื่อ (y=${Math.round(r.y)})`);
    // บรรทัดย่อยบางบรรทัดพิมพ์ชื่อซ้ำภายในลำดับเดียว (เช่น "- ดันและตัก" 2 ครั้งในลำดับ 3)
    // → เก็บ occurrence ไว้เป็นกุญแจให้ค้นหาได้ชัดเจน
    const occurrence = items.filter((i) => i.entryNo === curEntry.entryNo && i.label === r.name).length + 1;
    items.push({
      entryNo: curEntry.entryNo,
      entryName: curEntry.entryName,
      label: r.name,
      unit: r.unit,
      priced: r.five ? "five" : r.lump !== null ? "lump" : "none",
      occurrence,
    });
  }

  const seqs = items.filter((i) => i.label === i.entryName).map((i) => i.entryNo);
  for (let i = 0; i < seqs.length; i++) if (seqs[i] !== i + 1) fail(`หน้า ${pnA}/${pnB}: ลำดับรายการไม่ต่อเนื่อง (${seqs.slice(0, 5).join(",")}… ลำดับที่ ${i + 1} = ${seqs[i]})`);
  if (seqs.length !== 20) fail(`หน้า ${pnA}/${pnB}: จำนวนลำดับต้องเป็น 20 (พบ ${seqs.length})`);

  // โครงสร้างที่พิมพ์จริง (ตรวจด้วยตาแล้ว): 77 บรรทัด/ช่วง = หัวเรื่องลำดับ 20 (ไม่มีราคา)
  //   + บรรทัดย่อยราคา 5 ค่า 58 + หัวข้อย่อยไม่มีราคา 2 + ค่าก้อนเดียว 2
  //   (ลำดับ 7/9/10/17/18 มีราคาอยู่บรรทัดลำดับเอง → นับเป็น "five")
  const five = items.filter((i) => i.priced === "five").length;
  const lump = items.filter((i) => i.priced === "lump").length;
  const none = items.filter((i) => i.priced === "none").length;
  if (process.argv.includes("--debug-items")) {
    for (const it of items) console.log(`  ${it.entryNo}#${it.occurrence} ${it.priced.padEnd(4)} ${JSON.stringify(it.label)} ${JSON.stringify(it.unit)}`);
  }
  if (items.length !== 77) fail(`หน้า ${pnA}/${pnB}: จำนวนบรรทัดต้องเป็น 77 (พบ ${items.length})`);
  if (five !== 58) fail(`หน้า ${pnA}/${pnB}: จำนวนบรรทัดราคา 5 ค่าต้องเป็น 58 (พบ ${five})`);
  if (lump !== 2) fail(`หน้า ${pnA}/${pnB}: จำนวนบรรทัดค่าก้อนเดียวต้องเป็น 2 (พบ ${lump})`);
  if (none !== 17) fail(`หน้า ${pnA}/${pnB}: จำนวนบรรทัดไม่มีราคาต้องเป็น 17 (พบ ${none})`);
  for (const it of items) {
    if (it.priced !== "none" && !it.unit) fail(`หน้า ${pnA}/${pnB}: "${it.label}" มีราคาแต่ไม่มีหน่วย`);
    if (it.priced === "none" && it.unit) fail(`หน้า ${pnA}/${pnB}: "${it.label}" ไม่มีราคาแต่มีหน่วย ${JSON.stringify(it.unit)}`);
  }

  // (entryNo, label, occurrence) ต้องไม่ซ้ำ — ใช้เป็นกุญแจค้นหา
  const seen = new Set();
  for (const it of items) {
    const key = `${it.entryNo}|${it.label}|${it.occurrence}`;
    if (seen.has(key)) fail(`หน้า ${pnA}/${pnB}: รายการซ้ำ (ลำดับ ${it.entryNo} · ${it.label} · ครั้งที่ ${it.occurrence}) — ค้นหาไม่ชัดเจน`);
    seen.add(key);
  }
  return items;
}

const itemsKey = (it) => ITEM_KEYS.map((k) => JSON.stringify(it[k])).join("|");

// — อ่านทุกช่วงน้ำมัน —
const bands = [];
let items = null;
let firstMin = null;
for (let b = 0; b < 45; b++) {
  const pnA = 2 + 2 * b;
  const pnB = 3 + 2 * b;
  const hdrA = parseTableHeader(pnA);
  const hdrB = parseTableHeader(pnB);
  if (hdrA.fuelMinSatang !== hdrB.fuelMinSatang || hdrA.fuelMaxSatang !== hdrB.fuelMaxSatang) {
    fail(`หน้า ${pnA}/${pnB}: ช่วงน้ำมันสองหน้าไม่ตรงกัน (${baht(hdrA.fuelMinSatang)}–${baht(hdrA.fuelMaxSatang)} ≠ ${baht(hdrB.fuelMinSatang)}–${baht(hdrB.fuelMaxSatang)})`);
  }
  if (hdrA.fuelMaxSatang !== hdrA.fuelMinSatang + 99) {
    fail(`หน้า ${pnA}: ช่วงน้ำมันต้องกว้าง 1.00 บาท (${baht(hdrA.fuelMinSatang)}–${baht(hdrA.fuelMaxSatang)})`);
  }
  if (firstMin === null) firstMin = hdrA.fuelMinSatang;
  if (hdrA.fuelMinSatang !== firstMin + b * 100) {
    fail(`หน้า ${pnA}: ช่วงน้ำมันไม่ต่อเนื่อง — คาด ${baht(firstMin + b * 100)} แต่พบ ${baht(hdrA.fuelMinSatang)}`);
  }

  const rowsA = readPage(pnA, 32, 0);
  const rowsB = readPage(pnB, 26, 2);
  // จำนวนบรรทัดต่อหน้า (ตรวจด้วยตาแล้ว): หน้าแรก 41 บรรทัด · หน้าที่สอง 36 บรรทัด (รวม 77)
  if (rowsA.length !== 41) fail(`หน้า ${pnA}: จำนวนบรรทัดต้องเป็น 41 (พบ ${rowsA.length})`);
  if (rowsB.length !== 36) fail(`หน้า ${pnB}: จำนวนบรรทัดต้องเป็น 36 (พบ ${rowsB.length})`);
  const bandItems = buildItems(rowsA, rowsB, pnA, pnB);
  if (items === null) items = bandItems;
  else {
    if (bandItems.length !== items.length) {
      fail(`หน้า ${pnA}/${pnB}: จำนวนบรรทัด ${bandItems.length} ไม่เท่ากับช่วงแรก ${items.length}`);
    }
    for (let i = 0; i < items.length; i++) {
      if (itemsKey(bandItems[i]) !== itemsKey(items[i])) {
        fail(`หน้า ${pnA}/${pnB}: โครงสร้างบรรทัดที่ ${i + 1} เปลี่ยน — ${itemsKey(bandItems[i])} ≠ ${itemsKey(items[i])}`);
      }
    }
  }

  // ประกอบค่าตามลำดับ items
  const rows = [...rowsA, ...rowsB];
  if (rows.length !== items.length) fail(`หน้า ${pnA}/${pnB}: จำนวนแถว ${rows.length} ไม่เท่ากับ items ${items.length}`);
  const operationSatang = [];
  const depNormalSatang = [];
  const depRainySatang = [];
  const totalNormalSatang = [];
  const totalRainySatang = [];
  for (let i = 0; i < items.length; i++) {
    const r = rows[i];
    const it = items[i];
    if (it.priced === "five") {
      const [op, dn, dr, tn, tr] = r.five;
      if (op + dn !== tn) fail(`หน้า ${pnA}/${pnB}: "${it.label}" — ค่าดำเนินการ ${baht(op)} + ค่าเสื่อมราคาปกติ ${baht(dn)} ≠ รวมปกติ ${baht(tn)}`);
      if (op + dr !== tr) fail(`หน้า ${pnA}/${pnB}: "${it.label}" — ค่าดำเนินการ ${baht(op)} + ค่าเสื่อมราคาฝนชุก ${baht(dr)} ≠ รวมฝนชุก ${baht(tr)}`);
      if (dr < dn) fail(`หน้า ${pnA}/${pnB}: "${it.label}" — ค่าเสื่อมราคาฝนชุก (${baht(dr)}) < ปกติ (${baht(dn)})`);
      operationSatang.push(op);
      depNormalSatang.push(dn);
      depRainySatang.push(dr);
      totalNormalSatang.push(tn);
      totalRainySatang.push(tr);
    } else if (it.priced === "lump") {
      operationSatang.push(r.lump);
      depNormalSatang.push(null);
      depRainySatang.push(null);
      totalNormalSatang.push(null);
      totalRainySatang.push(null);
    } else {
      operationSatang.push(null);
      depNormalSatang.push(null);
      depRainySatang.push(null);
      totalNormalSatang.push(null);
      totalRainySatang.push(null);
    }
  }

  bands.push({
    fuelMinSatang: hdrA.fuelMinSatang,
    fuelMaxSatang: hdrA.fuelMaxSatang,
    operationSatang,
    depNormalSatang,
    depRainySatang,
    totalNormalSatang,
    totalRainySatang,
    sourcePages: [pnA, pnB],
  });
}

if (bands.length !== 45) fail(`จำนวนช่วงน้ำมันต้องเป็น 45 (พบ ${bands.length})`);

// — ตรวจข้ามช่วงน้ำมัน —
for (let i = 0; i < items.length; i++) {
  const it = items[i];
  if (it.priced === "none") continue;
  const op = bands.map((b) => b.operationSatang[i]);
  if (it.priced === "lump") {
    if (new Set(op).size !== 1) fail(`"${it.label}" (ค่าก้อนเดียว) เปลี่ยนค่าระหว่างช่วงน้ำมัน: ${op.slice(0, 3).join(",")}… — ตรวจเอกสาร`);
  } else {
    const dn = bands.map((b) => b.depNormalSatang[i]);
    const dr = bands.map((b) => b.depRainySatang[i]);
    if (new Set(dn).size !== 1) fail(`"${it.label}" — ค่าเสื่อมราคาปกติไม่คงที่ข้ามช่วงน้ำมัน: ${dn.slice(0, 3).join(",")}…`);
    if (new Set(dr).size !== 1) fail(`"${it.label}" — ค่าเสื่อมราคาฝนชุกไม่คงที่ข้ามช่วงน้ำมัน: ${dr.slice(0, 3).join(",")}…`);
    for (let k = 1; k < op.length; k++) {
      if (op[k] < op[k - 1]) {
        issues.push(`"${it.label}" — ค่าดำเนินการลดลงเมื่อน้ำมันแพงขึ้น (${baht(bands[k - 1].fuelMinSatang)}: ${baht(op[k - 1])} → ${baht(bands[k].fuelMinSatang)}: ${baht(op[k])})`);
      }
    }
  }
}

// — checksums —
const bandChecksums = {};
for (const b of bands) bandChecksums[String(b.fuelMinSatang)] = checksum(b);
const itemsChecksum = checksum(items);
const schedule = {
  titlePrinted: titleTemplate,
  fuelPriceBasis: basisTemplate,
  items,
  bands,
  unit: "satang",
};
const setChecksum = checksum(schedule);
const rulesetChecksum = checksum({
  factorF: null,
  labor: null,
  contingencyPct: null,
  swcPct: null,
  durableHandlingPct: null,
  machinerySchedule: schedule,
});

// — สถิติ/คุณภาพ —
const fiveItems = items.filter((i) => i.priced === "five").length;
const lumpItems = items.filter((i) => i.priced === "lump").length;
const noneItems = items.filter((i) => i.priced === "none").length;
const priceValues = fiveItems * 5 * bands.length + lumpItems * bands.length;
if (!Number.isSafeInteger(priceValues)) fail("จำนวนค่ามากเกินขอบจำนวนเต็ม");
notes.push(
  `แบ่งหน้า: 1 ช่วงน้ำมัน = 2 หน้า — หน้าแรก ลำดับ 1–12 (ราคา 5 ค่า 32 บรรทัด + ไม่มีราคา 9) · ` +
    `หน้าที่สอง ลำดับ 13–20 (ราคา 5 ค่า 26 + ค่าก้อนเดียว 2 + ไม่มีราคา 8)`,
);
notes.push(`หน้า 1 ของ PDF เป็นภาพหน้าปก (ไม่มี text layer) — ไม่มีข้อมูลตาราง`);
notes.push(`มีบรรทัดหัวเรื่องไม่มีราคา ${noneItems} บรรทัด (ตามต้นฉบับ): ${items.filter((i) => i.priced === "none").map((i) => i.label).join(" · ")}`);
notes.push(`กู้คืนสระอำ/า จาก text layer ที่ฟอนต์สลับอักขระ (normalizer + ตรวจด้วยตา)`);

console.log(`pages=${PAGES} bands=${bands.length} items=${items.length} (five=${fiveItems} lump=${lumpItems} none=${noneItems}) values=${priceValues}`);
console.log(`fuel ${baht(bands[0].fuelMinSatang)}–${baht(bands[bands.length - 1].fuelMaxSatang)} · รายการ ${items.length} · ลำดับ ${items.filter((i) => i.label === i.entryName).length}`);
console.log(`title=${JSON.stringify(titleTemplate)} basis=${JSON.stringify(basisTemplate)}`);
console.log(`itemsChecksum=${itemsChecksum}`);
console.log(`setChecksum=${setChecksum} rulesetChecksum=${rulesetChecksum} pdfSha=${pdfSha}`);
if (notes.length) {
  console.log(`ℹ notes ${notes.length} รายการ:`);
  for (const n of notes) console.log("  - " + n);
}
if (issues.length) {
  console.log(`⚠ issues ${issues.length} รายการ:`);
  for (const i of issues) console.log("  - " + i);
}
if (STRICT && issues.length > 0) fail(`--strict: พบ issues ${issues.length} รายการ — ต้องแก้/ยืนยันก่อน generate`);

if (DRY) {
  console.log("— dry run: ไม่เขียนไฟล์ —");
  process.exit(0);
}

// — pretty printer: object ขยายบรรทัด, array ของ primitive อยู่บรรทัดเดียว —
function pretty(v, ind = 0) {
  const pad = "  ".repeat(ind);
  const pad2 = "  ".repeat(ind + 1);
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.every((x) => x === null || typeof x !== "object")) return JSON.stringify(v);
    return "[\n" + v.map((x) => pad2 + pretty(x, ind + 1)).join(",\n") + "\n" + pad + "]";
  }
  const keys = Object.keys(v);
  return "{\n" + keys.map((k) => pad2 + JSON.stringify(k) + ": " + pretty(v[k], ind + 1)).join(",\n") + "\n" + pad + "}";
}

const file = `// ⚠️ ไฟล์นี้ GENERATED อัตโนมัติ — ห้ามแก้มือ
// generator: node scripts/parse-w475.mjs (mupdf geometry จาก docs/reg-2569/w475.pdf)
// เอกสาร: ตารางค่าดำเนินการและค่าเสื่อมราคา (งานก่อสร้างทาง สะพาน และท่อเหลี่ยม)
//         หนังสือกรมบัญชีกลาง ด่วนที่สุด ที่ กค 0433.2/ว 475 ลงวันที่ 26 มิถุนายน 2569 (91 หน้า)
//         ทางการ: ต้นฉบับราชกิจจานุเบกษา — ไฟล์ที่ใช้สกัดเป็นสำเนา Yotathai mirror (ดู docs/reg-2569/manifest.md)
//         provenance: mirror-unverified · ยังไม่ยืนยันกับราชกิจจานุเบกษา
//
// ⚠️ กฎเหล็ก: ก่อนใช้คำนวณเพื่อเอกสารส่งราชการจริง ต้องยืนยันตัวเลขกับต้นฉบับทางการก่อน
//    (sha256 ของไฟล์ที่สกัด: ${pdfSha})
//
// หน่วยเงิน: ตัวประกาศพิมพ์เป็นบาททศนิยม 2 ตำแหน่ง → ไฟล์นี้เก็บเป็น "สตางค์" จำนวนเต็มทุกค่า
//   · บรรทัดราคาเต็ม: 5 ค่า/แถว = ค่าดำเนินการ, ค่าเสื่อมราคา (ปกติ/ฝนชุก), รวมค่างาน (ปกติ/ฝนชุก)
//   · บรรทัดค่าก้อนเดียว (ค่าติดตั้งเครื่องผสม): เก็บเฉพาะค่าดำเนินการ (บาทเต็ม × 100) — ช่องอื่น null
//   · บรรทัดหัวเรื่องที่ต้นฉบับไม่พิมพ์ราคา: null ทุกช่อง (priced = "none")
//   แปลงเป็นบาทเพื่อแสดงผลด้วย satang / 100 — ไม่ปัดเศษข้อมูล
//
// สถิติ: ${bands.length} ช่วงราคาน้ำมัน (${baht(bands[0].fuelMinSatang)}–${baht(bands[bands.length - 1].fuelMaxSatang)} บาท/ลิตร) · ${items.length} บรรทัด (${items.filter((i) => i.label === i.entryName).length} ลำดับ)
//   บรรทัดราคา 5 ค่า ${fiveItems} · ค่าก้อนเดียว ${lumpItems} · หัวเรื่องไม่มีราคา ${noneItems} · ค่าทั้งหมด ${priceValues.toLocaleString("en-US")}
//   * ค่าเสื่อมราคา (ปกติ/ฝนชุก) คงที่ทุกช่วงน้ำมัน — ตรวจแล้ว · ค่าดำเนินการไม่ลดลงเมื่อราคาน้ำมันแพงขึ้น — ตรวจแล้ว
// คุณภาพการถอด: notes ${notes.length} (ตั้งใจแปลง) · issues ${issues.length} (ต้องตรวจ — 0 = ผ่าน)
import type { MachineryRateBand, MachineryRateItem, MachineryRateSchedule, Ruleset } from "./ruleset";

const W475_2569_PDF_SHA256 = ${JSON.stringify(pdfSha)};
const W475_2569_SOURCE_URL = ${JSON.stringify(sourceUrl)};
export const W475_2569_TITLE = ${JSON.stringify(titleTemplate)};
export const W475_2569_FUEL_PRICE_BASIS = ${JSON.stringify(basisTemplate)};

export const W475_2569_ITEMS: MachineryRateItem[] = ${pretty(items)};

export const W475_2569_BANDS: MachineryRateBand[] = ${pretty(bands)};

function freezeDeep<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const k of Object.keys(v as object)) freezeDeep((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

export const W475_2569_SCHEDULE: MachineryRateSchedule = freezeDeep({
  titlePrinted: W475_2569_TITLE,
  fuelPriceBasis: W475_2569_FUEL_PRICE_BASIS,
  items: W475_2569_ITEMS,
  bands: W475_2569_BANDS,
  unit: "satang",
});

export const W475_2569_BAND_CHECKSUMS: Record<string, string> = ${pretty(bandChecksums)};
export const W475_2569_ITEMS_CHECKSUM = ${JSON.stringify(itemsChecksum)};
export const W475_2569_SET_CHECKSUM = ${JSON.stringify(setChecksum)};
export const W475_2569_RULESET_CHECKSUM = ${JSON.stringify(rulesetChecksum)};

export const W475_2569_QUALITY = ${pretty({ notes, issues })};
export const W475_2569_STATS = ${pretty({
  pages: PAGES,
  bands: bands.length,
  items: items.length,
  entries: items.filter((i) => i.label === i.entryName).length,
  fivePriceItems: fiveItems,
  lumpSumItems: lumpItems,
  unpricedItems: noneItems,
  priceValues,
  fuelMinSatang: bands[0].fuelMinSatang,
  fuelMaxSatang: bands[bands.length - 1].fuelMaxSatang,
})};

export function getW475Ruleset(): Ruleset {
  return {
    id: "reg2569-machinery-w475",
    name: "ตารางค่าดำเนินการและค่าเสื่อมราคา (หลักเกณฑ์ราคากลางงานก่อสร้าง พ.ศ. 2569)",
    sourceDoc: "หนังสือกรมบัญชีกลาง ด่วนที่สุด ที่ กค 0433.2/ว 475 ลงวันที่ 26 มิถุนายน 2569",
    sourceUrl: W475_2569_SOURCE_URL,
    effectiveFrom: "2026-06-09", // วันบังคับใช้ตามข้อ ๕ ของประกาศ (วันถัดจากวันประกาศ ๘ มิ.ย. ๒๕๖๙) — ยืนยันกับราชกิจจานุเบกษา 14 พ.ย. 2569 (หนังสือเวียน ว 475 ลง 26 มิ.ย. ไม่ใช่วันบังคับใช้ — ดู docs/reg-2569/README.md)
    checksum: W475_2569_RULESET_CHECKSUM,
    machinerySchedule: W475_2569_SCHEDULE,
    machineryScheduleChecksum: W475_2569_SET_CHECKSUM,
    notices: [
      "ที่มา: สำเนา PDF จาก Yotathai mirror — ยังไม่ยืนยันกับราชกิจจานุเบกษา/เล่มประกาศจริง (provenance: mirror-unverified) ห้ามใช้คำนวณส่งหน่วยงานก่อนยืนยัน",
      "ค่าก้อนเดียว (ค่าติดตั้งเครื่องผสม) คิดเป็นครั้ง — ไม่ใช่ราคาต่อหน่วยงาน",
      "จัดทำด้วยระบบ iserv BOQ — ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง",
    ],
    provenance: {
      sourceKind: "mirror-unverified",
      verifiedAgainstGazette: false,
      retrievedFrom: W475_2569_SOURCE_URL,
    },
    createdAt: "2026-11-13T00:00:00.000Z",
  };
}

// ตรวจ checksum ทุกชั้น (ใช้ในเทสต์/ตรวจไฟล์) — คืนรายการที่ไม่ตรง
export function verifyW475Checksums(): string[] {
  const bad: string[] = [];
  const eq = (a: string, b: string, label: string) => {
    if (a !== b) bad.push(\`\${label}: \${a} ≠ \${b}\`);
  };
  for (const b of W475_2569_BANDS) {
    const k = String(b.fuelMinSatang);
    eq(W475_2569_BAND_CHECKSUMS[k] ?? "<missing>", checksumOf(b), \`band \${k}\`);
  }
  if (Object.keys(W475_2569_BAND_CHECKSUMS).length !== W475_2569_BANDS.length) bad.push("จำนวน checksum รายช่วงไม่ตรง");
  eq(W475_2569_ITEMS_CHECKSUM, checksumOf(W475_2569_ITEMS), "items");
  eq(W475_2569_SET_CHECKSUM, checksumOf(W475_2569_SCHEDULE), "set");
  eq(
    W475_2569_RULESET_CHECKSUM,
    checksumOf({
      factorF: null,
      labor: null,
      contingencyPct: null,
      swcPct: null,
      durableHandlingPct: null,
      machinerySchedule: W475_2569_SCHEDULE,
    }),
    "ruleset",
  );
  return bad;
}

// — checksum เดียวกับ lib/ruleset.ts (FNV-1a 2×32 บน stableStringify) —
function stableStringify(data: unknown): string {
  if (data === null || typeof data !== "object") return JSON.stringify(data);
  if (Array.isArray(data)) return "[" + data.map((v) => stableStringify(v)).join(",") + "]";
  const keys = Object.keys(data as object).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((data as Record<string, unknown>)[k])).join(",") + "}";
}
function checksumOf(data: unknown): string {
  const s = stableStringify(data);
  let h1 = 2166136261 >>> 0;
  let h2 = 14695981039970662767 >>> 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 ^ c) * 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 1099511628211);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}
`;

fs.writeFileSync(OUT, file, "utf8");
console.log(`wrote ${OUT} (${file.split("\n").length} lines)`);
