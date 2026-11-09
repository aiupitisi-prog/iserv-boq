// การปรับลดราคาจากผู้เสนอราคา — เอกสาร "แบบแสดงรายการ ปริมาณงาน และราคา (แนบท้ายสัญญา)"
//
// หลักการ (อ้างอิงพฤติกรรมของตัวอย่าง "ระบบคำนวณปรับลดราคา ว 651" ที่ผู้ใช้แนบมา):
//   (1) ราคากลางส่วนรายการ BOQ = ก.+ข. ของแต่ละรายการ ×Factor F (ปรับสัดส่วนจากระดับโครงการ)
//       + ครุภัณฑ์แยกฐานตามราคาของตัวเอง (กฎเหล็ก: ครุภัณฑ์ห้ามเข้าฐาน Factor F)
//   (2) ราคาตามคำเสนอของผู้ได้รับคัดเลือก − ส่วนคงเดิม (เงินเผื่อจำเป็น/ค่าดำเนินงาน/
//       ค่าดำเนินงานครุภัณฑ์ — บรรทัดสรุประดับโครงการจากชุดกฎ ไม่ใช่รายการ BOQ ตาราง)
//   (3) อัตราปรับลด = [(1) − (2)] ÷ (1) — ลดทุกรายการ BOQ ด้วยอัตราร้อยละเดียวกัน
//   (4) เศษจากการปัดเศษเหวี่ยงเข้ารายการที่มีราคามากที่สุด → ผลรวมทุกบรรทัด = วงเงินตามสัญญาพอดี
//
// กฎเหล็ก: ตัวเงินเป็นสตางค์ integer ทุกขั้น; การแจกสัดส่วนใช้ BigInt กัน overflow/precision;
// ทุกข้อที่ยืนยันจากเอกสารที่มีผลบังคับไม่ได้ → warnings "unverified" เสมอ (ห้ามเดาข้อกฎหมาย)

import type { BoqProject } from "../boq";
import type { CalcResult } from "./compute";
import { formatSatang, mulQty, toSatang, type Satang } from "./money";

export type ReducedPriceLine = {
  itemId: string;
  part: "construction" | "equipment";
  section: string;
  name: string;
  unit: string;
  qty: number;
  medianSat: Satang; // ราคากลางรายการ (construction ผ่านสัดส่วน ×F, ครุภัณฑ์ตามต้นทุนตัวเอง)
  reducedSat: Satang; // ราคาตามปรับลด — เป็นเงินรวมรายการ (สตางค์, ผลรวมทุกแถว = วงเงินตามสัญญา)
  reducedUnitBaht: number; // ราคา/หน่วยตามปรับลด — float แสดงผลเท่านั้น (ห้ามนำไปคำนวณต่อ)
};

export type PriceReductionResult = {
  ok: boolean;
  error?: string;
  lines: ReducedPriceLine[];
  balanceItemId: string | null; // รายการที่รับเศษจากการปัดเศษ (รายการเงินมากที่สุด)
  balanceAppliedSat: Satang; // สตางค์ที่เหวี่ยงเข้ารายการดังกล่าว (อาจติดลบ) — 0 = ทุกบรรทัดลงตัว
  remainderSat: Satang;
  reducibleBaseSat: Satang; // (1) ราคากลางส่วนรายการ BOQ
  fixedLines: { label: string; satang: Satang }[]; // ส่วนคงเดิม (ไม่เข้าการปรับลด)
  fixedTotalSat: Satang;
  winningSat: Satang; // ราคาตามคำเสนอของผู้ได้รับคัดเลือก
  winItemsSat: Satang; // (2) ราคาตามคำเสนอ − ส่วนคงเดิม
  diffSat: Satang; // (3) = (1) − (2)
  reducePct: number | null; // % ปรับลด = (3)/(1) — ตัวเลขแสดงผลเท่านั้น
  reducibleTotalFromEngineSat: Satang; // afterFactor + equipmentAmount (ยอดเครื่องยนต์ ไว้เทียบยอด)
  warnings: string[];
};

// แจกสัดส่วน half-up: part × num ÷ denom (ค่าล้วนไม่เป็นลบ) — ใช้ BigInt กัน precision
// ปัด 0.5 ขึ้น: floor((2·part·num + denom) / (2·denom))
function proportionSat(part: Satang, num: Satang, denom: Satang): Satang {
  if (denom <= 0 || part <= 0 || num <= 0) return 0;
  const m = BigInt(part) * BigInt(num);
  const d = BigInt(denom);
  const two = BigInt(2);
  return Number((two * m + d) / (two * d));
}

