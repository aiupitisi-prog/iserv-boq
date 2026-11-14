// ตัวสร้างข้อมูล "รายงานการคำนวณราคากลางงานก่อสร้างอาคาร 9 ชิ้น" ตามข้อ 11 เล่ม 2
// (หลักเกณฑ์การคำนวณราคากลางงานก่อสร้าง พ.ศ. 2569 — วันบังคับใช้ดูที่ Ruleset.effectiveFrom
//  และหลักฐานการยืนยันใน docs/reg-2569/README.md — ห้าม hardcode วันที่ไว้ที่นี่)
//
// 9 ชิ้นตามข้อ 11: (1) แบบ ปร.1(ก) (2) แบบ ปร.1 ต่องาน/กลุ่มงาน (3) แบบ ปร.2(ก) (4) แบบ ปร.2
// (5) แบบ ปร.3 (ถ้ามี) (6) แบบแสดงการคำนวณและเหตุผลความจำเป็นสำหรับค่าใช้จ่ายพิเศษ (7) แบบ ปร.4
// (8) รายละเอียดการหาค่า Factor F (9) แบบบันทึกแสดงเหตุผลและความจำเป็นการสืบราคาวัสดุก่อสร้าง
//
// หลักการ (ข้อ 1–12 เล่ม 2 + skill thai-govt-base-price-rules):
// - ตัวเงินเป็นสตางค์ integer ทุกขั้น — ตัวเลขทั้งหมดมาจากเครื่องยนต์ lib/calc (CalcResult) เท่านั้น
// - Factor F คิดระดับโครงการ (A = ต้นทุนโดยตรงทั้งโครงการ ตามข้อ 5–6) แล้วคูณลงต่องาน/กลุ่มงาน (ข้อ 7) —
//   ถ้าผลรวมรายกลุ่ม (ปัดทีละกลุ่ม) ต่างจากยอดเครื่องยนต์ ให้ขึ้นบรรทัด "ปรับปัดเศษ" พร้อมหมายเหตุ
// - ค่าก่อสร้างรวมของชุดนี้ = calc.afterFactor (ยอดที่เครื่องยนต์ปัดแล้ว)
// - ราคากลางชุดนี้ (ข้อ 10) = ค่าก่อสร้าง + ค่าครุภัณฑ์จัดซื้อ (รวม VAT + ค่าติดตั้งที่สืบราคา)
//   + ค่าใช้จ่ายพิเศษตามข้อกำหนด — ไม่รวมเงินเผื่อจำเป็น/ค่าดำเนินงานของโครงเดิม (calc.contingency/swc)
//   ถ้า calc.total ต่างจากยอดชุดนี้ → แจ้งเตือนเทียบเคียงใน warnings
// - ค่าติดตั้งครุภัณฑ์มาจาก "การสืบราคา" รายรายการ (BoqItem.installPrice) — ห้ามใช้
//   ruleset.durableHandlingPct (% ค่าดำเนินงานครุภัณฑ์ของโครงเดิม) เป็นค่าติดตั้ง (เล่ม 2 ข้อ 2.2/ข้อ 8)
// - VAT ครุภัณฑ์: อัตราจากตาราง Factor F ที่เลือก (FactorFTable.vatPct) — ไม่มีตาราง = ป้าย unverified
// - ข้อสมมติที่ยืนยันจากเอกสารไม่ได้ → ป้าย "unverified" ใน warnings เสมอ

import type { BoqItem, BoqProject } from "./boq";
import type { FactorFTable, Ruleset } from "./ruleset";
import { selectFactorFTable, rulesetStatus } from "./ruleset";
import { lookupFactorF } from "./calc/factorf";
import { splitItem, type CalcResult } from "./calc/compute";
import { formatSatang, mulQty, pctOf, sumSatang, toSatang, type Satang } from "./calc/money";

// กฎปฏิทินราคาส่วนกลาง สนค. (TPSO type 10) — ตรวจกับระบบ สนค. จริง ณ 13 พ.ย. 2569 (scripts/tpso-central-months-check.mjs):
// สนค. เผยแพร่ราคาส่วนกลางเป็นรายเดือนหลังสำรวจจบ — ระบบมีราคาครบ 2566–2569 ถึงเดือนก่อนเดือนพิมพ์ (ต.ค. 2569)
// เดือนอ้างอิงที่เท่ากับหรือหลังเดือนที่พิมพ์ ยังไม่ปรากฏราคาในระบบ → unverified (ต้องใช้ราคารายจังหวัด/สืบราคาแทน)
// (ข้อความเดิม "สนค. ยกเลิกเผยแพร่ ก.ค.2567/พ.ค.2568/ธ.ค.2568/เม.ย.2569" ถูกหักล้างด้วยข้อมูลจริง — ทุกเดือนดังกล่าวมีราคาในระบบ)
const TPSO_CENTRAL_TYPE = "10"; // เขต "ส่วนกลาง" ของ TPSO type

// จำนวนเดือนห่างจาก ref ถึง now (ปฏิทิน — นับเดือนเต็ม)
function calendarMonthsBetween(ref: Date, now: Date): number {
  return (now.getFullYear() - ref.getFullYear()) * 12 + (now.getMonth() - ref.getMonth());
}

// — ชิ้น 1: แบบ ปร.1(ก) — แถวต่องานหรือกลุ่มงาน (หมวดงาน) —
export type GroupRow = {
  section: string; // งานหรือกลุ่มงาน
  costSat: Satang; // ค่างานต้นทุน (ก่อนคูณ F)
  factor: number; // Factor F ระดับโครงการ
  constructionSat: Satang; // ค่าก่อสร้าง = round(ค่างานต้นทุน × F)
};

