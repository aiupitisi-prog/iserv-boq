// เวกเตอร์ทดสอบ Factor F — ตาม skill thai-govt-base-price-rules
// ⚠️ ตารางในไฟล์นี้เป็น "ข้อมูลทดสอบสมมุติ" ไม่ใช่ตัวเลขกฎหมาย — ห้ามใช้อ้างอิงจริง
import { describe, expect, it } from "vitest";
import { CalcError, combineFactorF, lookupFactorF, lookupFactorFByMillion } from "./factorf";
import type { FactorFTable } from "../ruleset";

// ตารางทดสอบสมมุติ (ช่วง 10–20 ล้านบาท)
const TEST_TABLE: FactorFTable = {
  advancePct: 0,
  retentionPct: 0,
  interestPct: 0,
  vatPct: 0,
  rows: [{ B: 10, C: 20, D: 1.25, E: 1.2 }], // ข้อมูลสมมุติเพื่อทดสอบ
};

// ตารางสองช่วงต่อเนื่อง
const TEST_TABLE_2: FactorFTable = {
  advancePct: 0,
  retentionPct: 0,
  interestPct: 0,
  vatPct: 0,
  rows: [
    { B: 5, C: 10, D: 1.3, E: 1.25 }, // ข้อมูลสมมุติเพื่อทดสอบ
    { B: 10, C: 20, D: 1.25, E: 1.2 }, // ข้อมูลสมมุติเพื่อทดสอบ
  ],
};

describe("lookupFactorF (เวกเตอร์มาตรฐาน)", () => {
  it("interpolate กลางช่วง: A=15 → F = 1.2250", () => {
    const r = lookupFactorFByMillion(15, TEST_TABLE);
    expect(r.interpolated).toBe(true);
    expect(r.factor).toBeCloseTo(1.225, 10);
  });

  it("ขอบตารางพอดี A = B → ค่า D ตรง ไม่ interpolate", () => {
    const r = lookupFactorFByMillion(10, TEST_TABLE);
    expect(r.interpolated).toBe(false);
    expect(r.factor).toBe(1.25);
  });

  it("ขอบตารางพอดี A = C → ค่า E ตรง ไม่ interpolate", () => {
    const r = lookupFactorFByMillion(20, TEST_TABLE);
    expect(r.interpolated).toBe(false);
    expect(r.factor).toBe(1.2);
  });

  it("A นอกตาราง → throw CalcError OUT_OF_TABLE — ห้าม extrapolate", () => {
    expect(() => lookupFactorFByMillion(5, TEST_TABLE)).toThrow(CalcError);
    expect(() => lookupFactorFByMillion(25, TEST_TABLE)).toThrow(CalcError);
    try {
      lookupFactorFByMillion(999, TEST_TABLE);
      expect.unreachable("ควร throw ก่อนบรรทัดนี้");
    } catch (e) {
      expect(e).toBeInstanceOf(CalcError);
      expect((e as CalcError).code).toBe("OUT_OF_TABLE");
    }
  });

  it("เลือกช่วงถูกตารางเมื่อมีหลายช่วง", () => {
    const r1 = lookupFactorFByMillion(7, TEST_TABLE_2);
    expect(r1.factor).toBeCloseTo(1.3 - ((1.3 - 1.25) * (7 - 5)) / 5, 10);
    const r2 = lookupFactorFByMillion(10, TEST_TABLE_2); // ขอบร่วม — ต้องเจอแถวใดแถวหนึ่งแบบค่าตรง
    expect(r2.interpolated).toBe(false);
    // ขอบร่วมต้องจับแถวล่างเสมอ (B ≤ x ≤ C ของแถวล่าง = สิ้นสุดที่ 10) → F = 1.25 เป็นค่าตรง
    expect(r2.factor).toBe(1.25);
  });

  it("รับสตางค์: 15 ล้านบาท = 1,500,000,000 สตางค์ → F = 1.2250", () => {
    const r = lookupFactorF(1_500_000_000, TEST_TABLE);
    expect(r.factor).toBeCloseTo(1.225, 10);
  });

  it("ตารางว่าง → throw TABLE_INVALID", () => {
    const empty: FactorFTable = { advancePct: 0, retentionPct: 0, interestPct: 0, vatPct: 0, rows: [] };
    expect(() => lookupFactorFByMillion(15, empty)).toThrow(CalcError);
  });
});

describe("combineFactorF (ทุนผสม — เวกเตอร์มาตรฐาน)", () => {
  it("0.6×1.1038 + 0.4×1.1810 = 1.13468", () => {
    const r = combineFactorF([
      { proportion: 0.6, factor: 1.1038 }, // ข้อมูลสมมุติเพื่อทดสอบ
      { proportion: 0.4, factor: 1.181 }, // ข้อมูลสมมุติเพื่อทดสอบ
    ]);
    expect(r.factor).toBeCloseTo(1.13468, 10);
  });

  it("ผลรวมสัดส่วนไม่เต็ม 1 → ค่าไม่ถูก normalize (ผู้เรียกตรวจก่อนส่ง)", () => {
    const r = combineFactorF([{ proportion: 0.5, factor: 1.2 }]); // ข้อมูลสมมุติเพื่อทดสอบ
    expect(r.factor).toBeCloseTo(0.6, 10);
  });
});

// ——— ประกาศ ว 481: แถวปลายเปิด + คอลัมน์เสริม (ข้อมูลสมมุติเพื่อทดสอบ — ไม่ใช่ตัวเลขกฎหมาย) ———

