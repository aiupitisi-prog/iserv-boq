// ⚠️ GENERATOR — สร้าง lib/ruleset-w480-2569.ts จาก PDF ต้นฉบับ (mupdf geometry ทีละหน้า)
// เอกสาร: "บัญชีค่าแรงงาน/ดำเนินการสำหรับถอดแบบคำนวณราคากลางงานก่อสร้าง"
//         หนังสือกรมบัญชีกลาง ด่วนที่สุด ที่ กค 0433.2/ว 480 ลงวันที่ 26 มิถุนายน 2569 (45 หน้า)
//
// ใช้: node scripts/parse-w480.mjs           → เขียน lib/ruleset-w480-2569.ts
//      node scripts/parse-w480.mjs --dry     → ตรวจ/รายงานอย่างเดียว ไม่เขียนไฟล์
//      node scripts/parse-w480.mjs --strict  → ถือว่ามี "ปัญหา" (issues) = ล้มเหลว ไม่เขียนไฟล์
//
// หลักการ:
// - อ่าน geometry (y baseline / x0) จาก text layer — แต่ละ "แถว" ของตาราง = กลุ่มบรรทัด y ใกล้กัน (±4)
// - คอลัมน์จาก x0: ลำดับที่ x<68 · รายการ x<300 · หน่วย x<340 · ค่าแรง x<385 · หมายเหตุ x≥385
// - normalize สระที่ text layer เพี้ยน (ตรวจกับไฟล์จริง 13 พ.ย. 2569): า→ำ และ ำ→" ำ"/" า"
//   → แปลงกลับด้วย 2 ขั้น: ำ→า แล้ว " า"→ำ (ครอบทั้ง 3 ฟอนต์; ไม่มีกรณี "จานวน" ไม่มี space)
// - ตัวเลขกฎหมาย (ค่าแรงเหมารวม 30–37%) ดึงจากหมายเหตุข้อ 1 ของบัญชีเอง — ไม่ hardcode
// - FAIL LOUDLY: แถวที่จัดประเภทไม่ได้ / ราคาไม่ใช่จำนวนเต็มบาท / ลำดับซ้ำ / ลำดับกระโดด /
//   PDF เปลี่ยน sha256 (สลับไฟล์แล้ว regenerate เงียบ ๆ) / บรรทัดตารางหลุดขอบ → throw พร้อมหน้า+y
// - เช็คแยก 2 ระดับ: `notes` = ข้อมูลที่ตั้งใจแปลง (หัวกลุ่มไม่มีราคา, bullet ที่ย้ายเป็นหมายเหตุ)
//   `issues` = สิ่งที่ต้องมีคนตรวจ (แถวราคาไม่มีหน่วย, ลำดับไม่ต่อเนื่อง, entry ไม่มีพ่อแม่)
//   → `--strict` ล้มเหลวเมื่อมี issues; จำนวนทั้งสองระดับถูกบันทึกในหัวไฟล์ generated
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { PDFDocument } from "mupdf";

const ROOT = path.resolve(import.meta.dirname, "..");
const PDF = path.join(ROOT, "docs/reg-2569/w480.pdf");
const URLS = path.join(ROOT, "docs/reg-2569/extract/pdf-urls.json");
const OUT = path.join(ROOT, "lib/ruleset-w480-2569.ts");
const DRY = process.argv.includes("--dry");
const STRICT = process.argv.includes("--strict");

// sha256 ของว 480 ฉบับที่ใช้สกัด (Yotathai mirror) — ต้องตรงกับ docs/reg-2569/manifest.md
// ถ้าไฟล์ถูกสลับ/อัปเดต ต้องอัปเดตค่าที่นี่และ manifest พร้อมกัน (กัน regenerate เงียบ ๆ ใต้ชื่อเดิม)
const EXPECTED_PDF_SHA256 = "65e87e15576cbe5cef9593e68b0702b6bad279180845ca5beef27738d76b2e16";

const fail = (msg) => {
  throw new Error("parse-w480: " + msg);
};