// — ชิ้น 2: แบบ ปร.1 ต่องานหรือกลุ่มงาน —
export type P1Row = {
  no: number;
  name: string;
  qty: number;
  unit: string;
  matUnit: number | null; // ราคาวัสดุ/หน่วย (null = ไม่มีส่วนวัสดุ)
  matSat: Satang; // จำนวนเงินค่าวัสดุ
  labUnit: number | null; // ราคาแรงงาน/หน่วย (null = ไม่มีส่วนแรงงาน)
  labSat: Satang; // จำนวนเงินค่าแรงงาน
  totalSat: Satang; // รวมค่าวัสดุและค่าแรงงาน
  note: string; // เหตุผลกำกับจาก editor + เตือน "ยังไม่แยก ก./ข."
  unsplit: boolean;
};
export type P1Sheet = {
  section: string; // งานหรือกลุ่มงาน
  rows: P1Row[];
  sumSat: Satang; // รวมชุดนี้ (ต้องเท่ากับ costSat ของกลุ่มนี้ใน ปร.1(ก))
};

// — ชิ้น 3–4: แบบ ปร.2(ก) และ ปร.2 —
export type P2Row = {
  no: number;
  name: string;
  qty: number;
  unit: string;
  equipUnit: number; // ราคาครุภัณฑ์/หน่วย (บาท — ราคาผู้ผลิต/ผู้จำหน่าย ยังไม่รวม VAT)
  equipSat: Satang;
  equipVatSat: Satang | null; // null = ไม่ทราบอัตรา VAT (ป้าย unverified)
  installUnit: number | null; // ค่าติดตั้ง/หน่วย (null = ยังไม่ระบุ — ต้องสืบราคา)
  installSat: Satang;
  installVatSat: Satang | null;
  installReason: string; // เหตุผลความจำเป็นค่าติดตั้ง (จาก editor — เล่ม 2 ข้อ 2.2)
  installSourcing: string; // รายละเอียดการสืบราคาค่าติดตั้ง (จาก editor)
  installReasonMissing: boolean; // true = มีค่าติดตั้งแต่ขาดเหตุผลหรือรายละเอียดการสืบราคาอย่างน้อยหนึ่งส่วน (unverified)
  totalSat: Satang; // รวมค่าครุภัณฑ์จัดซื้อ (ครุภัณฑ์ + VAT + ติดตั้ง + VAT ตามที่ทราบ)
  note: string;
};
export type P2GroupRow = {
  section: string;
  equipSat: Satang;
  equipVatSat: Satang | null;
  installSat: Satang;
  installVatSat: Satang | null;
  installMissing: boolean; // มีรายการในกลุ่มนี้ที่ยังไม่ระบุค่าติดตั้ง
  installReasonMissing: boolean; // มีรายการที่ระบุค่าติดตั้งแต่ขาดเหตุผลหรือรายละเอียดการสืบราคา (OR — ขาดส่วนใดส่วนหนึ่ง)
  totalSat: Satang;
};
export type P2Sheet = {
  rows: P2Row[]; // ปร.2 (รายละเอียดต่อรายการ)
  groups: P2GroupRow[]; // ปร.2(ก) (รวมต่องาน/กลุ่มงาน)
  sumSat: Satang; // รวมค่าครุภัณฑ์จัดซื้อทั้งโครงการ (ทุกองค์ประกอบที่ทราบ)
  vatPct: number | null; // อัตรา VAT ที่ใช้ (จากตาราง Factor F) — null = unverified
};

// — ชิ้น 5–6: แบบ ปร.3 + แบบแสดงการคำนวณและเหตุผลความจำเป็นสำหรับค่าใช้จ่ายพิเศษ —
export type P3Row = {
  no: number;
  name: string;
  qty: number;
  unit: string;
  amountSat: Satang; // ค่าใช้จ่ายรวม (ค่าก่อสร้าง) — รวม VAT แล้วถ้ารายการนั้นระบุว่ามี VAT (ข้อ 9)
  note: string;
};
export type ExpenseReason = {
  name: string; // "รายการ …"
  reason: string; // 1. เหตุผลและความจำเป็นที่ต้องมีค่าใช้จ่ายพิเศษ
  calcDetail: string; // 2. รายละเอียดการคำนวณ (ข้อความ)
  lines: { label: string; sat: Satang }[]; // รายการค่าใช้จ่าย (ยังไม่รวม VAT)
  sumSat: Satang; // รวมค่าใช้จ่าย
  vatSat: Satang | null; // ค่าภาษีมูลค่าเพิ่ม (เฉพาะรายการที่มี) — null = ไม่ทราบอัตรา
  totalSat: Satang; // ค่าใช้จ่ายรวมค่าภาษีมูลค่าเพิ่ม
};
export type P3Sheet = {
  rows: P3Row[];
  sumSat: Satang; // รวมค่าใช้จ่ายพิเศษตามข้อกำหนดทุกรายการ
  reasons: ExpenseReason[]; // ชิ้น 6 — ต่อรายการ
  vatPct: number | null;
};