// ตารางมีแถวปลายเปิด (โครงเดียวกับ ว 481: แถวแรกค่าคงที่ · กลาง interpolate · แถวสุดท้าย open)
const TEST_TABLE_OPEN: FactorFTable = {
  advancePct: 0,
  retentionPct: 0,
  interestPct: 6,
  vatPct: 7,
  rows: [
    { B: 0, C: 10, D: 1.3, E: 1.3 }, // ข้อมูลสมมุติเพื่อทดสอบ
    { B: 10, C: 20, D: 1.3, E: 1.25 }, // ข้อมูลสมมุติเพื่อทดสอบ
    { B: 20, C: 20, D: 1.25, E: 1.25, F: 1.18, G: 1.18, open: true }, // ข้อมูลสมมุติเพื่อทดสอบ
  ],
};

describe("lookupFactorFByMillion — แถวปลายเปิด (open) ตามโครงประกาศ ว 481 [ข้อมูลสมมุติ]", () => {
  it("x ในแถว open → ค่าคงที่ ไม่ interpolate ไม่ throw", () => {
    const r = lookupFactorFByMillion(25, TEST_TABLE_OPEN);
    expect(r.interpolated).toBe(false);
    expect(r.factor).toBe(1.25);
    expect(r.row.open).toBe(true);
  });

  it("x ใหญ่มาก (นอกตารางแบบเก่า) → ยังคงได้ค่าคงที่ของแถว open — ไม่ throw OUT_OF_TABLE", () => {
    expect(lookupFactorFByMillion(1_000_000, TEST_TABLE_OPEN).factor).toBe(1.25);
    expect(lookupFactorFByMillion(5_000, TEST_TABLE_OPEN).factor).toBe(1.25);
  });

  it("คอลัมน์ noVat ของแถว open คงที่ตาม F = G", () => {
    const r = lookupFactorFByMillion(99, TEST_TABLE_OPEN);
    expect(r.noVat).toBe(1.18);
  });

  it("ก่อนถึงแถว open ยังใช้ช่วงปกติ (interpolate) ได้ถูกแถว", () => {
    const r = lookupFactorFByMillion(15, TEST_TABLE_OPEN);
    expect(r.row.open).toBeUndefined();
    expect(r.factor).toBeCloseTo(1.275, 10);
  });

  it("ต่ำกว่า B ของแถวแรก → ยัง throw OUT_OF_TABLE (open ครอบเฉพาะด้านบน)", () => {
    const t: FactorFTable = { ...TEST_TABLE_OPEN, rows: TEST_TABLE_OPEN.rows.slice(1) }; // ข้อมูลสมมุติเพื่อทดสอบ — ตัดแถวที่ B=0 ออก
    expect(() => lookupFactorFByMillion(5, t)).toThrow(CalcError);
  });
});

// ตารางคอลัมน์เสริมครบ (Factor F / รวมในรูป Factor / ฝนชุก 1 / ฝนชุก 2) + แถวมี anomalyNote
const TEST_TABLE_COLS: FactorFTable = {
  advancePct: 5,
  retentionPct: 5,
  interestPct: 6,
  vatPct: 7,
  rows: [
    {
      B: 100,
      C: 200,
      D: 1.2,
      E: 1.1,
      F: 1.15,
      G: 1.05,
      D2: 1.22,
      E2: 1.12,
      D3: 1.24,
      E3: 1.14,
      anomalyNote: "ข้อมูลสมมุติเพื่อทดสอบ — ป้าย anomaly (ห้ามใช้อ้างอิงจริง)",
    },
  ],
};

describe("lookupFactorFByMillion — คอลัมน์เสริม ว 481 (noVat / ฝนชุก 1–2 / anomalyNote) [ข้อมูลสมมุติ]", () => {
  it("interpolate ทุกคอลัมน์กลางช่วง (x=150)", () => {
    const r = lookupFactorFByMillion(150, TEST_TABLE_COLS);
    expect(r.interpolated).toBe(true);
    expect(r.factor).toBeCloseTo(1.15, 10);
    expect(r.noVat).toBeCloseTo(1.1, 10);
    expect(r.rain1).toBeCloseTo(1.17, 10);
    expect(r.rain2).toBeCloseTo(1.19, 10);
  });

  it("ขอบล่าง x=B → ค่าตรงทุกคอลัมน์ (D / F / D2 / D3)", () => {
    const r = lookupFactorFByMillion(100, TEST_TABLE_COLS);
    expect(r.interpolated).toBe(false);
    expect(r.factor).toBe(1.2);
    expect(r.noVat).toBe(1.15);
    expect(r.rain1).toBe(1.22);
    expect(r.rain2).toBe(1.24);
  });

  it("ขอบบน x=C → ค่าตรงทุกคอลัมน์ (E / G / E2 / E3)", () => {
    const r = lookupFactorFByMillion(200, TEST_TABLE_COLS);
    expect(r.interpolated).toBe(false);
    expect(r.factor).toBe(1.1);
    expect(r.noVat).toBe(1.05);
    expect(r.rain1).toBe(1.12);
    expect(r.rain2).toBe(1.14);
  });

  it("anomalyNote ของแถวถูกส่งต่อในผลลัพธ์เสมอ (ผู้เรียกต้องแสดงใน trace)", () => {
    expect(lookupFactorFByMillion(150, TEST_TABLE_COLS).anomalyNote).toContain("anomaly");
  });
});