// — normalize ข้อความไทย (สระ ำ/า เพี้ยนตามฟอนต์) —
function norm(s) {
  let t = s.replace(/\s+/g, " ").trim();
  t = t.replace(/ำ/g, "า"); // ตัวประกาศ/ฟอนต์ map า → ำ
  t = t.replace(/ า/g, "ำ"); // ำ แท้ ออกมาเป็น " า" (หรือ " ำ" ซึ่งกลายเป็น "า" หลังขั้นแรก)
  return t;
}

// — price: ตัวประกาศพิมพ์เป็นบาทเต็ม (มี comma คั่นหลักพัน) —
function parsePrice(text, where) {
  const digits = text.replace(/,/g, "").replace(/\s+/g, "");
  if (!/^\d+$/.test(digits)) fail(`${where}: ค่าแรงไม่ใช่จำนวนเต็มบาท: ${JSON.stringify(text)}`);
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n <= 0) fail(`${where}: ค่าแรงผิดปกติ: ${JSON.stringify(text)}`);
  return n;
}

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
  fail(`sha256 ของ w480.pdf ไม่ตรงกับที่ pin ไว้ (พบ ${pdfSha.slice(0, 16)}… / คาด ${EXPECTED_PDF_SHA256.slice(0, 16)}…) — ไฟล์เปลี่ยน ต้องยืนยันต้นฉบับและอัปเดต manifest ก่อน`);
}

const doc = PDFDocument.openDocument(pdfBytes, "application/pdf");
const PAGES = doc.countPages();
if (PAGES !== 45) fail(`จำนวนหน้าไม่ตรงกับ manifest (คาด 45, พบ ${PAGES})`);

// sourceUrl — ต้องมีใน pdf-urls.json (หลักฐานว่าไฟล์มาจากไหน)
let sourceUrl = "";
try {
  const urls = JSON.parse(fs.readFileSync(URLS, "utf8"));
  sourceUrl = urls.find((u) => u.id === "w480")?.url ?? "";
} catch (e) {
  fail(`อ่าน ${URLS} ไม่ได้: ${e.message}`);
}
if (!sourceUrl) fail("ไม่พบ URL ของ w480 ใน docs/reg-2569/extract/pdf-urls.json");

// บรรทัดที่ถูกตัดออกจากตาราง (หัวตาราง/ชื่อเอกสาร/ท้ายหน้า) — เก็บไว้ตรวจว่าไม่มีแถวราคาหลุด
const droppedLines = [];

function pageLines(pn) {
  const j = JSON.parse(doc.loadPage(pn - 1).toStructuredText().asJSON());
  const lines = [];
  for (const block of j.blocks ?? []) {
    for (const line of block.lines ?? []) {
      const raw = line.text ?? "";
      if (!raw.trim()) continue;
      const y = line.y ?? line.bbox.y;
      const x = line.bbox.x;
      const text = norm(raw);
      // หัวตาราง (y≈73–95) / ชื่อเอกสาร (y≈52) / เลขหน้า (y≈23) / ท้ายหน้า source line (y≈822)
      if (y <= 95 || y >= 800) {
        droppedLines.push({ pn, x, y, text, reason: "band" });
        continue;
      }
      if ((line.font?.size ?? 9) >= 12) {
        droppedLines.push({ pn, x, y, text, reason: "bigfont" });
        continue;
      }
      lines.push({ x, y, text });
    }
  }
  lines.sort((a, b) => a.y - b.y || a.x - b.x);
  return lines;
}

function pageRows(pn) {
  const lines = pageLines(pn);
  const rows = [];
  for (const ln of lines) {
    const r = rows[rows.length - 1];
    if (r && ln.y - r.y <= 4) r.cells.push(ln);
    else rows.push({ y: ln.y, cells: [ln] });
  }
  return rows.map((r) => {
    const cells = { no: "", name: "", unit: "", price: "", note: "" };
    for (const c of r.cells) {
      const col = c.x < 68 ? "no" : c.x < 300 ? "name" : c.x < 340 ? "unit" : c.x < 385 ? "price" : "note";
      cells[col] += (cells[col] ? " " : "") + c.text;
    }
    return { ...cells, y: r.y, page: pn };
  });
}

// — ประกอบรายการ —
const entries = [];
const byNo = new Map();
let notices = null;
const notes = []; // ข้อมูลที่ตั้งใจแปลง (ไม่ใช่ความผิดพลาด)
const issues = []; // ต้องมีคนตรวจ

