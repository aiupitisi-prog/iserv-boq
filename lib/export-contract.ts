// ส่งออก "แบบแสดงรายการ ปริมาณงาน และราคา (แนบท้ายสัญญา)" เป็นไฟล์ xlsx
//
// เอกสารนี้จัดทำโดยเจ้าหน้าที่พัสดุ หลังทราบราคาตามคำเสนอของผู้ได้รับคัดเลือก —
// ไม่ใช่ราคากลาง และไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง
//
// หลักการ:
// - ใช้ computePriceReduction() (สตางค์ integer) เป็นแหล่งตัวเลขเดียวกับหน้าพิมพ์
// - ห้ามคำนวณราคาในไฟล์นี้เอง — ทุกยอดต้องมาจาก reduce.lines / reduce.winningSat
// - เซลล์เงินเป็น number (บาท 2 ตำแหน่ง) เพื่อให้ตรวจใน Excel ได้; ระบบคำนวณจริงเป็นสตางค์
// - ราคาต่อหน่วยเป็นค่าที่แสดงผลเท่านั้น (reducedSat ÷ qty) — จำนวนเงินรวมรายการคือค่าที่ใช้จริง
// - ทุกชีตมี disclaimer "ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง" — ห้ามลบ
// - โหมดเอกชน = ปฏิเสธ (แนบท้ายสัญญาเป็นของงานราชการ)

import { bahtText } from "./bahttext";
import type { BoqProject, Committee } from "./boq";
import { rulesetBeYear, rulesetStatus, type Ruleset } from "./ruleset";
import type { CalcResult } from "./calc/compute";
import { computePriceReduction, type PriceReductionBase } from "./calc/reduce";
import {
  MONEY_FMT,
  QTY_FMT,
  fmtCells,
  loadXlsx,
  type XlsxModule,
} from "./export";

export const CONTRACT_DISCLAIMER =
  "จัดทำด้วยระบบ iserv BOQ — ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง · เอกสารแนบท้ายสัญญา (ราคาตามสัญญา) ไม่ใช่ราคากลาง";

export type ContractExportOptions = {
  committee?: Committee; // ไม่ระบุ = ใช้ project.committee
  procurementOfficer?: string; // ไม่ระบุ = ใช้ project.award.procurementOfficer
  // ฐานราคากลางส่วนรายการจากชุด 9 ชิ้น (Reg2569Report.contractBase) — บังคับ:
  // ต้องตรงกับ ปร.4 (รวม VAT/ค่าติดตั้งครุภัณฑ์) ห้ามคำนวณฐานเองในไฟล์นี้
  base: PriceReductionBase;
  ruleset?: Ruleset | null; // ชุดกฎที่ pin — ใช้พิมพ์ที่มา/ปี พ.ศ./เตือนชุดถูกแทนที่
};

type Row = (string | number)[];

function money(s: number | null | undefined): number | "" {
  if (s === null || s === undefined || !Number.isFinite(s)) return "";
  return Number((Math.round(s) / 100).toFixed(2));
}

function unitBaht(s: number, qty: number): number | "" {
  if (!Number.isFinite(s) || !Number.isFinite(qty) || qty <= 0) return "";
  return Number((s / 100 / qty).toFixed(2));
}

function qty(n: number | null | undefined): number | "" {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return Number(n.toFixed(4));
}

