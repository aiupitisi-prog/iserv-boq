// เครื่องยนต์คำนวณราคากลาง (F3.5) — pure function: compute(project, ruleset) → Result + trace ทุกขั้น
//
// ลำดับบังคับตาม skill thai-govt-base-price-rules:
//   1) รายการ → รวมเงินต่อรายการ (ปริมาณ × ราคา/หน่วย)
//   2) รวม "ต้นทุนโดยตรงของโครงการ" (A) — แยก ก. ค่าวัสดุ / ข. ค่าแรง — ครุภัณฑ์ห้ามเข้าฐานนี้
//   3) Factor F จากตารางใน ruleset เท่านั้น (ขอบตาราง = ค่าตรง, ในช่วง = interpolate, นอกช่วง = throw)
//   4) ปร.1(ก) = A × F
//   5) ครุภัณฑ์: แยกฐาน + ค่าดำเนินงานครุภัณฑ์เป็นบรรทัดแยก
//   6) เงินเผื่อจำเป็น / ค่าดำเนินงาน — เฉพาะเมื่อ ruleset ระบุอัตรา (ไม่มีค่าจากความจำ)
//
// กฎเหล็กที่บังคับในโค้ดนี้:
// - ตัวเงินเป็นสตางค์ integer ทุกขั้น — float ห้ามเข้าการคำนวณ (แปลงครั้งเดียวที่ขอบเขต)
// - ทุกจุดปัดเศษบันทึกหมายเหตุใน trace
// - ข้อสมมติที่ยืนยันจากเอกสารไม่ได้ → เขียน "unverified" ใน warnings เสมอ

import type { BoqItem, BoqProject } from "../boq";
import type { Ruleset } from "../ruleset";
import { CalcError, lookupFactorF } from "./factorf";
import { formatSatang, mulQty, pctOf, sumSatang, type Satang } from "./money";

export type CalcStepKind =
  | "material" // ก. ค่าวัสดุ
  | "labor" // ข. ค่าแรง
  | "direct" // ต้นทุนโดยตรง (A)
  | "factor" // Factor F
  | "contingency" // เงินเผื่อจำเป็น
  | "swc" // ค่าดำเนินงาน
  | "equipment" // ครุภัณฑ์ (แยกฐาน)
  | "install" // ค่าดำเนินงานครุภัณฑ์
  | "total"; // ราคากลางรวม

export type CalcStep = {
  label: string;
  formula?: string;
  satang: Satang;
  kind: CalcStepKind;
  notes?: string[]; // หลักฐาน/หมายเหตุการปัดเศษ/open question
};

export type CalcResult = {
  rulesetId: string | null;
  material: Satang; // ก.
  labor: Satang; // ข.
  directCost: Satang; // A (งานก่อสร้างเท่านั้น — ไม่รวมครุภัณฑ์)
  factorF: number | null;
  afterFactor: Satang | null; // A × F
  contingency: Satang | null;
  swc: Satang | null;
  equipmentAmount: Satang | null;
  installAmount: Satang | null;
  total: Satang; // ราคากลางรวม (สตางค์)
  steps: CalcStep[];
  warnings: string[];
};

// จัดหมวดแถวเป็น ก./ข. — ใช้สแปลิตที่ผู้ใช้ใส่เองก่อน แล้วตามหมวดของแหล่งราคา
// (ราคา สนค. = วัสดุ; คลังของฉันหมวด "ค่าแรง" = แรงงาน; ที่เหลือถือวัสดุ + แจ้งเตือนให้แยกใน editor)
function splitItem(it: BoqItem): { mat: Satang | null; lab: Satang | null; needsSplit: boolean } {
  const total = mulQty(it.qty, it.price);
  if (it.matPrice !== undefined && it.laborPrice !== undefined) {
    return { mat: mulQty(it.qty, it.matPrice), lab: mulQty(it.qty, it.laborPrice), needsSplit: false };
  }
  if (it.source?.kind === "private" && it.source.category === "ค่าแรง") {
    return { mat: null, lab: total, needsSplit: false };
  }
  return { mat: total, lab: null, needsSplit: total !== 0 };
}