// — ชิ้น 8: รายละเอียดการหาค่า Factor F —
export type FactorFDetail = {
  haveTable: boolean;
  A: Satang; // ต้นทุนโดยตรงทั้งโครงการ
  factor: number | null; // F ที่ใช้ (null = ยังไม่ปรับ, F = 1)
  afterFactor: Satang; // A × F (จากเครื่องยนต์)
  table?: {
    advancePct: number; // อัตราค่าจ้างล่วงหน้า %
    retentionPct: number; // อัตราเงินประกันผลงาน %
    interestPct: number; // อัตราดอกเบี้ยเงินกู้ %
    vatPct: number; // อัตราภาษีมูลค่าเพิ่ม %
    workType?: string; // ประเภทงาน (ประกาศ ว 481)
  };
  row?: {
    B: number; // ขอบล่างช่วงต้นทุน (ล้านบาท)
    C: number; // ขอบบนช่วงต้นทุน (ล้านบาท)
    D: number; // ค่าที่ขอบล่าง ของคอลัมน์ที่ใช้จริง (D = คอลัมน์ปกติ / F = ไม่รวม VAT / D2,D3 = ฝนชุก)
    E: number; // ค่าที่ขอบบน ของคอลัมน์ที่ใช้จริง (E = คอลัมน์ปกติ / G = ไม่รวม VAT / E2,E3 = ฝนชุก)
    colLo: string; // ตัวอักษรคอลัมน์ที่ขอบล่าง (D/F/D2/D3 ตามประกาศ)
    colHi: string; // ตัวอักษรคอลัมน์ที่ขอบบน (E/G/E2/E3)
    open: boolean; // ช่วงปลายเปิด ("ตั้งแต่ N ขึ้นไป")
    interpolated: boolean; // interpolate ในช่วง (ของคอลัมน์ที่ใช้จริง)
    rangeLabel: string; // เช่น "0–100 ล้านบาท" / "ตั้งแต่ 500 ล้านบาทขึ้นไป (ช่วงปลายเปิด)"
  };
  columnLabel: string; // คอลัมน์ที่ใช้ (รวม VAT / ไม่รวม VAT / ฝนชุก)
  notes: string[]; // trace จากเครื่องยนต์ (การปัดเศษ/ที่มาตาราง/หมายเหตุแถว)
};

// — ชิ้น 9: แบบบันทึกแสดงเหตุผลและความจำเป็นการสืบและกำหนดราคาวัสดุก่อสร้าง —
export type PriceEvidenceRow = {
  no: number;
  name: string;
  unit: string;
  unitPrice: number; // ราคาที่กำหนด/หน่วย (บาท)
  origin: string; // ที่มาและหลักฐานของราคา (ข้อความ)
  reason: string; // เหตุผลกำกับจาก editor (item.note)
  unstated: boolean; // true = ไม่ระบุแหล่งที่มาราคา (ต้องกรอกเหตุผลเพิ่ม)
  stale: boolean; // true = อายุราคา > 12 เดือน ณ วันที่พิมพ์ (unverified: ต้องสืบราคาใหม่)
  staleDetail: string; // เช่น "ราคาอ้างอิงเดือน 9/2568 — เก่ากว่า 12 เดือน (14 เดือน)"
  notYetPublished: boolean; // true = ราคา สนค. เขตส่วนกลาง เดือนอ้างอิง ≥ เดือนที่พิมพ์ — ณ วันพิมพ์ยังไม่ปรากฏราคาในระบบ สนค. (unverified)
};

// ส่วนท้ายชิ้น 9 — บันทึกเหตุผล/รายละเอียดการสืบราคา "ค่าติดตั้งครุภัณฑ์" (แยกจากราคาครุภัณฑ์ — เล่ม 2 ข้อ 2.2/ข้อ 8)
export type InstallEvidenceRow = {
  no: number;
  name: string;
  qty: number;
  unit: string;
  installUnit: number | null; // ค่าติดตั้ง/หน่วย (null = ยังไม่ระบุ — ต้องสืบราคา)
  reason: string; // เหตุผลความจำเป็นที่ต้องมีค่าติดตั้ง
  sourcing: string; // รายละเอียดประกอบการสืบราคา
  missingPrice: boolean; // true = ยังไม่ระบุค่าติดตั้ง
  reasonMissing: boolean; // true = มีราคาแต่ขาดเหตุผลหรือรายละเอียดการสืบราคาอย่างน้อยหนึ่งส่วน (unverified)
};

export type Reg2569Report = {
  warnings: string[];
  // ชิ้น 1 — ปร.1(ก)
  groups: GroupRow[];
  groupsSumSat: Satang; // Σ ค่าก่อสร้างรายกลุ่ม
  roundingAdjSat: Satang; // afterFactor − Σรายกลุ่ม (0 = ตรงพอดี ไม่ต้องมีบรรทัดปรับปัดเศษ)
  constructionTotalSat: Satang; // ค่าก่อสร้างรวม = calc.afterFactor
  // ชิ้น 2 — ปร.1 (ต่อหมวดงาน)
  p1Sheets: P1Sheet[];
  // ชิ้น 3–4 — ปร.2(ก)/ปร.2 (null = ไม่มีรายการครุภัณฑ์)
  p2: P2Sheet | null;
  // ชิ้น 5–6 — ปร.3/แบบเหตุผล (null = ไม่มีค่าใช้จ่ายพิเศษ → ไม่ต้องออก ปร.3)
  p3: P3Sheet | null;
  // ชิ้น 7 — ปร.4
  summary: {
    constructionSat: Satang; // 1 ค่างานต้นทุน (ค่าก่อสร้างส่วนงาน)
    equipmentSat: Satang; // 2 ค่าครุภัณฑ์จัดซื้อ
    expenseSat: Satang; // 3 ค่าใช้จ่ายพิเศษตามข้อกำหนด (ถ้ามี)
    totalSat: Satang; // รวมค่าก่อสร้างทั้งโครงการ = ราคากลาง
  };
  // ชิ้น 8 — รายละเอียดการหาค่า Factor F
  factorFDetail: FactorFDetail;
  // ชิ้น 9 — บันทึกเหตุผลการสืบราคาวัสดุ
  priceEvidence: PriceEvidenceRow[];
  installEvidence: InstallEvidenceRow[]; // สืบราคาค่าติดตั้งครุภัณฑ์ (แยกส่วนท้ายของชิ้น 9)
  // ยอดเครื่องยนต์เดิม (calc.total — รวมเงินเผื่อจำเป็น/ค่าดำเนินงานของโครงเดิม) — เทียบเคียง
  engineTotalSat: Satang;
};