function pushEntry(e) {
  entries.push(e);
  byNo.set(e.no, e);
}

let curEntry = null; // entry ล่าสุด (ต่อเนื่องข้ามหน้า — ตารางไม่ขาดตอน)
let activeVariant = null; // sub-header ล่าสุด (bullet ที่ตามมาเป็น children)

for (let pn = 2; pn <= PAGES; pn++) {
  const rows = pageRows(pn);

  for (const row of rows) {
    const where = `หน้า ${pn} y=${row.y.toFixed(1)}`;

    // — หมายเหตุท้ายบัญชี (หน้า 45) —
    if (row.no.startsWith("หมายเหตุ") && !row.name && !row.price) {
      if (pn !== PAGES) fail(`${where}: พบหัว "หมายเหตุ" ก่อนหน้าสุดท้าย`);
      if (notices) fail(`${where}: พบหัว "หมายเหตุ" ซ้ำ`);
      notices = [];
      let cur = null;
      for (const r2 of rows) {
        if (r2.y <= row.y) continue;
        const text = [r2.no, r2.name, r2.unit, r2.price, r2.note].filter(Boolean).join(" ").trim();
        if (!text) continue;
        const m = /^(\d+)\s*\.\s*(.*)$/.exec(text);
        if (m) {
          cur = { text: m[2].trim() };
          notices.push(cur);
        } else if (cur) {
          cur.text += " " + text;
        } else {
          fail(`หน้า ${pn} y=${r2.y.toFixed(1)}: ข้อความหมายเหตุก่อนข้อ 1: ${JSON.stringify(text)}`);
        }
      }
      curEntry = null;
      activeVariant = null;
      continue;
    }
    if (notices) continue; // หลังโน้ตแล้วไม่มีตาราง

    // — แถวที่มีลำดับที่ = entry —
    if (row.no) {
      // รองรับกรณีเลข+ชื่อรวมบรรทัดเดียว (x<68): "1.2.1.10 เสาเข็ม ขนาด ..."
      let no = row.no;
      let name = row.name;
      const merged = /^(\d+(?:\.\d+)*)\s+(.+)$/.exec(row.no);
      if (merged) {
        no = merged[1];
        if (name) fail(`${where}: เลข+ชื่อรวมบรรทัดเดียวแต่มีช่องรายการแยก: ${JSON.stringify(row.no)} / ${JSON.stringify(name)}`);
        name = merged[2];
      }
      if (!/^\d+(?:\.\d+)*$/.test(no)) fail(`${where}: ลำดับที่ไม่รู้จัก: ${JSON.stringify(row.no)}`);

      // ตัวประกาศพิมพ์ "2.68" (ควรเป็น 2.6.8) — ตรวจจากลำดับก่อนหน้า: ถ้าเลข 2 ช่วง
      // ที่มีหลัก 2 ตัวขึ้นไป = การพิมพ์ต่อกันของ (พ่อแม่ + ลำดับถัดไป) ให้ตีความเป็นระดับ 3
      // (เช่นหลัง 2.6.7 → "2.68" = 2.6.8) ส่วน "1.10" ตามหลัง 1.9.5 เป็นระดับ 2 ปกติ
      let noPrinted;
      let anomaly;
      const segs = no.split(".");
      if (segs.length === 2 && segs[1].length >= 2) {
        const prev = entries[entries.length - 1];
        if (prev && prev.level === 3 && prev.no.split(".")[0] === segs[0]) {
          const p = prev.no.split(".");
          const expectRest = `${p[1]}${Number(p[2]) + 1}`;
          if (segs[1] === expectRest) {
            noPrinted = no;
            no = `${p[0]}.${p[1]}.${Number(p[2]) + 1}`;
            anomaly = `ตัวประกาศพิมพ์ "${noPrinted}" — ตีความเป็น ${no} ตามลำดับรายการ (${prev.no} → ${noPrinted} → ต่อเนื่อง)`;
          }
        }
      }
      if (byNo.has(no)) fail(`${where}: ลำดับซ้ำ: ${no}`);
      if (!name) fail(`${where}: entry ${no} ไม่มีชื่อรายการ`);

      const entry = { no, level: no.split(".").length, name, notes: [], prices: [], variants: [] };
      if (noPrinted) {
        entry.noPrinted = noPrinted;
        entry.anomaly = anomaly;
      }
      pushEntry(entry);
      curEntry = entry;
      activeVariant = null;

      if (row.price) {
        const pr = { price: parsePrice(row.price, where) };
        if (row.unit) pr.unit = row.unit;
        if (row.note) pr.note = row.note;
        entry.prices.push(pr);
      } else if (row.note) {
        entry.notes.push(row.note);
      }
      if (row.unit && !row.price) fail(`${where}: entry ${no} มีหน่วยแต่ไม่มีค่าแรง: ${JSON.stringify(row.unit)}`);
      continue;
    }

    // — แถวไม่มีลำดับที่ —
    if (!curEntry) fail(`${where}: แถวก่อน entry แรก: ${JSON.stringify(row)}`);
    const name = row.name;
    const hasPrice = row.price !== "";

    if (hasPrice) {
      if (name.startsWith("-")) {
        // bullet → variant (children ของ sub-header ถ้ามี)
        const vname = name.replace(/^-\s*/, "").trim();
        if (!vname) fail(`${where}: bullet ไม่มีชื่อ`);
        const pr = { price: parsePrice(row.price, where) };
        if (row.unit) pr.unit = row.unit;
        if (row.note) pr.note = row.note;
        const v = { name: vname, prices: [pr] };
        if (activeVariant) {
          (activeVariant.children ??= []).push(v);
        } else {
          curEntry.variants.push(v);
        }
      } else if (name.startsWith("(")) {
        // ชื่อรายการที่ตัดบรรทัด (cell รวมแนวตั้ง) — วงเล็บต่อจากชื่อ entry เช่น
        // "เสาเข็ม ขนาด ศก. 0.40 x 21.00 ม." + "(เสาเข็ม คอร. รูปกลมกลวง)" → ชื่อ entry ตัวเดียว
        if (curEntry.name.includes(name)) {
          issues.push(`${where}: วงเล็บต่อชื่อซ้ำใน entry ${curEntry.no}: ${JSON.stringify(name)}`);
        } else {
          curEntry.name = `${curEntry.name} ${name}`.trim();
          notes.push(`${where}: ต่อชื่อ entry ${curEntry.no} ด้วย ${JSON.stringify(name)} (บรรทัดต่อของชื่อ)`);
        }
        const pr = { price: parsePrice(row.price, where) };
        if (row.unit) pr.unit = row.unit;
        if (row.note) pr.note = row.note;
        curEntry.prices.push(pr);
      } else {
        // แถวราคาของ entry (มีชื่อ หรือ tier ต่อเนื่อง)
        const pr = { price: parsePrice(row.price, where) };
        if (row.unit) pr.unit = row.unit;
        if (name) pr.name = name;
        if (row.note) pr.note = row.note;
        curEntry.prices.push(pr);
      }
      if (!row.unit) issues.push(`${where}: แถวราคาไม่มีหน่วย (entry ${curEntry.no}): ${JSON.stringify(row.price)}`);
      continue;
    }

    if (name) {
      if (name.startsWith("-")) {
        // bullet เชิงหมายเหตุ (ไม่มีค่าแรง) — เช่น "- ไม่รวมงานพื้นปูนทราย..." → หมายเหตุของ entry
        const noteText = name.replace(/^-\s*/, "").trim();
        if (!noteText) fail(`${where}: bullet ว่าง (entry ${curEntry.no})`);
        curEntry.notes.push(noteText);
        notes.push(`${where}: bullet ไม่มีค่าแรง → เก็บเป็นหมายเหตุของ ${curEntry.no}: ${JSON.stringify(noteText)}`);
        continue;
      }
      if (/^\*/.test(name) || name.startsWith("หมายเหตุ")) {
        // หมายเหตุในช่องรายการ (เช่น "**ตัดหัวเสาเข็ม..." / "หมายเหตุ รวมค่าแรงปูนทรายแล้ว") — ไม่ใช่หัวกลุ่มย่อย
        curEntry.notes.push(name.replace(/^\*+\s*/, ""));
        continue;
      }
      // sub-header ของกลุ่มย่อย (เช่น Exhaust Air Grille / Linear Slot Diffuser W/Plenum)
      const v = { name, prices: [] };
      if (row.note) v.note = row.note;
      curEntry.variants.push(v);
      activeVariant = v;
      continue;
    }

    if (row.note) {
      // แถวหมายเหตุอย่างเดียว
      if (activeVariant && !activeVariant.note) activeVariant.note = row.note;
      else curEntry.notes.push(row.note);
      continue;
    }

    fail(`${where}: แถวจัดประเภทไม่ได้: ${JSON.stringify(row)}`);
  }
}

