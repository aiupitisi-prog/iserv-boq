// เครื่องยนต์คำนวณราคากลาง (F3.5) — pure function: compute(project, ruleset) → Result + trace ทุกขั้น
//
// ลำดับบังคับตาม skill thai-govt-base-price-rules:
//   1) รายการ → รวมเงินต่อรายการ (ปริมาณ × ราคา/หน่วย)
//   2) รวม "ต้นทุนโดยตรงของโครงการ" (A) — แยก ก. ค่าวัสดุ / ข. ค่าแรง — ครุภัณฑ์ห้ามเข้าฐานนี้
//   3) Factor F จากตารางใน ruleset เท่านั้น (ประกาศ ว 481 = ชุด 48 ตาราง เลือกตามเงื่อนไขสัญญา project.factorFCond
//      ผ่าน selectFactorFTable; ชุดกฎเก่าใช้ตารางเดี่ยว ruleset.factorF) — ขอบตาราง = ค่าตรง, ในช่วง = interpolate,
//      ช่วงปลายเปิด (open) = ค่าคงที่, นอกช่วง = throw
//   4) ปร.1(ก) = A × F
//   5) ครุภัณฑ์: แยกฐาน + ค่าดำเนินงานครุภัณฑ์เป็นบรรทัดแยก
//   6) เงินเผื่อจำเป็น / ค่าดำเนินงาน — เฉพาะเมื่อ ruleset ระบุอัตรา (ไม่มีค่าจากความจำ)
//
// กฎเหล็กที่บังคับในโค้ดนี้:
// - ตัวเงินเป็นสตางค์ integer ทุกขั้น — float ห้ามเข้าการคำนวณ (แปลงครั้งเดียวที่ขอบเขต)
// - ทุกจุดปัดเศษบันทึกหมายเหตุใน trace
// - ข้อสมมติที่ยืนยันจากเอกสารไม่ได้ → เขียน "unverified" ใน warnings เสมอ