export function computePriceReduction(
  project: BoqProject,
  calc: CalcResult,
  winningPrice: number,
): PriceReductionResult {
  const warnings: string[] = [];

  // ราคากลางรายการ — construction ปรับสัดส่วนจาก F ระดับโครงการ (afterFactor/directCost)
  // ครุภัณฑ์ใช้ราคาตัวเองตรง ๆ (กฎเหล็กแยกฐาน Factor F)
  const afterFactor = calc.afterFactor ?? calc.directCost;
  const medians = new Map<string, Satang>();
  let reducibleBase: Satang = 0;
  for (const it of project.items) {
    const base = mulQty(it.qty, it.price);
    const median = it.part === "equipment" ? base : proportionSat(base, afterFactor, calc.directCost);
    medians.set(it.id, median);
    reducibleBase += median;
  }

  // ส่วนคงเดิม — บรรทัดสรุประดับโครงการจากชุดกฎ ไม่ใช่รายการตาราง BOQ
  const fixedLines: { label: string; satang: Satang }[] = [];
  if (calc.contingency) {
    fixedLines.push({ label: "เงินเผื่อจำเป็น (ส่วน ค. — คงเดิมตามชุดกฎ)", satang: calc.contingency });
  }
  if (calc.swc) {
    fixedLines.push({ label: "ค่าดำเนินงาน S.W.C. (ส่วน ง. — คงเดิมตามชุดกฎ)", satang: calc.swc });
  }
  if (calc.installAmount) {
    fixedLines.push({ label: "ค่าดำเนินงานครุภัณฑ์ — คงเดิมตามชุดกฎ", satang: calc.installAmount });
  }
  const fixedTotal = fixedLines.reduce((a, b) => a + b.satang, 0);
  const reducibleTotalFromEngine = afterFactor + (calc.equipmentAmount ?? 0);

  if (calc.factorF === null) {
    warnings.push(
      "ราคากลางยังไม่ผ่านตาราง Factor F (ชุดกฎที่ pin ไม่มีตาราง) — ราคากลางรายการใช้ต้นทุนโดยตรงชั่วคราว; ควรนำเข้าตารางจากเอกสารทางการก่อนใช้จริง",
    );
  }
  if (reducibleBase !== reducibleTotalFromEngine) {
    warnings.push(
      `ผลรวมราคากลางรายการที่ปัดเศษรายการ (${formatSatang(reducibleBase)} บาท) ต่างจากยอดรวมของเครื่องยนต์ (${formatSatang(
        reducibleTotalFromEngine,
      )} บาท) จากการปัดเศษระดับรายการ — การปรับลดยังใช้ฐานรายการเป็นหลัก`,
    );
  }

  const winningSat = toSatang(winningPrice);
  const winItems = winningSat - fixedTotal;

  const err = (error: string): PriceReductionResult => ({
    ok: false,
    error,
    lines: [],
    balanceItemId: null,
    balanceAppliedSat: 0,
    remainderSat: 0,
    reducibleBaseSat: reducibleBase,
    fixedLines,
    fixedTotalSat: fixedTotal,
    winningSat,
    winItemsSat: Math.max(winItems, 0),
    diffSat: Math.max(reducibleBase - Math.max(winItems, 0), 0),
    reducePct: null,
    reducibleTotalFromEngineSat: reducibleTotalFromEngine,
    warnings,
  });

  if (!winningSat) {
    return err("ยังไม่ได้กรอกราคาตามคำเสนอของผู้ได้รับคัดเลือก หรือจำนวนเงินไม่ถูกต้อง");
  }
  if (winItems < 0) {
    return err(
      `ราคาตามคำเสนอ (${formatSatang(winningSat)} บาท) น้อยกว่าส่วนที่คงเดิมตามชุดกฎ (${formatSatang(fixedTotal)} บาท) — อย่างน้อยวงเงินตามสัญญาต้องคลอมค่าส่วนคงเดิมเหล่านี้; ตรวจจำนวนเงินที่กรอก`,
    );
  }
  if (reducibleBase <= 0) {
    return err("BOQ ไม่มีรายการราคา (ปริมาณ/ราคาต่อหน่วยเป็นศูนย์) — เพิ่มรายการงานที่ editor ก่อนจัดทำแนบท้ายสัญญา");
  }
  if (winItems >= reducibleBase) {
    return err(
      winItems === reducibleBase
        ? "ราคาตามคำเสนอเท่ากับราคากลางส่วนรายการ — ไม่ต้องปรับลดราคา (เอกสารนี้ใช้เมื่อราคาที่ชนะต่ำกว่าราคากลาง)"
        : "ราคาตามคำเสนอสูงกว่าราคากลางส่วนรายการ — ตรวจจำนวนเงินที่กรอก (การปรับลดราคาใช้เมื่อราคาตามคำเสนอต่ำกว่าราคากลาง)",
    );
  }

  // (3) อัตราปรับลด = [(1) − (2)] ÷ (1) — แจกให้ทุกรายการด้วยสัดส่วนเดียวกัน (half-up ต่อแถว)
  let reducedSum: Satang = 0;
  const reduced = new Map<string, Satang>();
  for (const it of project.items) {
    const r = proportionSat(medians.get(it.id) ?? 0, winItems, reducibleBase);
    reduced.set(it.id, r);
    reducedSum += r;
  }

  // Auto-Balancing — เศษการปัดเศษเหวี่ยงเข้ารายการที่มีราคาปรับลดแล้วมากที่สุด (ให้ผลรวมพอดี 100%)
  let remainder = winItems - reducedSum;
  let balanceItemId: string | null = null;
  let balanceAppliedSat: Satang = 0;
  if (remainder !== 0) {
    let bestId: string | null = null;
    let bestSat: Satang = -1;
    for (const it of project.items) {
      const r = reduced.get(it.id) ?? 0;
      if (r > bestSat) {
        bestSat = r;
        bestId = it.id;
      }
    }
    if (bestId !== null) {
      reduced.set(bestId, (reduced.get(bestId) ?? 0) + remainder);
      balanceItemId = bestId;
      balanceAppliedSat = remainder;
      reducedSum += remainder;
      remainder = 0;
    }
  }
  // reducedSum === winItems เสมอ (กันตัวเลขพาดในเอกสาร — ถ้าไม่ตรงถือเป็นความพังของระบบ ต้องแจ้ง)
  if (reducedSum !== winItems) {
    warnings.push(`ผลรวมทุกบรรทัด (${formatSatang(reducedSum)} บาท) ไม่เท่ากับเป้าหมาย (${formatSatang(winItems)} บาท) — ห้ามใช้เอกสารจนแก้ให้ตรงก่อน`);
  }

  const diff = reducibleBase - winItems;

  // unverified — ยังไม่พิสูจน์กับเอกสารที่มีผลบังคับ
  warnings.push(
    "อัลกอริทึมการปรับลดราคา (อัตราร้อยละเดียวกันทุกรายการ BOQ หักส่วนคงเดิมก่อน เศษปัดเศษเหวี่ยงรายการเงินมากที่สุด) อ้างอิงพฤติกรรมจากตัวอย่างระบบปรับลดราคา (ว 651) ที่ผู้ใช้แนบ — unverified: ตรวจกับแนวทางการจัดทำ/แก้ไขแบบแสดงรายการ ปริมาณงาน และราคา ที่มีผลบังคับก่อนใช้จริง",
  );
  warnings.push(
    "การกำหนดส่วนคงเดิม (เงินเผื่อจำเป็น/ค่าดำเนินงาน/ค่าดำเนินงานครุภัณฑ์ไม่เข้าการปรับลดรายการ) — unverified: แนวทางที่มีผลบังคับอาจกำหนดให้ปรับลดส่วนเหล่านี้ด้วยแล้วแต่เงื่อนไข",
  );
  warnings.push(
    "ตัวอย่างที่แนบมีสวิตช์ 3 จังหวัดชายแดนภาคใต้ คูณ 1.05 ที่ราคากลางรายการ — ระบบยังไม่ใส่ตัวคูณนี้ เพราะพิสูจน์ตัวเลขจากเอกสารที่มีผลบังคับยังไม่ได้ (ถ้ามีหลักเกณฑ์จริง ให้เพิ่มเป็นอัตราในชุดกฎราคาก่อนใช้)",
  );

  const lines: ReducedPriceLine[] = project.items.map((it) => {
    const r = reduced.get(it.id) ?? 0;
    return {
      itemId: it.id,
      part: it.part === "equipment" ? "equipment" : "construction",
      section: it.section,
      name: it.name,
      unit: it.unit,
      qty: it.qty,
      medianSat: medians.get(it.id) ?? 0,
      reducedSat: r,
      reducedUnitBaht: it.qty > 0 ? r / 100 / it.qty : 0, // แสดงผลเท่านั้น
    };
  });

  return {
    ok: true,
    lines,
    balanceItemId,
    balanceAppliedSat,
    remainderSat: remainder,
    reducibleBaseSat: reducibleBase,
    fixedLines,
    fixedTotalSat: fixedTotal,
    winningSat,
    winItemsSat: winItems,
    diffSat: diff,
    reducePct: (diff / reducibleBase) * 100,
    reducibleTotalFromEngineSat: reducibleTotalFromEngine,
    warnings,
  };
}
