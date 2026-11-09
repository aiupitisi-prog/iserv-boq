// Factor F lookup — กฎเหล็ก (skill thai-govt-base-price-rules):
// - ตารางมาจาก ruleset registry เท่านั้น — ห้ามคำนวณ F จากองค์ประกอบเอง (advance/retention/interest/VAT)
// - ขอบตารางพอดี (A = B หรือ C) → ใช้ค่าแถวนั้นตรง ๆ ไม่ interpolate
// - ในช่วง → F = D − (D − E) × (A − B) / (C − B)
// - นอกตาราง → throw typed error — ห้าม extrapolate

import type { FactorFRow, FactorFTable } from "../ruleset";

export class CalcError extends Error {
  code: "OUT_OF_TABLE" | "TABLE_INVALID" | "NO_TABLE";
  constructor(code: "OUT_OF_TABLE" | "TABLE_INVALID" | "NO_TABLE", message: string) {
    super(message);
    this.code = code;
    this.name = "CalcError";
  }
}

const EPS = 1e-9;

export type FactorFLookup = {
  factor: number;
  row: FactorFRow;
  interpolated: boolean;
};

// หา F ที่ต้นทุนโดยตรง A (หน่วย: ล้านบาท)
export function lookupFactorFByMillion(aMillion: number, table: FactorFTable): FactorFLookup {
  const rows = [...table.rows].sort((r1, r2) => r1.B - r2.B);
  if (rows.length === 0) {
    throw new CalcError("TABLE_INVALID", "ตาราง Factor F ว่างเปล่า — ตรวจการนำเข้าชุดกฎ");
  }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (aMillion >= r.B - EPS && aMillion <= r.C + EPS) {
      // ขอบตารางพอดี → ค่าตรง ไม่ interpolate
      if (Math.abs(aMillion - r.B) <= EPS) return { factor: r.D, row: r, interpolated: false };
      if (Math.abs(aMillion - r.C) <= EPS) return { factor: r.E, row: r, interpolated: false };
      // ในช่วง → interpolate เชิงเส้น F = D − (D − E) × (A − B) / (C − B)
      const factor = r.D - ((r.D - r.E) * (aMillion - r.B)) / (r.C - r.B);
      return { factor, row: r, interpolated: true };
    }
  }
  const lo = rows[0].B;
  const hi = rows[rows.length - 1].C;
  throw new CalcError(
    "OUT_OF_TABLE",
    `ต้นทุนโดยตรง ${aMillion.toLocaleString("th-TH", { maximumFractionDigits: 4 })} ล้านบาท อยู่นอกช่วงตาราง Factor F (${lo}–${hi} ล้านบาท) — ห้ามประมาณค่านอกตาราง (extrapolate)`,
  );
}

// รับต้นทุนเป็นสตางค์ → แปลงเป็นล้านบาทแล้ว lookup (1 ล้านบาท = 100,000,000 สตางค์)
export function lookupFactorF(directCostSatang: number, table: FactorFTable): FactorFLookup {
  return lookupFactorFByMillion(directCostSatang / 1e8, table);
}

// ทุนผสม (mixed funding) — ค่าเฉลี่ยถ่วงน้ำหนักของหลาย Factor F
// เวกเตอร์มาตรฐาน: 0.6×1.1038 + 0.4×1.1810 = 1.13468 (เอกสารบางฉบับแสดง 1.1346 — หมายเหตุการปัดเศษ)
export function combineFactorF(parts: { proportion: number; factor: number }[]): {
  factor: number;
  note: string;
} {
  let factor = 0;
  for (const p of parts) factor += p.proportion * p.factor;
  return {
    factor,
    note: "ค่าเฉลี่ยถ่วงน้ำหนัก — เอกสารบางฉบับแสดงทศนิยม 4 ตำแหน่ง ตรวจวิธีปัดเศษกับเอกสารต้นทางก่อนใช้จริง",
  };
}