import type { BoqItem, BoqProject } from "../boq";
import type { FactorFTable, Ruleset } from "../ruleset";
import { selectFactorFTable } from "../ruleset";
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
// export เพื่อให้ lib/report2569 (ชุดเอกสาร 9 ชิ้น) ใช้เงื่อนไขเดียวกันเป๊ะ — ห้ามเขียนสแปลิตซ้ำ
export function splitItem(it: BoqItem): { mat: Satang | null; lab: Satang | null; needsSplit: boolean } {
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
  // กฎเหล็ก trace: แจ้งการปัดเศษระดับรายการ — ราคา/หน่วยปัดเป็นสตางค์ก่อนคูณปริมาณ (mulQty)
  const unitRoundNote = "ราคา/หน่วยของแต่ละรายการปัดเศษ half-up เป็นสตางค์ก่อนคูณด้วยปริมาณ (mulQty)";
  steps.push({ label: "ร่างประมาณราคาส่วน ก. — ค่าวัสดุอย่างน้อยที่สุด", satang: material, kind: "material", notes: [unitRoundNote] });
  steps.push({ label: "ร่างประมาณราคาส่วน ข. — ค่าแรงอย่างน้อยที่สุด", satang: labor, kind: "labor", notes: [unitRoundNote] });
  steps.push({
    label: "ต้นทุนโดยตรงของโครงการ (A)",
    formula: `ก. ${formatSatang(material)} + ข. ${formatSatang(labor)}`,
    satang: directCost,
    kind: "direct",
  });

  // 3)–4) Factor F → ปร.1(ก)
  // ประกาศ ว 481 (ลง 26 มิ.ย. 2569): ตารางแยกตาม ประเภทงาน × (ค่าจ้างล่วงหน้า % × เงินประกันผลงาน %) = 48 ตาราง —
  // เครื่องยนต์เลือกตารางจาก ruleset.factorFTables ด้วย project.factorFCond เสมอเมื่อชุดกฎมีชุดตาราง;
  // ชุดกฎที่ให้ตารางเดี่ยว (ruleset.factorF) ใช้ตรง ๆ (backward-compat กับเฟส 2)
  let factorF: number | null = null;
  let afterFactor = directCost;
  const cond = project.factorFCond;
  let table: FactorFTable | null = null;
  if (ruleset?.factorFTables && ruleset.factorFTables.length > 0) {
    if (!cond) {
      warnings.push(
        "ชุดกฎนี้มีตาราง Factor F แบบแยกตามเงื่อนไขสัญญา (ประเภทงาน × ค่าจ้างล่วงหน้า × เงินประกันผลงาน) แต่โปรเจกต์ยังไม่ระบุเงื่อนไข (factorFCond) — ยังไม่ปรับ Factor F (F = 1); ระบุเงื่อนไขในหน้าโครงการก่อน",
      );
    } else {
      table = selectFactorFTable(ruleset.factorFTables, cond);
      if (!table) {
        warnings.push(
          `ไม่พบตาราง Factor F ตามเงื่อนไขสัญญา (ประเภทงาน ${cond.workType} · ทดรองจ่าย ${cond.advancePct}% · ประกันผลงาน ${cond.retentionPct}%) ในชุดกฎ — ยังไม่ปรับ Factor F (F = 1); ตรวจเงื่อนไขหรือชุดกฎที่ pin ไว้`,
        );
      }
    }
  } else if (ruleset?.factorF) {
    table = ruleset.factorF;
  } else {
    warnings.push(
      "ยังไม่มีตาราง Factor F ในชุดกฎที่ pin ไว้ — คำนวณแบบไม่ปรับ (F = 1); นำเข้าตารางจากเอกสารทางการที่หน้า ชุดกฎราคากลาง",
    );
  }
  if (table) {
    // OUT_OF_TABLE จาก lookupFactorF จะ propagate ขึ้นไปทันที = หยุดคำนวณ (ห้าม extrapolate;
    // ผู้เรียกระดับ UI/docs ใช้ computeGovBOQSafe ถ้าอยากแสดงแจ้งเตือนแทนการ throw)
    const r = lookupFactorF(directCost, table);
    // เลือกคอลัมน์ที่ใช้จริงตามเงื่อนไขสัญญา — ขาดคอลัมน์ → เตือนแล้วใช้คอลัมน์ปกติ (รวม VAT)
    let applied = r.factor;
    let appliedLabel = "Factor F";
    const colNotes: string[] = [];
    if (cond?.noVat) {
      if (r.noVat !== undefined) {
        applied = r.noVat;
        appliedLabel = 'Factor F "รวมในรูป Factor" (ไม่รวม VAT — หมายเหตุ 2 ของประกาศ)';
      } else {
        colNotes.push('เงื่อนไขระบุไม่ชำระ VAT (noVat) แต่ตารางที่เลือกไม่มีคอลัมน์ "รวมในรูป Factor" — ใช้คอลัมน์ Factor F ปกติ (รวม VAT) แทน');
      }
    }
    if (cond?.rain) {
      const rainVal = cond.rain === 1 ? r.rain1 : r.rain2;
      if (rainVal !== undefined) {
        applied = rainVal;
        appliedLabel = `Factor F ฝนชุก ${cond.rain}`;
      } else {
        colNotes.push(`เงื่อนไขระบุพื้นที่ฝนชุก ${cond.rain} แต่ตารางที่เลือกไม่มีคอลัมน์ Factor F ฝนชุก — ใช้คอลัมน์ Factor F ปกติ (รวม VAT) แทน`);
      }
    }
    if (cond?.noVat && cond?.rain) {
      const bothMsg =
        "เงื่อนไขระบุทั้งไม่ชำระ VAT และฝนชุก — ตารางของประกาศไม่มีคอลัมน์ “รวมในรูป Factor” แยกตามฝนชุก จึงใช้คอลัมน์ฝนชุก (รวม VAT) — unverified: ตรวจยืนยันกับเอกสารก่อนใช้จริง";
      colNotes.push(bothMsg);
      warnings.push(bothMsg); // ยกขึ้นกล่องเตือน (นอกจาก step note) — ค่าที่ใช้วิ่งเข้ายอดรวมจริง ผู้ใช้ต้องเห็นเด่น ๆ
    }
    factorF = applied;
    afterFactor = Math.round(directCost * applied); // ปัดเศษ half-up เป็นสตางค์
    const openLabel = r.row.open
      ? " (ช่วงปลายเปิด — ค่าคงที่ตามประกาศ)"
      : r.interpolated
        ? ` (interpolate ช่วงต้นทุน [${r.row.B}, ${r.row.C}] ล้านบาท)`
        : r.row.D === r.row.E
          ? " (ช่วงค่าคงที่)"
          : " (ขอบตารางพอดี — ใช้ค่าตรง)";
    steps.push({
      label: `${appliedLabel} = ${applied.toFixed(6)}${openLabel}`,
      formula: !r.row.open && r.interpolated ? "F = D − (D − E) × (A − B) / (C − B)" : undefined,
      satang: afterFactor,
      kind: "factor",
      notes: [
        `A = ${formatSatang(directCost)} บาท (${(directCost / 1e8).toLocaleString("th-TH", { maximumFractionDigits: 4 })} ล้านบาท)`,
        `ตารางที่ใช้: ${table.workType ? `ประเภทงาน ${table.workType} · ` : ""}ทดรองจ่าย ${table.advancePct}% · ประกันผลงาน ${table.retentionPct}% · ดอกเบี้ย ${table.interestPct}% · VAT ${table.vatPct}%`,
        "ปัดเศษ half-up เป็นสตางค์ (ค่าเริ่มต้นระบบ — ตรวจกับหลักเกณฑ์ที่ใช้บังคับ)",
        `ที่มาตาราง: ${ruleset?.sourceDoc}`,
        ...colNotes,
        ...(r.anomalyNote ? [`แถวตารางมีหมายเหตุเบี่ยงเบนจากต้นฉบับ: ${r.anomalyNote}`] : []),
      ],
    });
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
