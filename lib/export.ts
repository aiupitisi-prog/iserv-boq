// ส่งออก BOQ เป็น xlsx / CSV (F3.4)
//
// เกณฑ์ตรวจรับ: xlsx เปิดใน Excel ไทยแล้วภาษาไทยไม่เพี้ยน (SheetJS เขียน UTF-8 XML ตามสเปก OOXML)
// CSV ต้องมี UTF-8 BOM ไม่งั้น Excel ไทยอ่านเป็น ??????? — ห้ามลืม
//
// ตัวเงินในไฟล์ = ตัวเลขบาท (2 ตำแหน่ง) เพื่อให้ผู้ใช้ตรวจ/คำนวณต่อใน Excel ได้
// การคำนวณในระบบยังเป็นสตางค์ integer ทั้งหมด (lib/calc) — ไฟล์นี้เป็นเอาต์พุตแสดงผลเท่านั้น

import * as XLSX from "xlsx";
import type { BoqItem, BoqProject } from "./boq";
import { itemTotal, proposalSummary, sectionTotals } from "./boq";
import type { Ruleset } from "./ruleset";
import { computeGovBOQ } from "./calc/compute";
import { satangToBaht } from "./calc/money";

const THAI_MONTHS = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// ---------- คำอธิบายที่มาราคา (PriceEvidence — F1.6) ----------

export function sourceLabel(it: BoqItem): string {
  const s = it.source;
  if (!s) return "ป้อนเอง / ไม่ระบุ";
  if (s.kind === "tpso") {
    return `ราคา สนค. ${s.provName} ปี ${s.year}${s.month ? " เดือน " + THAI_MONTHS[s.month] : ""} (รหัส ${s.code})`;
  }
  return `คลังราคาของฉัน (${s.category})${s.note ? " — " + s.note : ""}`;
}