// — ตรวจความครบถ้วน —
if (entries.length === 0) fail("ไม่พบรายการเลย");
if (!notices || notices.length !== 3) fail(`หมายเหตุท้ายบัญชีต้องมี 3 ข้อ (พบ ${notices ? notices.length : 0})`);

// — post-process: variant ที่ไม่มีราคาเลยทั้ง subtree = ข้อความหมายเหตุ (ไม่ใช่หัวกลุ่มย่อย) —
const hasAnyPrice = (vs) => vs.some((v) => v.prices.length > 0 || hasAnyPrice(v.children ?? []));
for (const e of entries) {
  if (!e.variants || e.variants.length === 0) continue;
  const keep = [];
  for (const v of e.variants) {
    if (!hasAnyPrice([v])) {
      e.notes.push(v.note ? `${v.name} ${v.note}` : v.name);
      notes.push(`entry ${e.no}: variant "${v.name}" ไม่มีราคาเลย → ย้ายเป็นหมายเหตุ`);
    } else {
      keep.push(v);
    }
  }
  if (keep.length > 0) e.variants = keep;
  else delete e.variants;
}

// — ตรวจโครงสร้าง —
const groups = [...new Set(entries.map((e) => e.no.split(".")[0]))].sort();
if (groups.join(",") !== "1,2,3,4,5") fail(`กลุ่มงานต้องเป็น 1–5 (พบ ${groups.join(",")})`);

