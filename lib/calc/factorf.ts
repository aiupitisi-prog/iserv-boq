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
  factor: number; // Factor F รวม VAT (คอลัมน์หลักตามประกาศ)
  row: FactorFRow;
  interpolated: boolean;
  // — คอลัมน์เสริมตามประกาศ ว 481 (มีค่าเมื่อตารางระบุคอลัมน์นั้น) —
  noVat?: number; // "รวมในรูป Factor" (ไม่รวม VAT) — หมายเหตุ 2: งานที่ไม่ต้องชำระ VAT ให้ใช้ค่านี้
  rain1?: number; // Factor F ฝนชุก 1
  rain2?: number; // Factor F ฝนชุก 2
  anomalyNote?: string; // ป้ายแถวที่ประกาศพิมพ์ค่าเบี่ยงเบนจากแนว trend — ผู้เรียกต้องแสดงใน trace/เอกสารเสมอ
};

// หา F ที่ต้นทุนโดยตรง A (หน่วย: ล้านบาท)
export function lookupFactorFByMillion(aMillion: number, table: FactorFTable): FactorFLookup {
  const rows = [...table.rows].sort((r1, r2) => r1.B - r2.B);
  if (rows.length === 0) {
    throw new CalcError("TABLE_INVALID", "ตาราง Factor F ว่างเปล่า — ตรวจการนำเข้าชุดกฎ");
  }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // แถวปลายเปิด ("> N" / "≥ N" ของประกาศ ว 481) — ค่าคงที่ทุกค่าต้นทุนตั้งแต่ B ขึ้นไป ไม่ throw ไม่ interpolate
    if (r.open) {
      if (aMillion >= r.B - EPS) {
        return {
          factor: r.D,
          row: r,
          interpolated: false,
          ...(r.F !== undefined ? { noVat: r.F } : {}),
          ...(r.D2 !== undefined ? { rain1: r.D2 } : {}),
          ...(r.D3 !== undefined ? { rain2: r.D3 } : {}),
          ...(r.anomalyNote !== undefined ? { anomalyNote: r.anomalyNote } : {}),
        };
      }
      continue;
    }
    if (aMillion >= r.B - EPS && aMillion <= r.C + EPS) {
      // ขอบตารางพอดี → ค่าตรง ไม่ interpolate; ในช่วง → interpolate เชิงเส้น F = D − (D − E) × (A − B) / (C − B)
      const at = (lo: number, hi: number) =>
        Math.abs(aMillion - r.B) <= EPS
          ? lo
          : Math.abs(aMillion - r.C) <= EPS
            ? hi
            : lo + ((hi - lo) * (aMillion - r.B)) / (r.C - r.B);
      // interpolated = ค่าแปรผันจริง — ช่วงค่าคงที่ (D เท่ากับ E) ไม่ถือเป็นการ interpolate แม้อยู่กลางช่วง
      const interpolated = Math.abs(aMillion - r.B) > EPS && Math.abs(aMillion - r.C) > EPS && r.D !== r.E;
      const res: FactorFLookup = {
        factor: at(r.D, r.E),
        row: r,
        interpolated,
        ...(r.F !== undefined && r.G !== undefined ? { noVat: at(r.F, r.G) } : {}),
        ...(r.D2 !== undefined && r.E2 !== undefined ? { rain1: at(r.D2, r.E2) } : {}),
        ...(r.D3 !== undefined && r.E3 !== undefined ? { rain2: at(r.D3, r.E3) } : {}),
        ...(r.anomalyNote !== undefined ? { anomalyNote: r.anomalyNote } : {}),
      };
      return res;
    }
  }
  const lo = rows[0].B;
  const last = rows[rows.length - 1];
  const range = last.open
    ? `${lo} ล้านบาท ถึง ปลายเปิดตั้งแต่ ${last.B} ล้านบาทขึ้นไป`
    : `${lo}–${last.C} ล้านบาท`;
  throw new CalcError(
    "OUT_OF_TABLE",
    `ต้นทุนโดยตรง ${aMillion.toLocaleString("th-TH", { maximumFractionDigits: 4 })} ล้านบาท อยู่นอกช่วงตาราง Factor F (${range}) — ห้ามประมาณค่านอกตาราง (extrapolate)`,
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