const thMoney = (s: Satang): string => formatSatang(s);
const thBaht = (n: number): string => (isFinite(n) ? n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
const fmtB = (s: Satang): string => s.toLocaleString("th-TH");
const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("th-TH", { year: "numeric", month: "numeric", day: "numeric" });
};

// อัตรา VAT ที่ใช้กับครุภัณฑ์/ค่าใช้จ่ายพิเศษ — จากตาราง Factor F ที่เลือกด้วยเงื่อนไขเดียวกับเครื่องยนต์
// (ประกาศ ว 481: แต่ละตารางผูกอัตรา VAT ของคอลัมน์ปกติไว้กับตาราง)
function resolveFactorFTable(project: BoqProject, ruleset: Ruleset | undefined | null): FactorFTable | null {
  if (ruleset?.factorFTables && ruleset.factorFTables.length > 0) {
    return project.factorFCond ? selectFactorFTable(ruleset.factorFTables, project.factorFCond) : null;
  }
  return ruleset?.factorF ?? null;
}

export function buildReg2569Report(
  project: BoqProject,
  ruleset: Ruleset | undefined | null,
  calc: CalcResult,
  now: Date = new Date(),
): Reg2569Report {
  const warnings: string[] = [...calc.warnings];

  // B4 — ชุดกฎที่ pin ถูกแทนที่แล้ว (supersededBy) → เตือน + พิมพ์ไปกับ ปร.4/ชิ้น 8 (PrintWarnings)
  if (ruleset && rulesetStatus(ruleset) === "superseded") {
    warnings.push(
      `ชุดกฎที่ pin (id ${ruleset.id}) ถูกแทนที่ด้วยชุดกฎใหม่ (supersededBy ${ruleset.supersededBy}) — อัตราในชุดกฎเดิมอาจไม่ตรงประกาศฉบับล่าสุด; ย้ายโปรเจกต์ไปใช้ชุดกฎใหม่ก่อนพิมพ์ใช้จริง (ตรวจที่หน้า ชุดกฎราคากลาง)`,
    );
  }

  const construction = project.items.filter((it) => it.part !== "equipment");
  const equipment = project.items.filter((it) => it.part === "equipment");

  // F5 — guard โปรเจกต์ไม่มีรายการงานก่อสร้าง (A = 0 → ปร.1(ก)/ปร.1 ว่าง, ยอดรวมมีแต่ครุภัณฑ์/ค่าใช้จ่ายพิเศษ)
  if (project.items.length === 0) {
    warnings.push(
      "โปรเจกต์ยังไม่มีรายการงานใด ๆ — ชุดเอกสาร 9 ชิ้นยังพิมพ์ใช้จริงไม่ได้ (ปร.1(ก)/ปร.1/ชิ้น 9 ว่างเปล่า); ถอดแบบและใส่รายการงานก่อน",
    );
  } else if (construction.length === 0) {
    warnings.push(
      "ไม่มีรายการงานก่อสร้างในโปรเจกต์ (มีแต่ครุภัณฑ์) — ต้นทุนโดยตรง (A) = 0 และ ปร.1(ก)/ปร.1 ว่างเปล่า; ตรวจว่าตั้งใจหรือไม่ (งานก่อสร้างต้องมีรายการ ก./ข.)",
    );
  }
  const table = resolveFactorFTable(project, ruleset);
  const vatPct: number | null = table ? table.vatPct : null;

  // — ชิ้น 2: ปร.1 ต่องานหรือกลุ่มงาน (หมวดงาน ตามลำดับที่พบในรายการ) —
  const sections: string[] = [];
  for (const it of construction) if (!sections.includes(it.section)) sections.push(it.section);

  const p1Sheets: P1Sheet[] = sections.map((section) => {
    const rows: P1Row[] = [];
    let sumSat: Satang = 0;
    construction
      .filter((it) => it.section === section)
      .forEach((it, i) => {
        const { mat, lab, needsSplit } = splitItem(it);
        const matSat = mat ?? 0;
        const labSat = lab ?? 0;
        const notes: string[] = [];
        if (it.note) notes.push(it.note);
        if (needsSplit) notes.push("ยังไม่แยกค่าวัสดุ/ค่าแรง — ใส่ทั้งหมดในค่าวัสดุ (แก้ใน editor)");
        rows.push({
          no: i + 1,
          name: it.name,
          qty: it.qty,
          unit: it.unit,
          matUnit: mat !== null ? it.matPrice ?? it.price : null,
          matSat,
          labUnit: lab !== null ? it.laborPrice ?? it.price : null,
          labSat,
          totalSat: matSat + labSat,
          note: notes.join(" · "),
          unsplit: needsSplit,
        });
        sumSat += matSat + labSat;
      });
    return { section, rows, sumSat };
  });

  // — ชิ้น 1: ปร.1(ก) — ค่างานต้นทุนต่อกลุ่ม × F (ระดับโครงการ) —
  const factor = calc.factorF ?? 1;
  if (calc.factorF === null) {
    warnings.push(
      "Factor F ยังไม่ปรับ (F = 1) — ตรวจเงื่อนไขสัญญา (factorFCond) และชุดกฎที่ pin; ยอดค่าก่อสร้างทุกบรรทัดคิดที่ F = 1",
    );
  }
  const groups: GroupRow[] = p1Sheets.map((sh) => ({
    section: sh.section,
    costSat: sh.sumSat,
    factor,
    constructionSat: Math.round(sh.sumSat * factor), // ปัดเศษ half-up ต่อกลุ่ม (เหมือนเครื่องยนต์ระดับโครงการ)
  }));
  const groupsSumSat = sumSatang(groups.map((g) => g.constructionSat));
  const constructionTotalSat = calc.afterFactor ?? calc.directCost;
  const roundingAdjSat = constructionTotalSat - groupsSumSat; // 0 = ตรงพอดี; ไม่เป็นศูนย์ → บรรทัด "ปรับปัดเศษ"

  // — ชิ้น 3–4: ปร.2(ก) / ปร.2 — ครุภัณฑ์แยกจากฐาน Factor F; ค่าติดตั้งจากการสืบราคา (ข้อ 8) —
  let p2: P2Sheet | null = null;
  let equipTotalSat: Satang = 0;
  if (equipment.length > 0) {
    const calced = equipment.map((it) => {
      const equipSat = mulQty(it.qty, it.price);
      const equipVatSat = vatPct !== null ? pctOf(equipSat, vatPct) : null;
      const installUnit = it.installPrice;
      const installSat = installUnit !== undefined && isFinite(installUnit) ? mulQty(it.qty, installUnit) : 0;
      const installVatSat = installUnit !== undefined && vatPct !== null ? pctOf(installSat, vatPct) : null;
      const totalSat = equipSat + (equipVatSat ?? 0) + installSat + (installVatSat ?? 0);
      return { it, equipSat, equipVatSat, installUnit, installSat, installVatSat, totalSat };
    });
    const rows: P2Row[] = calced.map((c, i) => {
      const notes: string[] = [];
      if (c.installUnit === undefined || !isFinite(c.installUnit))
        notes.push("ค่าติดตั้งยังไม่ระบุ — ถ้าจำเป็นต้องสืบราคาแยกจากราคาครุภัณฑ์ (เล่ม 2 ข้อ 2.2/ข้อ 8)");
      const installReason = c.it.installPriceReason ?? "";
      const installSourcing = c.it.installSourcingDetail ?? "";
      // "ควรแก้" จาก re-review รอบสอง: ใช้ OR — มีค่าติดตั้งแต่ขาดอย่างใดอย่างหนึ่ง
      // (เหตุผลความจำเป็น "หรือ" รายละเอียดการสืบราคา) ก็ต้องแฟล็ก/เตือน — ข้อ 2.2 ต้องแสดงทั้งสองส่วน
      const missingReason = installReason.trim() === "";
      const missingSourcing = installSourcing.trim() === "";
      const installReasonMissing =
        c.installUnit !== undefined && isFinite(c.installUnit) && (missingReason || missingSourcing);
      if (installReasonMissing)
        notes.push(
          `unverified: มีค่าติดตั้งแต่ยังไม่บันทึก${
            missingReason && missingSourcing
              ? "เหตุผลความจำเป็นและรายละเอียดการสืบราคา"
              : missingReason
                ? "เหตุผลความจำเป็น"
                : "รายละเอียดการสืบราคา"
          }ค่าติดตั้ง (เล่ม 2 ข้อ 2.2)`,
        );
      if (c.it.note) notes.push(c.it.note);
      return {
        no: i + 1,
        name: c.it.name,
        qty: c.it.qty,
        unit: c.it.unit,
        equipUnit: c.it.price,
        equipSat: c.equipSat,
        equipVatSat: c.equipVatSat,
        installUnit: c.installUnit !== undefined && isFinite(c.installUnit) ? c.installUnit : null,
        installSat: c.installSat,
        installVatSat: c.installVatSat,
        installReason,
        installSourcing,
        installReasonMissing,
        totalSat: c.totalSat,
        note: notes.join(" · "),
      };
    });
    // ปร.2(ก): รวมต่องานหรือกลุ่มงาน (หมวดของรายการครุภัณฑ์)
    const gsec: string[] = [];
    for (const c of calced) if (!gsec.includes(c.it.section)) gsec.push(c.it.section);
    const groups2: P2GroupRow[] = gsec.map((section) => {
      const sub = calced.filter((c) => c.it.section === section);
      return {
        section,
        equipSat: sumSatang(sub.map((c) => c.equipSat)),
        equipVatSat: vatPct !== null ? sumSatang(sub.map((c) => c.equipVatSat ?? 0)) : null,
        installSat: sumSatang(sub.map((c) => c.installSat)),
        installVatSat: vatPct !== null ? sumSatang(sub.map((c) => c.installVatSat ?? 0)) : null,
        installMissing: sub.some((c) => c.installUnit === undefined || !isFinite(c.installUnit)),
        installReasonMissing: sub.some((c) => {
          const has = c.installUnit !== undefined && isFinite(c.installUnit);
          return has && ((c.it.installPriceReason ?? "").trim() === "" || (c.it.installSourcingDetail ?? "").trim() === "");
        }),
        totalSat: sumSatang(sub.map((c) => c.totalSat)),
      };
    });
    equipTotalSat = sumSatang(calced.map((c) => c.totalSat));
    p2 = { rows, groups: groups2, sumSat: equipTotalSat, vatPct };
    if (vatPct === null) {
      warnings.push(
        "ค่าครุภัณฑ์: ไม่มีตาราง Factor F ที่เลือกได้ จึงไม่ทราบอัตรา VAT — ยอดค่าครุภัณฑ์ยังไม่รวม VAT (unverified: ตรวจอัตรา VAT ปัจจุบันจากเอกสารก่อนใช้จริง)",
      );
    }
    if (rows.some((r) => r.installUnit === null)) {
      warnings.push(
        "รายการครุภัณฑ์บางรายการยังไม่ระบุค่าติดตั้ง/หน่วย (สืบราคาแยก) — ช่องค่าติดตั้งใน ปร.2/ปร.2(ก) จะว่างให้กรอกเพิ่มก่อนพิมพ์",
      );
    }
    const noReasonRows = rows.filter((r) => r.installReasonMissing);
    if (noReasonRows.length > 0) {
      // แยกข้อความว่ารายการไหนขาดอะไร — เหตุผลความจำเป็น หรือ รายละเอียดการสืบราคา (re-review รอบสอง: เงื่อนไข OR)
      const detail = (r: P2Row) =>
        r.installReason.trim() === "" && r.installSourcing.trim() === ""
          ? `${r.name} (ขาดทั้งเหตุผลความจำเป็นและรายละเอียดการสืบราคา)`
          : r.installReason.trim() === ""
            ? `${r.name} (ขาดเหตุผลความจำเป็น)`
            : `${r.name} (ขาดรายละเอียดการสืบราคา)`;
      warnings.push(
        `${noReasonRows.length} รายการครุภัณฑ์ระบุค่าติดตั้งแต่เอกสารประกอบไม่ครบ (เล่ม 2 ข้อ 2.2 ต้องแสดงทั้งสองส่วน): ${noReasonRows.map(detail).slice(0, 5).join(", ")}${noReasonRows.length > 5 ? " ฯลฯ" : ""} — กรอกในฟอร์ม "ค่าติดตั้งครุภัณฑ์" ก่อนพิมพ์`,
      );
    }
    if (ruleset?.durableHandlingPct !== undefined && calc.installAmount !== null && calc.installAmount > 0) {
      warnings.push(
        `ชุดกฎเดิมคิดค่าดำเนินงานครุภัณฑ์ ${ruleset.durableHandlingPct}% ของยอดครุภัณฑ์ ซึ่งไม่ตรงเล่ม 2 ข้อ 8 (ค่าติดตั้งมาจากการสืบราคา และราคาครุภัณฑ์ห้ามแฝงองค์ประกอบค่าติดตั้ง) — ชุด 9 ชิ้นจึงไม่ใช้ตัวเลขนี้; ใส่ค่าติดตั้งรายรายการที่สืบราคาแทน`,
      );
    }
  }

  // — ชิ้น 5–6: ปร.3 + แบบแสดงการคำนวณและเหตุผลความจำเป็น (ข้อ 9: รายการที่ต้องชำระ VAT ให้รวม VAT ไว้ด้วย) —
  let p3: P3Sheet | null = null;
  let expenseTotalSat: Satang = 0;
  const expenses = project.specialExpenses ?? [];
  if (expenses.length > 0) {
    const rows: P3Row[] = [];
    const reasons: ExpenseReason[] = [];
    expenses.forEach((ex, i) => {
      const base = toSatang(ex.amount);
      let vatSat: Satang | null = 0;
      if (ex.vatIncluded) {
        vatSat = vatPct !== null ? pctOf(base, vatPct) : null;
        if (vatSat === null) {
          warnings.push(
            `ค่าใช้จ่ายพิเศษ "${ex.name}": ระบุว่าต้องชำระ VAT แต่ไม่มีอัตรา VAT จากตาราง Factor F — ยอดยังไม่รวม VAT (unverified)`,
          );
        }
      }
      const amountSat = base + (vatSat ?? 0);
      const note = ex.vatIncluded
        ? vatPct !== null && vatSat !== null
          ? `รวม VAT ${vatPct}% (${thMoney(vatSat)} บาท)`
          : "รวม VAT — อัตรายังไม่ทราบ (unverified)"
        : "ไม่รวม VAT";
      rows.push({ no: i + 1, name: ex.name, qty: ex.qty, unit: ex.unit, amountSat, note });
      reasons.push({
        name: ex.name,
        reason: ex.reason ?? "",
        calcDetail: ex.calcDetail ?? "",
        lines: [{ label: ex.name, sat: base }],
        sumSat: base,
        vatSat,
        totalSat: amountSat,
      });
      expenseTotalSat += amountSat;
    });
    p3 = { rows, sumSat: expenseTotalSat, reasons, vatPct };
  }

  // — ชิ้น 8: รายละเอียดการหาค่า Factor F — trace จากเครื่องยนต์ + แถว/คอลัมน์ที่ใช้จริง —
  // B2: แสดงขอบ (D/E) ของ "คอลัมน์ที่ใช้จริง" — ตามเงื่อนไขสัญญาแบบเดียวกับเครื่องยนต์:
  // ฝนชุก override คอลัมน์ไม่รวม VAT ถ้าตารางมีคอลัมน์นั้น; ขอคอลัมน์ที่ตารางไม่มี → fallback คอลัมน์ปกติ
  const factorStep = calc.steps.find((s) => s.kind === "factor");
  const fdNotes: string[] = [...(factorStep?.notes ?? [])];
  const cond = project.factorFCond;
  const factorFDetail: FactorFDetail = {
    haveTable: table !== null,
    A: calc.directCost,
    factor: calc.factorF,
    afterFactor: constructionTotalSat,
    columnLabel: "Factor F (รวม VAT)",
    notes: fdNotes,
  };
  if (table) {
    factorFDetail.table = {
      advancePct: table.advancePct,
      retentionPct: table.retentionPct,
      interestPct: table.interestPct,
      vatPct: table.vatPct,
      workType: table.workType,
    };
    try {
      const lk = lookupFactorF(calc.directCost, table); // เงื่อนไขเดียวกับเครื่องยนต์ — deterministic
      const r = lk.row;
      const open = r.open ?? false;
      const EPS = 1e-9;
      const aMillion = calc.directCost / 1e8;
      // เลือกคอลัมน์ที่ใช้จริง — เงื่อนไขเดียวกับ compute.ts (ฝนชุกมาทีหลัง = override คอลัมน์ไม่รวม VAT)
      // แถวปลายเปิด: ค่าคงที่ — เช็คแค่คอลัมน์ล่าง (ตาม engine); แถวช่วงปกติ: ต้องมีคู่ขอบครบ
      let col: { lo: number; hi: number; colLo: string; colHi: string; label: string } | null = null;
      if (cond?.rain) {
        const ok = open
          ? cond.rain === 1 ? r.D2 !== undefined : r.D3 !== undefined
          : cond.rain === 1 ? r.D2 !== undefined && r.E2 !== undefined : r.D3 !== undefined && r.E3 !== undefined;
        if (ok) {
          col =
            cond.rain === 1
              ? { lo: r.D2!, hi: r.E2 ?? r.D2!, colLo: "D2", colHi: "E2", label: "Factor F ฝนชุก 1" }
              : { lo: r.D3!, hi: r.E3 ?? r.D3!, colLo: "D3", colHi: "E3", label: "Factor F ฝนชุก 2" };
        }
      }
      if (!col && cond?.noVat) {
        const ok = open ? r.F !== undefined : r.F !== undefined && r.G !== undefined;
        if (ok) {
          col = { lo: r.F!, hi: r.G ?? r.F!, colLo: "F", colHi: "G", label: 'Factor F "รวมในรูป Factor" (ไม่รวม VAT — หมายเหตุ 2 ของประกาศ)' };
        }
      }
      const used = col ?? { lo: r.D, hi: r.E, colLo: "D", colHi: "E", label: "Factor F (รวม VAT)" };
      factorFDetail.columnLabel = used.label;
      factorFDetail.row = {
        B: r.B,
        C: r.C,
        D: used.lo,
        E: used.hi,
        colLo: used.colLo,
        colHi: used.colHi,
        open,
        interpolated: !open && Math.abs(aMillion - r.B) > EPS && Math.abs(aMillion - r.C) > EPS && used.lo !== used.hi,
        rangeLabel: open
          ? `ตั้งแต่ ${fmtB(r.B)} ล้านบาทขึ้นไป (ช่วงปลายเปิด — ใช้ค่าคงที่ตามประกาศ)`
          : `${fmtB(r.B)}–${fmtB(r.C)} ล้านบาท`,
      };
      if (lk.anomalyNote) fdNotes.push(`แถวตารางมีหมายเหตุเบี่ยงเบนจากต้นฉบับ: ${lk.anomalyNote}`);
    } catch (e) {
      fdNotes.push(`ไม่สามารถอ้างแถวตารางได้: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // — ชิ้น 9: บันทึกเหตุผลการสืบและกำหนดราคาวัสดุก่อสร้าง (รายการงานก่อสร้าง — ครุภัณฑ์อยู่ใน ปร.2) —
  // B3: flag ราคาเก่า >12 เดือน (นับจากเดือนอ้างอิงราคาถึงวันที่พิมพ์) และราคา สนค. ส่วนกลางที่เดือนอ้างอิง ≥ เดือนพิมพ์ (กฎปฏิทิน)
  const nowD = now;
  const priceEvidence: PriceEvidenceRow[] = [];
  let unstatedCount = 0;
  let staleCount = 0;
  let notYetPublishedCount = 0;
  construction.forEach((it, i) => {
    const s = it.source;
    let origin: string;
    let unstated = false;
    let stale = false;
    let staleDetail = "";
    let notYetPublished = false;
    if (!s) {
      origin = "ไม่ระบุแหล่งที่มาราคา — ต้องบันทึกเหตุผลและรายละเอียดการสืบราคาก่อนใช้จริง";
      unstated = true;
      unstatedCount++;
    } else if (s.kind === "tpso") {
      // s.year เก็บเป็น พ.ศ. อยู่แล้ว (BoqItem บันทึกจาก picker) — ห้าม +543 ซ้ำ; s.priceAtPick เป็นบาท float
      const ref = s.month ? `เดือน ${s.month}/${s.year} (พ.ศ. ${s.year})` : `ปี พ.ศ. ${s.year}`;
      origin = `ราคา สนค. (TPSO) — ${s.provName || "ไม่ระบุเขต"} (รหัสเขต ${s.prov}) · ${ref} · ราคาขณะเลือก ${thBaht(s.priceAtPick)} บาท/หน่วย · เลือกเมื่อ ${fmtDate(s.pickedAt)}`;
      // อายุราคา — นับจากเดือน/ปีอ้างอิงราคา (แปลง พ.ศ. → ค.ศ.)
      const refDate = new Date(s.year - 543, (s.month ?? 1) - 1, 1);
      const months = calendarMonthsBetween(refDate, nowD);
      if (months > 12) {
        stale = true;
        staleDetail = `ราคาอ้างอิง${s.month ? `เดือน ${s.month}/${s.year}` : `ปี ${s.year}`} — เก่ากว่า 12 เดือน (${months} เดือน ณ วันที่พิมพ์)`;
        staleCount++;
      }
      // กฎปฏิทิน: เดือนอ้างอิง ≥ เดือนที่พิมพ์ = ณ วันพิมพ์ยังไม่ปรากฏราคาส่วนกลางในระบบ สนค.
      notYetPublished =
        s.prov === TPSO_CENTRAL_TYPE &&
        s.month !== null &&
        calendarMonthsBetween(refDate, nowD) <= 0;
      if (notYetPublished) {
        notYetPublishedCount++;
        origin += " · ⚠ เดือนอ้างอิงยังไม่ปรากฏราคาส่วนกลางในระบบ สนค. ณ วันที่พิมพ์ — unverified (ตรวจราคาจากเขตจังหวัด/สืบราคาแทน)";
      }
    } else {
      origin = `คลังราคาของฉัน — หมวด ${s.category} · ราคา ณ ${fmtDate(s.priceAgeRef)} · เลือกเมื่อ ${fmtDate(s.pickedAt)}`;
      if (s.note) origin += ` · หมายเหตุที่มาราคา: ${s.note}`; // F6 — เหตุผลกำกับของคลังส่วนตัวต้องพิมพ์ด้วย
      const refDate = new Date(s.priceAgeRef);
      if (!isNaN(refDate.getTime())) {
        const months = calendarMonthsBetween(refDate, nowD);
        if (months > 12) {
          stale = true;
          staleDetail = `ราคาอัปเดต ณ ${fmtDate(s.priceAgeRef)} — เก่ากว่า 12 เดือน (${months} เดือน)`;
          staleCount++;
        }
      }
    }
    priceEvidence.push({
      no: i + 1,
      name: it.name,
      unit: it.unit,
      unitPrice: it.price,
      origin,
      reason: it.note ?? "",
      unstated,
      stale,
      staleDetail,
      notYetPublished,
    });
  });
  if (unstatedCount > 0) {
    warnings.push(
      `${unstatedCount} รายการยังไม่ระบุแหล่งที่มาราคา — แบบบันทึกเหตุผลการสืบราคาวัสดุ (ชิ้นที่ 9) ต้องกรอกเหตุผลเพิ่มก่อนใช้จริง`,
    );
  }
  if (staleCount > 0) {
    warnings.push(
      `${staleCount} รายการมีอายุราคาเก่ากว่า 12 เดือน (แสดงป้ายในชิ้นที่ 9) — ควรสืบราคาใหม่หรือตรวจสอบความเที่ยงตรงก่อนใช้จริง (unverified)`,
    );
  }
  if (notYetPublishedCount > 0) {
    warnings.push(
      `${notYetPublishedCount} รายการอ้างราคา สนค. เขตส่วนกลาง เดือนอ้างอิงเท่ากับหรือหลังเดือนที่พิมพ์ (ณ วันพิมพ์ยังไม่ปรากฏราคาส่วนกลางในระบบ สนค. — แสดงป้ายในชิ้นที่ 9) — ราคาเหล่านี้ unverified; ใช้ราคารายจังหวัดหรือสืบราคาแทน`,
    );
  }

  // ส่วนท้ายชิ้น 9 — การสืบราคา "ค่าติดตั้งครุภัณฑ์" (เล่ม 2 ข้อ 2.2/ข้อ 8)
  const installEvidence: InstallEvidenceRow[] = equipment.map((it, i) => {
    const installUnit = it.installPrice;
    const hasPrice = installUnit !== undefined && isFinite(installUnit);
    const reason = it.installPriceReason ?? "";
    const sourcing = it.installSourcingDetail ?? "";
    return {
      no: i + 1,
      name: it.name,
      qty: it.qty,
      unit: it.unit,
      installUnit: hasPrice ? installUnit : null,
      reason,
      sourcing,
      missingPrice: !hasPrice,
      reasonMissing: hasPrice && (reason.trim() === "" || sourcing.trim() === ""), // OR — ขาดอย่างใดอย่างหนึ่งก็ไม่ครบ
    };
  });

  // — ชิ้น 7: ปร.4 — รวม 3 ส่วนตามข้อ 10 —
  const totalSat = constructionTotalSat + equipTotalSat + expenseTotalSat;
  if (calc.total !== totalSat) {
    const parts = [
      calc.contingency !== null ? `เงินเผื่อจำเป็น ${thMoney(calc.contingency)}` : null,
      calc.swc !== null ? `ค่าดำเนินงาน ${thMoney(calc.swc)}` : null,
      calc.installAmount ? `ค่าดำเนินงานครุภัณฑ์ ${thMoney(calc.installAmount)}` : null,
    ].filter(Boolean) as string[];
    const rest = calc.total - (totalSat + (calc.contingency ?? 0) + (calc.swc ?? 0) + (calc.installAmount ?? 0));
    if (rest !== 0) parts.push(`ส่วนต่างอื่น (เช่น VAT/ค่าติดตั้งที่สืบราคา) ${thMoney(rest)}`);
    warnings.push(
      `ยอดราคากลางชุด 9 ชิ้น ${thMoney(totalSat)} บาท ต่างจากยอดรวมเครื่องยนต์เดิม ${thMoney(calc.total)} บาท (ต่าง ${thMoney(calc.total - totalSat)} บาท) — เครื่องยนต์เดิมรวม ${parts.join(" + ")} ซึ่งชุด 9 ชิ้นตามข้อ 10 เล่ม 2 ไม่รวม (รวมเฉพาะ ค่าก่อสร้าง + ค่าครุภัณฑ์จัดซื้อ + ค่าใช้จ่ายพิเศษ); ตรวจยอดเปรียบเทียบกับหน่วยงานก่อนใช้`,
    );
  }

  return {
    warnings,
    groups,
    groupsSumSat,
    roundingAdjSat,
    constructionTotalSat,
    p1Sheets,
    p2,
    p3,
    summary: {
      constructionSat: constructionTotalSat,
      equipmentSat: equipTotalSat,
      expenseSat: expenseTotalSat,
      totalSat,
    },
    factorFDetail,
    priceEvidence,
    installEvidence,
    engineTotalSat: calc.total,
  };
}