for (const e of entries) {
  if (e.level < 1 || e.level > 4) fail(`entry ${e.no}: ระดับ ${e.level} ไม่อยู่ใน 1–4`);
  if (e.level > 1) {
    const parent = e.no.split(".").slice(0, -1).join(".");
    if (!byNo.has(parent)) issues.push(`entry ${e.no}: ไม่มี entry พ่อแม่ ${parent} ในสารบัญ (ตรวจเอกสาร)`);
  }
}
for (const e of entries) {
  if (e.prices.length === 0 && (!e.variants || e.variants.length === 0)) {
    // หัวกลุ่ม/หัวข้อที่ไม่มีราคาเองเป็นเรื่องปกติ (ราคาอยู่ในลูก) — ถ้ามีลูกที่มีราคาถือว่าปกติ
    const prefix = `${e.no}.`;
    const hasPricedChild = entries.some((x) => x.no.startsWith(prefix) && (x.prices.length > 0 || (x.variants ?? []).length > 0));
    if (hasPricedChild) notes.push(`entry ${e.no} (${e.name}): หัวกลุ่ม/หัวข้อ ไม่มีราคาเอง (ราคาอยู่ในรายการลูก)`);
    else issues.push(`entry ${e.no} (${e.name}): ไม่มีทั้งแถวราคาและ variant และไม่มีรายการลูก`);
  }
}

// — ตรวจลำดับต่อเนื่องตามพ่อแม่เดียวกัน (จับ "2.68" ที่หลุด heuristic ได้ด้วย) —
const childrenOf = new Map();
for (const e of entries) {
  const parent = e.no.split(".").slice(0, -1).join(".") || "__root__";
  if (!childrenOf.has(parent)) childrenOf.set(parent, []);
  childrenOf.get(parent).push(e);
}
for (const [parent, kids] of childrenOf) {
  for (let i = 1; i < kids.length; i++) {
    const a = Number(kids[i - 1].no.split(".").pop());
    const b = Number(kids[i].no.split(".").pop());
    if (b !== a + 1) {
      issues.push(`ลำดับไม่ต่อเนื่องใต้ ${parent}: ${kids[i - 1].no} → ${kids[i].no}${kids[i].noPrinted ? ` (ตัวพิมพ์ ${kids[i].noPrinted})` : ""}`);
    }
  }
}