function sourcePickedAt(it: BoqItem): string {
  const s = it.source;
  if (!s) return "";
  const d = new Date(s.pickedAt);
  return isNaN(d.getTime()) ? s.pickedAt : d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

function partLabel(it: BoqItem): string {
  return it.part === "equipment" ? "ครุภัณฑ์" : "งานก่อสร้าง";
}

// ---------- CSV ----------

// escape ตาม RFC 4180 — ช่องที่มี , " หรือขึ้นบรรทัดใหม่ ต้องครอบด้วย " และเพิ่ม " เป็นซ้อน
function csvField(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}

const CSV_HEADERS = [
  "ลำดับ",
  "หมวดงาน",
  "รายการ",
  "หน่วย",
  "ปริมาณ",
  "ราคาต่อหน่วย (บาท)",
  "วัสดุ/หน่วย (บาท)",
  "แรงงาน/หน่วย (บาท)",
  "ส่วน",
  "รวมเงิน (บาท)",
  "ที่มาราคา",
  "ราคา ณ ตอนเลือก (บาท)",
  "วันที่เลือกราคา",
  "หมายเหตุ",
];

// ตารางแบบแถวเรียบ (flat) — เหมาะกับ CSV เพื่อนำไปประมวลผลต่อ
export function toCsvRows(project: BoqProject): (string | number)[][] {
  const rows: (string | number)[][] = [CSV_HEADERS];
  let no = 0;
  for (const it of project.items) {
    no++;
    rows.push([
      no,
      it.section,
      it.name,
      it.unit,
      it.qty,
      num2(it.price),
      it.matPrice !== undefined ? num2(it.matPrice) : "",
      it.laborPrice !== undefined ? num2(it.laborPrice) : "",
      partLabel(it),
      num2(itemTotal(it)),
      sourceLabel(it),
      it.source ? num2(it.source.priceAtPick) : "",
      sourcePickedAt(it),
      it.note ?? "",
    ]);
  }
  return rows;
}

function num2(n: number): number {
  return Math.round(n * 100) / 100;
}

// UTF-8 BOM + CRLF (Excel ไทยอ่านถูกต้อง)
export function toCsv(project: BoqProject): string {
  const lines = toCsvRows(project).map((r) => r.map(csvField).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

// ---------- xlsx (SheetJS) ----------

const MONEY_FMT = "#,##0.00";
const QTY_FMT = "#,##0.####";

function fmtCells(ws: XLSX.WorkSheet, colLetter: string, startRow: number, fmt: string): void {
  for (let r = startRow; ; r++) {
    const addr = `${colLetter}${r}`;
    const cell = ws[addr];
    if (!cell) break;
    if (typeof cell.v === "number") cell.z = fmt;
  }
}

function buildBoqSheet(project: BoqProject): XLSX.WorkSheet {
  const aoa: (string | number)[][] = [
    [project.name],
    [project.address || ""],
    [`แบบฟอร์ม ${project.boqType} · ${partSummary(project)}`],
    [],
    ["ลำดับ", "รายการงาน", "หน่วย", "ปริมาณ", "ราคาต่อหน่วย (บาท)", "วัสดุ/หน่วย (บาท)", "แรงงาน/หน่วย (บาท)", "รวมเงิน (บาท)", "ส่วน", "ที่มาราคา", "หมายเหตุ"],
  ];
  const sections = [...new Set(project.items.map((it) => it.section))];
  for (const sec of sections) {
    const items = project.items.filter((it) => it.section === sec);
    aoa.push([`หมวด: ${sec}`]);
    let no = 0;
    for (const it of items) {
      no++;
      aoa.push([
        no,
        it.name,
        it.unit,
        it.qty,
        num2(it.price),
        it.matPrice !== undefined ? num2(it.matPrice) : "",
        it.laborPrice !== undefined ? num2(it.laborPrice) : "",
        num2(itemTotal(it)),
        partLabel(it),
        sourceLabel(it),
        it.note ?? "",
      ]);
    }
    const secTotal = items.reduce((a, it) => a + itemTotal(it), 0);
    aoa.push([`รวมหมวด ${sec}`, "", "", "", "", "", "", num2(secTotal)]);
    aoa.push([]);
  }
  aoa.push(["รวมทั้งสิ้น", "", "", "", "", "", "", num2(projectTotalBaht(project))]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 6 }, { wch: 44 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 40 }, { wch: 24 },
  ];
  fmtCells(ws, "D", 6, QTY_FMT);
  fmtCells(ws, "E", 6, MONEY_FMT);
  fmtCells(ws, "F", 6, MONEY_FMT);
  fmtCells(ws, "G", 6, MONEY_FMT);
  fmtCells(ws, "H", 6, MONEY_FMT);
  return ws;
}

function partSummary(project: BoqProject): string {
  const nEquip = project.items.filter((it) => it.part === "equipment").length;
  return nEquip > 0 ? `งานก่อสร้าง ${project.items.length - nEquip} รายการ + ครุภัณฑ์ ${nEquip} รายการ` : `${project.items.length} รายการ`;
}

function projectTotalBaht(project: BoqProject): number {
  return num2(project.items.reduce((a, it) => a + itemTotal(it), 0));
}

function buildSectionSummarySheet(project: BoqProject): XLSX.WorkSheet {
  const aoa: (string | number)[][] = [["หมวดงาน", "รวมเงิน (บาท)"]];
  for (const s of sectionTotals(project)) aoa.push([s.section, num2(s.total)]);
  aoa.push(["รวมทั้งสิ้น", projectTotalBaht(project)]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 36 }, { wch: 18 }];
  fmtCells(ws, "B", 2, MONEY_FMT);
  return ws;
}

// สรุปราคากลาง (gov — จากเครื่องยนต์ lib/calc พร้อม trace) หรือสรุปราคาเสนอ (private — ติดป้ายชัด)
function buildSummarySheet(project: BoqProject, ruleset: Ruleset | null | undefined): { sheet: XLSX.WorkSheet; mode: "gov" | "private" | "none" } {
  const mode = project.mode ?? "gov";
  if (mode === "private") {
    const p = proposalSummary(project.items, project.factors);
    const aoa: (string | number)[][] = [
      ["สรุปราคาเสนอ (โหมดเอกชน)"],
      ["ประมาณการ — ไม่ใช่ราคากลางตามหลักเกณฑ์การคำนวณราคากลาง"],
      [],
      ["รายการ", "สูตร", "จำนวนเงิน (บาท)"],
      ["ต้นทุนรวม (วัสดุ + แรงงาน)", "", num2(p.base)],
    ];
    for (const l of p.lines) aoa.push([l.label, l.formula, num2(l.amount)]);
    aoa.push(["ราคาเสนอรวม (รวม VAT)", "", num2(p.proposalTotal)]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 34 }, { wch: 34 }, { wch: 18 }];
    fmtCells(ws, "C", 5, MONEY_FMT);
    return { sheet: ws, mode: "private" };
  }

  const aoa: (string | number)[][] = [
    ["สรุปการคำนวณราคากลาง (โหมดราชการ)"],
    [ruleset ? `ชุดกฎ: ${ruleset.name} · ที่มา: ${ruleset.sourceDoc} · มีผล ${ruleset.effectiveFrom}` : "ยังไม่ได้ pin ชุดกฎราคากลาง"],
    [],
    ["ขั้นตอน", "สูตร", "จำนวนเงิน (บาท)", "หมายเหตุ"],
  ];
  let ok = true;
  try {
    const r = computeGovBOQ(project, ruleset);
    for (const s of r.steps) aoa.push([s.label, s.formula ?? "", num2(satangToBaht(s.satang)), (s.notes ?? []).join(" | ")]);
    aoa.push([]);
    for (const w of r.warnings) aoa.push(["คำเตือน: " + w]);
  } catch (e) {
    ok = false;
    aoa.push([`คำนวณไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 52 }, { wch: 40 }, { wch: 18 }, { wch: 60 }];
  if (ok) fmtCells(ws, "C", 5, MONEY_FMT);
  return { sheet: ws, mode: "gov" };
}

// Uint8Array ของไฟล์ xlsx — ผู้เรียกเอาไปทำ Blob เอง (เขียนทดสอบใน node ได้)
export function toXlsxArray(project: BoqProject, ruleset: Ruleset | null | undefined): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildBoqSheet(project), "BOQ");
  XLSX.utils.book_append_sheet(wb, buildSectionSummarySheet(project), "สรุปหมวดงาน");
  const { sheet } = buildSummarySheet(project, ruleset);
  XLSX.utils.book_append_sheet(wb, sheet, (project.mode ?? "gov") === "private" ? "สรุปราคาเสนอ" : "สรุปราคากลาง");
  // SheetJS 0.18 คืน ArrayBuffer — normalize เป็น Uint8Array ให้เสถียรทั้ง node/browser
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as unknown;
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
}

// ---------- ดาวน์โหลด (browser เท่านั้น) ----------

export function safeFilename(project: BoqProject, ext: string): string {
  const name = project.name.replaceAll(/[\\/:*?"<>|]/g, "-").trim().slice(0, 60) || "BOQ";
  return `BOQ-${name}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

export function downloadBlob(data: BlobPart | Uint8Array, mime: string, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const EXPORT_MIME = {
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;
