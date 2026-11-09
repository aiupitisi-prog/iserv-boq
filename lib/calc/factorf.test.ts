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
    expect([1.25, 1.3]).toContain(r2.factor);
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