// — ตรวจบรรทัดที่ถูกตัด: ต้องไม่มีแถวตารางหลุดขอบ —
for (const d of droppedLines) {
  if (d.reason === "bigfont" && d.y > 95 && d.y < 800) {
    fail(`หน้า ${d.pn} y=${d.y.toFixed(1)}: ข้อความขนาดใหญ่กลางตารางถูกตัด (อาจเป็นแถวที่หาย): ${JSON.stringify(d.text)}`);
  }
  // คอลัมน์ค่าแรง (x≈340–385) ที่เป็นตัวเลขล้วน = แถวราคาที่หลุดออกจากตาราง
  if (d.x >= 300 && d.x < 400 && /^\d[\d,]*$/.test(d.text)) {
    fail(`หน้า ${d.pn} y=${d.y.toFixed(1)}: พบตัวเลขในคอลัมน์ค่าแรงนอกช่วงตาราง (แถวอาจหลุด): ${JSON.stringify(d.text)}`);
  }
}

// — stats —
const byGroup = {};
for (const e of entries) {
  const g = e.no.split(".")[0];
  byGroup[g] = (byGroup[g] ?? 0) + 1;
}
let tierRows = 0;
let bulletRows = 0;
const countBullets = (vs) => {
  for (const v of vs ?? []) {
    if (v.prices.length > 0) bulletRows++;
    countBullets(v.children);
  }
};
for (const e of entries) {
  tierRows += e.prices.length;
  countBullets(e.variants);
}

const notesUnique = [...new Set(notes)];
const issuesUnique = [...new Set(issues)];
if (notesUnique.length) {
  console.log(`ℹ notes ${notesUnique.length} รายการ (การแปลงที่ตั้งใจ):`);
  for (const n of notesUnique) console.log("  - " + n);
}
if (issuesUnique.length) {
  console.log(`⚠ issues ${issuesUnique.length} รายการ (ต้องตรวจ):`);
  for (const i of issuesUnique) console.log("  - " + i);
}

// — ตัวเลขกฎหมายจากหมายเหตุข้อ 1 (ห้าม hardcode) —
// ข้อความจริงมี "เหมารวมร้อยละ 30 - 37 ของยอดค่าวัสดุ" และ "ระหว่างร้อยละ 30 - 37 ..." (กล่าวซ้ำ)
// → ต้องเจออย่างน้อย 1 จุด และทุกจุดต้องเป็นคู่เดียวกัน ไม่งั้นล้มเหลว (กันประกาศเปลี่ยนแล้วเราหยิบผิด)
const laborNotice = notices[0].text;
const laborMatches = [...laborNotice.matchAll(/ร้อยละ\s*(\d+)\s*[-–—]\s*(\d+)/g)];
if (laborMatches.length === 0) {
  fail(`หมายเหตุข้อ 1: หาช่วง "ร้อยละ N - M" ไม่ได้ — ตรวจข้อความต้นฉบับ: ${JSON.stringify(laborNotice.slice(0, 200))}`);
}
const pairs = new Set(laborMatches.map((m) => `${Number(m[1])}-${Number(m[2])}`));
if (pairs.size !== 1) {
  fail(`หมายเหตุข้อ 1: ช่วงร้อยละขัดแย้งกัน (${[...pairs].join(", ")}) — ต้องตรวจต้นฉบับ`);
}
const [laborMin, laborMax] = [...pairs][0].split("-").map(Number);
if (!(laborMin > 0 && laborMax > laborMin && laborMax <= 100)) {
  fail(`หมายเหตุข้อ 1: ช่วงค่าแรงผิดปกติ ${laborMin}–${laborMax}%`);
}
const labor = { minPct: laborMin, maxPct: laborMax };

