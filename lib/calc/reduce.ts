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
import { formatSatang, mulQty, proportionSat, toSatang, type Satang } from "./money";

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
  baseSource: "reg2569" | "engine"; // ที่มาของฐานราคากลางรายการ (reg2569 = ปร.4, engine = เครื่องยนต์เดิม)
  warnings: string[];
};

// ฐานราคากลางส่วนรายการจากชุด 9 ชิ้น (Reg2569Report.contractBase) — ผู้เรียกต้องส่งมาเสมอ
// เพื่อให้ผลรวมของสัญญาตรงกับ ปร.4 (รวม VAT/ค่าติดตั้งครุภัณฑ์) ไม่ใช่ยอดเครื่องยนต์เดิม
export type PriceReductionBase = {
  lines: { itemId: string; baseSat: Satang }[];
  totalSat: Satang;
};

export function computePriceReduction(
  project: BoqProject,
  calc: CalcResult,
  winningPrice: number,
  base?: PriceReductionBase,
): PriceReductionResult {
  const warnings: string[] = [];

  // ราคากลางรายการ — construction ปรับสัดส่วนจาก F ระดับโครงการ (afterFactor/directCost)
  // ครุภัณฑ์ใช้ราคาตัวเองตรง ๆ (กฎเหล็กแยกฐาน Factor F)
  const afterFactor = calc.afterFactor ?? calc.directCost;
  const reducibleTotalFromEngine = afterFactor + (calc.equipmentAmount ?? 0);

  // B1 — ฐานจากชุด 9 ชิ้น (ปร.4) ต้องครบทุก item และ Σ รายการ = totalSat ก่อนใช้
  let baseError: string | null = null;
  const baseMap = new Map<string, Satang>();
  if (base) {
    for (const l of base.lines) {
      if (baseMap.has(l.itemId)) {
        baseError = `ฐานราคากลางมีรายการซ้ำ (itemId ${l.itemId}) — ห้ามใช้เอกสารจนกว่าจะแก้`;
      }
      baseMap.set(l.itemId, l.baseSat);
    }
    const missing = project.items.filter((it) => !baseMap.has(it.id));
    if (missing.length > 0) {
      baseError = `ฐานราคากลางจากชุด 9 ชิ้นไม่ครบทุกบรรทัด BOQ (ขาด ${missing.length} รายการ) — คำนวณชุด 9 ชิ้นใหม่ก่อนจัดทำแนบท้ายสัญญา`;
    }
    if (base.lines.length !== project.items.length && !baseError) {
      baseError = `ฐานราคากลางมี ${base.lines.length} บรรทัด แต่ BOQ มี ${project.items.length} รายการ — ห้ามใช้เอกสารจนกว่าจะตรงกัน`;
    }
    const baseSum = base.lines.reduce((a, l) => a + l.baseSat, 0);
    if (baseSum !== base.totalSat && !baseError) {
      baseError = `ผลรวมฐานราคากลางรายการ (${formatSatang(baseSum)} บาท) ไม่เท่ากับยอดรวมที่แจ้ง (${formatSatang(
        base.totalSat,
      )} บาท) — ห้ามใช้เอกสารจนกว่าจะแก้`;
    }
  }

  const medians = new Map<string, Satang>();
  let reducibleBase: Satang = 0;
  if (base) {
    for (const it of project.items) {
      const b = baseMap.get(it.id) ?? 0;
      medians.set(it.id, b);
      reducibleBase += b;
    }
  } else {
    for (const it of project.items) {
      const b = mulQty(it.qty, it.price);
      const median = it.part === "equipment" ? b : proportionSat(b, afterFactor, calc.directCost);
      medians.set(it.id, median);
      reducibleBase += median;
    }
  }

  // ส่วนคงเดิม — บรรทัดสรุประดับโครงการจากชุดกฎ ไม่ใช่รายการตาราง BOQ
  // ใช้เฉพาะโหมด engine: ฐานจาก ปร.4 รวมทุกองค์ประกอบในรายการแล้ว (ไม่มีส่วนนอก BOQ ที่ต้องหักก่อน)
  const fixedLines: { label: string; satang: Satang }[] = [];
  if (!base) {
    if (calc.contingency) {
      fixedLines.push({ label: "เงินเผื่อจำเป็น (ส่วน ค. — คงเดิมตามชุดกฎ)", satang: calc.contingency });
    }
    if (calc.swc) {
      fixedLines.push({ label: "ค่าดำเนินงาน S.W.C. (ส่วน ง. — คงเดิมตามชุดกฎ)", satang: calc.swc });
    }
    if (calc.installAmount) {
      fixedLines.push({ label: "ค่าดำเนินงานครุภัณฑ์ — คงเดิมตามชุดกฎ", satang: calc.installAmount });
    }
  }
  const fixedTotal = fixedLines.reduce((a, b) => a + b.satang, 0);

  if (calc.factorF === null) {
    warnings.push(
      "ราคากลางยังไม่ผ่านตาราง Factor F (ชุดกฎที่ pin ไม่มีตาราง) — ราคากลางรายการใช้ต้นทุนโดยตรงชั่วคราว; ควรนำเข้าตารางจากเอกสารทางการก่อนใช้จริง",
    );
  }
  if (!base && reducibleBase !== reducibleTotalFromEngine) {
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
    baseSource: base ? "reg2569" : "engine",
    warnings,
  });

  if (baseError) return err(baseError);
  if (!winningSat) {
    return err("ยังไม่ได้กรอกราคาตามคำเสนอของผู้ได้รับคัดเลือก หรือจำนวนเงินไม่ถูกต้อง");
  }
  // ค่าใช้จ่ายพิเศษ (ปร.3) เป็นรายการนอก BOQ ที่ยังไม่มีแนวทางปรับลด/คงเดิมที่ยืนยันได้ —
  // ห้ามเดา: บล็อกเอกสารจนกว่าจะกำหนดแนวทาง (ผลรวมสัญญาจะผิดถ้ากระจายส่วนนี้ลงรายการ BOQ)
  const specialExpenses = (project.specialExpenses ?? []).filter((e) => e.amount !== 0);
  if (specialExpenses.length > 0) {
    return err(
      `โครงการมีค่าใช้จ่ายพิเศษตามข้อกำหนด (ปร.3) ${specialExpenses.length} รายการ — ยังไม่รองรับการนำเข้าแนบท้ายสัญญา/การปรับลด; ต้องกำหนดแนวทางคงเดิมหรือปรับลดที่ยืนยันได้ก่อนจัดทำเอกสาร`,
    );
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
  if (!base) {
    warnings.push(
      "การกำหนดส่วนคงเดิม (เงินเผื่อจำเป็น/ค่าดำเนินงาน/ค่าดำเนินงานครุภัณฑ์ไม่เข้าการปรับลดรายการ) — unverified: แนวทางที่มีผลบังคับอาจกำหนดให้ปรับลดส่วนเหล่านี้ด้วยแล้วแต่เงื่อนไข",
    );
  }
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
    baseSource: base ? "reg2569" : "engine",
    warnings,
  };
}