function bahtStr(s: number): string {
  return (Math.round(s) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// หัวเอกสาร (สอดคล้องกับหน้าพิมพ์ contract-client):
// งานก่อสร้าง / สถานที่ + จังหวัด / หน่วยงาน / สัญญาเลขที่-ลงวันที่ / ผู้รับจ้าง / เจ้าหน้าที่พัสดุ
function headRows(
  project: BoqProject,
  committee: Committee | undefined,
  officer: string,
): Row[] {
  const award = project.award;
  return [
    ["งานก่อสร้าง", project.name || "………………………………………………", "", "", "หน่วย : บาท"],
    ["สถานที่ก่อสร้าง", project.address || "……………………………", "", "", `จังหวัด ${committee?.province || "……………………"}`],
    [`หน่วยงานเจ้าของโครงการงานก่อสร้าง ${committee?.agency || "………………………………………………"}`],
    [`สัญญาเลขที่ / ลงวันที่ ${award?.contractNoteDate?.trim() || "………………………………………………"}`],
    [`ผู้รับจ้าง ${award?.contractor?.trim() || "………………………………………………"}`],
    [`จัดทำโดยเจ้าหน้าที่พัสดุ ${officer || "………………………………………………"}`],
    [],
  ];
}

function signatureRows(officer: string, contractorSigner: string, contractor: string): Row[] {
  return [
    [],
    [
      "ลงชื่อ ……………………………………… เจ้าหน้าที่พัสดุ",
      "",
      "ลงชื่อ ……………………………………… ผู้รับจ้าง",
      "",
      "ลงชื่อ ……………………………………… พยาน",
    ],
    [
      `( ${officer || "……………………………………………"} )`,
      "",
      `( ${contractorSigner || "……………………………………………"} )`,
      "",
      "( …………………………………………… )",
    ],
    [
      "เจ้าหน้าที่พัสดุผู้จัดทำแนบท้ายสัญญา",
      "",
      contractor || "ผู้รับจ้าง",
      "",
      "พยาน",
    ],
  ];
}

// ————— ประกอบชีตแนบท้ายสัญญา —————
function buildContractSheet(
  XL: XlsxModule,
  project: BoqProject,
  calc: CalcResult,
  winningPrice: number,
  committee: Committee | undefined,
  officer: string,
  base: PriceReductionBase,
  ruleset: Ruleset | null | undefined,
): any {
  const reduce = computePriceReduction(project, calc, winningPrice, base);
  if (!reduce.ok) {
    throw new Error(`จัดทำแนบท้ายสัญญาไม่ได้: ${reduce.error ?? "ข้อมูลราคาไม่ครบถ้วน"}`);
  }

  const award = project.award;
  const rsYear = rulesetBeYear(ruleset);
  const aoa: Row[] = [
    ["แบบแสดงรายการ ปริมาณงาน และราคา (แนบท้ายสัญญา)"],
    ["จัดทำโดยเจ้าหน้าที่พัสดุ — เอกสารแนบท้ายสัญญา ไม่ใช่ราคากลาง"],
    ...headRows(project, committee, officer),
  ];
  // F1 — เอกสารที่มีตัวเลขจากชุดกฎต้องระบุชุดกฎ/วันที่มีผล และเตือนเมื่อชุดถูกแทนที่
  if (ruleset) {
    aoa.push([
      `ชุดกฎราคากลาง: ${ruleset.name} (id ${ruleset.id}) · มีผลตั้งแต่ ${ruleset.effectiveFrom}${rsYear ? ` (พ.ศ. ${rsYear})` : ""}`,
    ]);
    if (rulesetStatus(ruleset) === "superseded") {
      aoa.push([
        `⚠ ชุดกฎนี้ถูกแทนที่แล้ว (supersededBy ${ruleset.supersededBy}) — อัตราอาจไม่ตรงประกาศฉบับล่าสุด; ตรวจก่อนใช้ยื่นหน่วยงาน`,
      ]);
    }
  } else {
    aoa.push(["ชุดกฎราคากลาง: ไม่ได้ pin ชุดกฎ — ตัวเลขอัตราอาจไม่ครบ (unverified)"]);
  }
  aoa.push([]);
  aoa.push(["สรุปการปรับลดราคา"]);
  aoa.push(["รายการ", "จำนวนเงิน (บาท)"]);
  aoa.push(["ราคากลางส่วนรายการ BOQ", money(reduce.reducibleBaseSat)]);
  for (const f of reduce.fixedLines) aoa.push([f.label, money(f.satang)]);
  aoa.push(["ราคาตามคำเสนอของผู้ได้รับคัดเลือก (วงเงินตามสัญญา)", money(reduce.winningSat)]);
  aoa.push([
    "อัตราปรับลดจากราคากลางส่วนรายการ",
    reduce.reducePct !== null ? `${reduce.reducePct.toFixed(4)}%` : "—",
  ]);
  aoa.push([]);
  aoa.push([
    "ลำดับที่", "รายการ", "จำนวน", "หน่วย",
    "ราคากลาง/หน่วย (บาท)", "ราคาตามสัญญา/หน่วย (บาท)", "จำนวนเงินตามสัญญา (บาท)", "หมายเหตุ",
  ]);

  let lastSection = "";
  let no = 0;
  for (const line of reduce.lines) {
    if (line.section !== lastSection) {
      aoa.push([`หมวดงาน: ${line.section || "—"}`]);
      lastSection = line.section;
    }
    no++;
    aoa.push([
      no,
      line.name,
      qty(line.qty),
      line.unit,
      unitBaht(line.medianSat, line.qty),
      unitBaht(line.reducedSat, line.qty),
      money(line.reducedSat),
      line.part === "equipment" ? "ครุภัณฑ์ (ราคากลาง/หน่วยรวม VAT + ค่าติดตั้งตาม ปร.2)" : "",
    ]);
  }

  aoa.push([
    "", "รวมรายการ BOQ ตามสัญญา", "", "", "", "", money(reduce.winItemsSat), "",
  ]);
  for (const f of reduce.fixedLines) {
    aoa.push(["", f.label, "", "", "", "", money(f.satang), ""]);
  }
  aoa.push(["", "รวมวงเงินตามสัญญา", "", "", "", "", money(reduce.winningSat), ""]);
  aoa.push(["", `( ${bahtText(reduce.winningSat)} )`, "", "", "", "", "", ""]);
  aoa.push([]);
  aoa.push([
    "หมายเหตุ: ราคาต่อหน่วยแสดงเพื่อตรวจเทียบ — จำนวนเงินรวมรายการคือค่าที่ใช้จริง และผลรวมทุกบรรทัดเท่ากับวงเงินตามสัญญา",
  ]);
  if (reduce.fixedLines.length > 0) {
    aoa.push([
      `ส่วนคงเดิม (${reduce.fixedLines.map((f) => f.label).join(" · ")}) ไม่เข้าการปรับลดราคารายการ — unverified: ตรวจแนวทางที่มีผลบังคับก่อนใช้`,
    ]);
  }
  aoa.push([
    `ฐานราคากลางส่วนรายการ = ค่าก่อสร้าง (ค่างานต้นทุน × Factor F) + ค่าครุภัณฑ์จัดซื้อ (รวม VAT และค่าติดตั้งตาม ปร.2) = ${bahtStr(
      reduce.reducibleBaseSat,
    )} บาท — ตรงกับแบบ ปร.4`,
  ]);
  if (reduce.warnings.length > 0) {
    aoa.push([], ["คำเตือน (unverified):"]);
    for (const w of reduce.warnings) aoa.push([`- ${w}`]);
  }
  aoa.push([], ["หมายเหตุ: เอกสารนี้เป็นแนบท้ายสัญญาตามราคาที่ผู้ได้รับคัดเลือกเสนอ — ไม่ใช่ราคากลางและไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง"]);
  if (award?.savedAt) aoa.push([`บันทึกข้อมูลสัญญาเมื่อ ${new Date(award.savedAt).toLocaleString("th-TH")}`]);
  aoa.push(...signatureRows(officer, award?.contractorSigner?.trim() || "", award?.contractor?.trim() || ""));
  aoa.push([], [CONTRACT_DISCLAIMER]);

  const ws = XL.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 8 }, { wch: 46 }, { wch: 12 }, { wch: 10 },
    { wch: 18 }, { wch: 20 }, { wch: 22 }, { wch: 18 },
  ];
  fmtCells(XL, ws, "B", 1, MONEY_FMT);
  fmtCells(XL, ws, "C", 1, QTY_FMT);
  for (const col of ["E", "F", "G"]) fmtCells(XL, ws, col, 1, MONEY_FMT);
  return ws;
}