// — checksums —
const noticeTexts = notices.map((n) => n.text);
const entryChecksums = {};
for (const e of entries) entryChecksums[e.no] = checksum(e);
const schedule = { entries: entries.map(stripUndefined), notices: noticeTexts };
const setChecksum = checksum(schedule);
const rulesetChecksum = checksum({
  factorF: null,
  labor,
  contingencyPct: null,
  swcPct: null,
  durableHandlingPct: null,
  wageSchedule: schedule,
});

function stripUndefined(v) {
  if (Array.isArray(v)) return v.map(stripUndefined);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, val] of Object.entries(v)) if (val !== undefined) o[k] = stripUndefined(val);
    return o;
  }
  return v;
}

const cleanEntries = entries.map(stripUndefined);

console.log(`pages=${PAGES} entries=${cleanEntries.length} byGroup=${JSON.stringify(byGroup)} tierRows=${tierRows} bulletRows=${bulletRows}`);
console.log(`labor=${laborMin}-${laborMax}% notices=${noticeTexts.length} setChecksum=${setChecksum} rulesetChecksum=${rulesetChecksum} pdfSha=${pdfSha}`);

if (STRICT && issuesUnique.length > 0) {
  fail(`--strict: พบ issues ${issuesUnique.length} รายการ — ต้องแก้/ยืนยันก่อน generate`);
}
if (DRY) {
  console.log("— dry run: ไม่เขียนไฟล์ —");
  process.exit(0);
}

// — สร้างไฟล์ TS —
const entriesJson = JSON.stringify(cleanEntries, null, 2)
  .split("\n")
  .map((l) => "  " + l)
  .join("\n");