export function computeGovBOQ(project: BoqProject, ruleset: Ruleset | undefined | null): CalcResult {
  const warnings: string[] = [];
  const steps: CalcStep[] = [];

  const construction = project.items.filter((it) => it.part !== "equipment");
  const equipment = project.items.filter((it) => it.part === "equipment");

  // 1)–2) แยก ก./ข. และรวมต้นทุนโดยตรง (A)
  let material: Satang = 0;
  let labor: Satang = 0;
  const needsSplit: string[] = [];
  const mismatch: string[] = [];

  for (const it of construction) {
    const { mat, lab, needsSplit: flag } = splitItem(it);
    if (flag) needsSplit.push(it.name || "รายการไม่มีชื่อ");
    const matSat = mat ?? 0;
    const labSat = lab ?? 0;
    // ถ้าผู้ใช้แยกเอง ตรวจว่า วัสดุ+แรงงาน = ปริมาณ×ราคารวม
    if (mat !== null && lab !== null) {
      const total = mulQty(it.qty, it.price);
      if (matSat + labSat !== total) {
        mismatch.push(
          `"${it.name || "รายการไม่มีชื่อ"}" (วัสดุ+แรงงาน ${formatSatang(matSat + labSat)} ≠ รวม ${formatSatang(total)})`,
        );
      }
    }
    material += matSat;
    labor += labSat;
  }

  if (needsSplit.length > 0) {
    warnings.push(
      `${needsSplit.length} รายการยังไม่แยกค่าวัสดุ/ค่าแรง (ใส่ทั้งหมดใน ก. ค่าวัสดุ) — ระบุช่อง วัสดุ/แรงงาน ใน editor เพื่อจัดทำส่วน ก./ข. ให้ถูกต้อง: ${needsSplit.slice(0, 5).join(", ")}${needsSplit.length > 5 ? " ฯลฯ" : ""}`,
    );
  }
  if (mismatch.length > 0) {
    warnings.push(`ค่าวัสดุ+ค่าแรงไม่เท่ากับราคารวมของรายการ: ${mismatch.slice(0, 5).join("; ")}`);
  }

  const directCost = material + labor;
  steps.push({ label: "ร่างประมาณราคาส่วน ก. — ค่าวัสดุอย่างน้อยที่สุด", satang: material, kind: "material" });
  steps.push({ label: "ร่างประมาณราคาส่วน ข. — ค่าแรงอย่างน้อยที่สุด", satang: labor, kind: "labor" });
  steps.push({
    label: "ต้นทุนโดยตรงของโครงการ (A)",
    formula: `ก. ${formatSatang(material)} + ข. ${formatSatang(labor)}`,
    satang: directCost,
    kind: "direct",
  });

  // 3)–4) Factor F → ปร.1(ก)
  let factorF: number | null = null;
  let afterFactor = directCost;
  if (ruleset?.factorF) {
    try {
      const r = lookupFactorF(directCost, ruleset.factorF);
      factorF = r.factor;
      afterFactor = Math.round(directCost * r.factor); // ปัดเศษ half-up เป็นสตางค์
      steps.push({
        label: `Factor F = ${r.factor.toFixed(6)}${r.interpolated ? ` (interpolate ช่วงต้นทุน [${r.row.B}, ${r.row.C}] ล้านบาท)` : " (ขอบตารางพอดี — ใช้ค่าตรง)"}`,
        formula: r.interpolated ? "F = D − (D − E) × (A − B) / (C − B)" : undefined,
        satang: afterFactor,
        kind: "factor",
        notes: [
          `A = ${formatSatang(directCost)} บาท (${(directCost / 1e8).toLocaleString("th-TH", { maximumFractionDigits: 4 })} ล้านบาท)`,
          `พารามิเตอร์ตาราง: ทดรองจ่าย ${ruleset.factorF.advancePct}% · ประกันผลงาน ${ruleset.factorF.retentionPct}% · ดอกเบี้ย ${ruleset.factorF.interestPct}% · VAT ${ruleset.factorF.vatPct}%`,
          "ปัดเศษ half-up เป็นสตางค์ (ค่าเริ่มต้นระบบ — ตรวจกับหลักเกณฑ์ที่ใช้บังคับ)",
          `ที่มาตาราง: ${ruleset.sourceDoc}`,
        ],
      });
    } catch (e) {
      if (e instanceof CalcError && e.code === "OUT_OF_TABLE") throw e; // นอกตาราง = หยุดคำนวณ (ห้าม extrapolate)
      throw e;
    }
  } else {
    warnings.push(
      "ยังไม่มีตาราง Factor F ในชุดกฎที่ pin ไว้ — คำนวณแบบไม่ปรับ (F = 1); นำเข้าตารางจากเอกสารทางการที่หน้า ชุดกฎราคากลาง",
    );
  }

  // 6) เงินเผื่อจำเป็น / ค่าดำเนินงาน — เฉพาะเมื่อ ruleset ระบุอัตรา (ห้ามเดาอัตรา)
  let contingency: Satang | null = null;
  if (ruleset?.contingencyPct !== undefined) {
    contingency = pctOf(afterFactor, ruleset.contingencyPct);
    steps.push({
      label: `เงินเผื่อจำเป็น ${ruleset.contingencyPct}% ของยอดหลังปรับ Factor F`,
      formula: `${ruleset.contingencyPct}% × ${formatSatang(afterFactor)}`,
      satang: contingency,
      kind: "contingency",
      notes: ["ปัดเศษ half-up เป็นสตางค์", `อัตราจาก: ${ruleset.sourceDoc}`],
    });
  } else {
    warnings.push("ชุดกฎไม่ได้ระบุ % เงินเผื่อจำเป็น — ส่วน ค. ยังไม่คำนวณ");
  }

  let swc: Satang | null = null;
  if (ruleset?.swcPct !== undefined) {
    const base = afterFactor + (contingency ?? 0);
    swc = pctOf(base, ruleset.swcPct);
    steps.push({
      label: `ค่าดำเนินงาน ${ruleset.swcPct}% ของยอดรวมก่อนค่าดำเนินงาน`,
      formula: `${ruleset.swcPct}% × ${formatSatang(base)}`,
      satang: swc,
      kind: "swc",
      notes: ["ปัดเศษ half-up เป็นสตางค์", `อัตราจาก: ${ruleset.sourceDoc}`],
    });
  } else {
    warnings.push("ชุดกฎไม่ได้ระบุ % ค่าดำเนินงาน — ส่วน ง. ยังไม่คำนวณ");
  }

  // 5) ครุภัณฑ์ — แยกจากฐาน Factor F ทั้งหมด
  let equipmentAmount: Satang | null = null;
  let installAmount: Satang | null = null;
  if (equipment.length > 0) {
    equipmentAmount = sumSatang(equipment.map((it) => mulQty(it.qty, it.price)));
    steps.push({
      label: "ครุภัณฑ์ (แยกจากฐาน Factor F)",
      satang: equipmentAmount,
      kind: "equipment",
      notes: ["กฎเหล็ก: ครุภัณฑ์ห้ามเข้าฐานคำนวณ Factor F — รวมท้ายเป็นบรรทัดแยก"],
    });
    if (ruleset?.durableHandlingPct !== undefined) {
      installAmount = pctOf(equipmentAmount, ruleset.durableHandlingPct);
      steps.push({
        label: `ค่าดำเนินงานครุภัณฑ์ ${ruleset.durableHandlingPct}%`,
        formula: `${ruleset.durableHandlingPct}% × ${formatSatang(equipmentAmount)}`,
        satang: installAmount,
        kind: "install",
        notes: ["อัตราจาก: " + ruleset.sourceDoc],
      });
    } else {
      warnings.push("ชุดกฎไม่ได้ระบุ % ค่าดำเนินงานครุภัณฑ์ — ค่าติดตั้ง/ดำเนินงานครุภัณฑ์ยังไม่คำนวณ");
    }
  }

  // รวมทั้งสิ้น
  const total = sumSatang([
    afterFactor,
    contingency ?? 0,
    swc ?? 0,
    equipmentAmount ?? 0,
    installAmount ?? 0,
  ]);
  steps.push({ label: "ราคากลางรวม (ก. + ข. ×F + เงินเผื่อ + ค่าดำเนินงาน + ครุภัณฑ์)", satang: total, kind: "total" });

  // open question ที่ยืนยันจากเอกสารไม่ได้ — แสดงตรงนี้เสมอ (unverified)
  warnings.push("การรวม/ไม่รวม VAT ในราคากลาง และตำแหน่งการปัดเศษของ Factor F — unverified: ตรวจกับหลักเกณฑ์ที่มีผลบังคับก่อนใช้จริง");

  return {
    rulesetId: ruleset?.id ?? null,
    material,
    labor,
    directCost,
    factorF,
    afterFactor,
    contingency,
    swc,
    equipmentAmount,
    installAmount,
    total,
    steps,
    warnings,
  };
}

// เวอร์ชันกัน throw (OUT_OF_TABLE ฯลฯ) — สำหรับ UI/editor/หน้าเอกสาร แสดง error เป็นข้อความแทนการพัง
export function computeGovBOQSafe(
  project: BoqProject,
  ruleset: Ruleset | undefined | null,
): { calc: CalcResult | null; err: string | null } {
  try {
    return { calc: computeGovBOQ(project, ruleset), err: null };
  } catch (e) {
    return { calc: null, err: e instanceof Error ? e.message : String(e) };
  }
}