export async function toContractWorkbookArray(
  project: BoqProject,
  calc: CalcResult,
  winningPrice: number,
  opts: ContractExportOptions,
): Promise<Uint8Array> {
  if ((project.mode ?? "gov") === "private") {
    throw new Error(
      "แนบท้ายสัญญาใช้กับโหมดราชการเท่านั้น — โปรเจกต์นี้เป็นโหมดเอกชน (ใบเสนอราคา) ซึ่งไม่มีสัญญาตามหลักเกณฑ์ราคากลาง",
    );
  }
  // runtime guard: ผู้เรียก JS อาจไม่ส่ง base (TypeScript กันได้เฉพาะ compile) — ห้ามถอยกลับไปใช้ฐาน engine เดิม
  if (!opts.base) {
    throw new Error(
      "ต้องส่งฐานราคากลางจากชุด 9 ชิ้น (Reg2569Report.contractBase) — ห้ามคำนวณฐานเองในเอกสารสัญญา",
    );
  }
  const XL = await loadXlsx();
  const committee = opts.committee ?? project.committee;
  const officer = (opts.procurementOfficer ?? project.award?.procurementOfficer ?? "").trim();

  const wb = XL.utils.book_new();
  const ws = buildContractSheet(XL, project, calc, winningPrice, committee, officer, opts.base, opts.ruleset);
  XL.utils.book_append_sheet(wb, ws, "แนบท้ายสัญญา");

  const out = XL.write(wb, { bookType: "xlsx", type: "array" }) as unknown;
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
}

// ชื่อไฟล์ดาวน์โหลด — ภาษาไทยได้ แต่ตัดอักขระต้องห้ามของ Windows
export function contractFilename(project: BoqProject, now: Date = new Date()): string {
  const name = project.name.replaceAll(/[\\/:*?"<>|]/g, "-").trim().slice(0, 60) || "BOQ";
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `BOQ-${name}-แนบท้ายสัญญา-${d}.xlsx`;
}