const file = `// ⚠️ ไฟล์นี้ GENERATED อัตโนมัติ — ห้ามแก้มือ
// generator: node scripts/parse-w480.mjs (mupdf geometry จาก docs/reg-2569/w480.pdf)
// เอกสาร: บัญชีค่าแรงงาน/ดำเนินการสำหรับถอดแบบคำนวณราคากลางงานก่อสร้าง
//         หนังสือกรมบัญชีกลาง ด่วนที่สุด ที่ ${"กค 0433.2/ว 480"} ลงวันที่ 26 มิถุนายน 2569 (45 หน้า)
//         ทางการ: ต้นฉบับราชกิจจานุเบกษา — ไฟล์ที่ใช้สกัดเป็นสำเนา Yotathai mirror (ดู docs/reg-2569/manifest.md)
//         provenance: mirror-unverified · ยังไม่ยืนยันกับราชกิจจานุเบกษา
//
// ⚠️ กฎเหล็ก: ก่อนใช้คำนวณเพื่อเอกสารส่งราชการจริง ต้องยืนยันตัวเลขกับต้นฉบับทางการก่อน
//    (sha256 ของไฟล์ที่สกัด: ${pdfSha})
//
// สถิติ: รายการ ${cleanEntries.length} · แถวราคา ${tierRows} · bullet ${bulletRows} · หมายเหตุ ${noticeTexts.length} ข้อ
// กลุ่มงาน: 1 งานโครงสร้างวิศวกรรม · 2 งานสถาปัตยกรรม · 3 ระบบสุขาภิบาลและดับเพลิง · 4 ระบบไฟฟ้าและสื่อสาร · 5 ระบบปรับอากาศและระบายอากาศ
// ค่าแรงเหมารวม (หมายเหตุข้อ 1 ของบัญชี): ${laborMin}–${laborMax}% ของยอดค่าวัสดุ → ruleset.labor
// คุณภาพการถอด: notes ${notesUnique.length} (ตั้งใจแปลง) · issues ${issuesUnique.length} (ต้องตรวจ — 0 = ผ่าน)
//
// checksum: FNV-1a 2×32 (hex 16) บน stableStringify — ตรงกับ computeChecksum ใน lib/ruleset.ts
import { computeChecksum, rulesetChecksum } from "./ruleset";
import type { Ruleset, WageEntry, WageSchedule } from "./ruleset";

export const W480_2569_NUMBERING: string = "กค 0433.2/ว 480 ลงวันที่ 26 มิถุนายน 2569";
export const W480_2569_PDF_SHA256: string = ${JSON.stringify(pdfSha)};
export const W480_2569_SOURCE_URL: string = ${JSON.stringify(sourceUrl)};

export const W480_2569_NOTICES: string[] = ${JSON.stringify(noticeTexts, null, 2)
  .split("\n")
  .map((l) => "  " + l)
  .join("\n")};

export const W480_2569_ENTRIES: WageEntry[] = ${entriesJson};

export const W480_2569_ENTRY_CHECKSUMS: Record<string, string> = ${JSON.stringify(entryChecksums, null, 2)
  .split("\n")
  .map((l) => "  " + l)
  .join("\n")};

export const W480_2569_SET_CHECKSUM: string = ${JSON.stringify(setChecksum)};
export const W480_2569_RULESET_CHECKSUM: string = ${JSON.stringify(rulesetChecksum)};
export const W480_2569_LABOR = { minPct: ${laborMin}, maxPct: ${laborMax} } as const;
export const W480_2569_QUALITY = { notes: ${notesUnique.length}, issues: ${issuesUnique.length} } as const;
export const W480_2569_STATS = {
  entries: ${cleanEntries.length},
  byGroup: ${JSON.stringify(byGroup)},
  tierRows: ${tierRows},
  bulletRows: ${bulletRows},
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

export const W480_2569_SCHEDULE: WageSchedule = freezeDeep({
  entries: W480_2569_ENTRIES,
  notices: W480_2569_NOTICES,
});

// Ruleset ของบัญชีค่าแรงงาน — labor ${laborMin}–${laborMax}% จากหมายเหตุข้อ 1 ของบัญชี (ไม่ใช่ค่า default)
export function getW480Ruleset(): Ruleset {
  return {
    id: "reg2569-wage-w480",
    name: "บัญชีค่าแรงงาน/ดำเนินการสำหรับถอดแบบคำนวณราคากลางงานก่อสร้าง (หลักเกณฑ์ราคากลางงานก่อสร้าง พ.ศ. 2569)",
    sourceDoc: "หนังสือกรมบัญชีกลาง ด่วนที่สุด ที่ " + W480_2569_NUMBERING,
    sourceUrl: W480_2569_SOURCE_URL,
    effectiveFrom: "2026-06-26", // วันที่ลงหนังสือ — ยังไม่ยืนยันวันมีผลบังคับใช้ (ดู docs/reg-2569/README.md)
    checksum: W480_2569_RULESET_CHECKSUM,
    wageSchedule: W480_2569_SCHEDULE,
    wageScheduleChecksum: W480_2569_SET_CHECKSUM,
    labor: W480_2569_LABOR,
    notices: W480_2569_SCHEDULE.notices,
    provenance: {
      sourceKind: "mirror-unverified",
      verifiedAgainstGazette: false,
      retrievedFrom: W480_2569_SOURCE_URL,
    },
    createdAt: "2026-11-13T00:00:00.000Z",
  };
}

// ตรวจ checksum รายรายการ + ชุดรวม + ruleset — คืนรายการที่เพี้ยน (อาร์เรย์ว่าง = ผ่าน)
export async function verifyW480Checksums(): Promise<string[]> {
  const bad: string[] = [];
  for (const e of W480_2569_ENTRIES) {
    const expect = W480_2569_ENTRY_CHECKSUMS[e.no];
    if (expect === undefined) bad.push(e.no + " (ไม่มี checksum อ้างถึง)");
    else if ((await computeChecksum(e)) !== expect) bad.push(e.no + " (checksum เพี้ยน)");
  }
  for (const key of Object.keys(W480_2569_ENTRY_CHECKSUMS)) {
    if (!W480_2569_ENTRIES.some((e) => e.no === key)) bad.push(key + " (checksum ของรายการที่ไม่มีอยู่)");
  }
  if ((await computeChecksum(W480_2569_SCHEDULE)) !== W480_2569_SET_CHECKSUM) bad.push("__SET__");
  // rulesetChecksum ใช้ canonical subset (labor/wageSchedule/...) — ตรวจว่า labor/notices ระดับ ruleset ไม่ถูกแก้
  if ((await rulesetChecksum(getW480Ruleset())) !== W480_2569_RULESET_CHECKSUM) bad.push("__RULESET__");
  return bad;
}
`;

fs.writeFileSync(OUT, file, "utf8");
console.log(`wrote ${OUT} (${file.split("\n").length} lines)`);
