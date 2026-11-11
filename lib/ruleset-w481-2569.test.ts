// ทดสอบ "ชุดข้อมูลจริง" ว 481 (ไม่ใช่ข้อมูลสมมุติ) — ค่า golden อ้างจากตัวประกาศตามไฟล์ dataset ที่ checksum ผูกไว้
// ⚠️ แหล่ง PDF (Yotathai) ไม่ใช่ทางการ — ก่อนใช้จริงต้องยืนยันกับราชกิจจานุเบกษา/เล่มจริง (ดู notices ใน dataset)
// รายการสมมุติมีเฉพาะ BoqItem ใน describe เครื่องยนต์ (ติดป้าย "ข้อมูลสมมุติเพื่อทดสอบ" ทุกตัว)
import { describe, expect, it } from "vitest";
import type { BoqProject } from "./boq";
import type { WorkTypeCode } from "./ruleset";
import { factorFAt, selectFactorFTable, validateFactorFTable } from "./ruleset";
import {
  getW481Ruleset,
  verifyW481Checksums,
  W481_2569_PDF_SHA256,
  W481_2569_SET_CHECKSUM,
  W481_2569_TABLES,
  W481_2569_TABLE_IDS,
} from "./ruleset-w481-2569";
import { lookupFactorFByMillion } from "./calc/factorf";
import { computeGovBOQ } from "./calc/compute";

const WORK_TYPES: WorkTypeCode[] = ["building", "road", "bridge", "irrigation"];

// จำนวนแถว/ปลายเปิดต่อประเภทงาน — อ่านจากไฟล์ dataset (ตัวประกาศ) ไม่ใช่ค่าเดา
const ROW_COUNTS: Record<WorkTypeCode, number> = { building: 24, road: 37, bridge: 41, irrigation: 41 };
const OPEN_AT: Record<WorkTypeCode, number> = { building: 500, road: 700, bridge: 200, irrigation: 1000 };

function pickTable(workType: WorkTypeCode, a: number, r: number) {
  const t = selectFactorFTable(W481_2569_TABLES, { workType, advancePct: a, retentionPct: r });
  if (!t) throw new Error(`ไม่พบตาราง ${workType} a${a} r${r}`);
  return t;
}

describe("ว 481 — checksum + โครงสร้างชุดข้อมูลจริง", () => {
  it("checksum รายตาราง + ชุดรวม + validate ทุกตาราง ผ่านหมด", async () => {
    const bad = await verifyW481Checksums();
    expect(bad).toEqual([]);
  });

  it("48 ตาราง (4 ประเภทงาน × 12 คู่อัตรา) — id ตรงกับฟิลด์ของตารางทุกตัว", () => {
    expect(W481_2569_TABLES).toHaveLength(48);
    expect(W481_2569_TABLE_IDS).toHaveLength(48);
    expect(new Set(W481_2569_TABLE_IDS).size).toBe(48);
    for (let i = 0; i < 48; i++) {
      const m = W481_2569_TABLE_IDS[i].match(/^w481-6-([a-z]+)-a(\d+)-r(\d+)$/);
      expect(m, `id ลำดับ ${i}`).not.toBeNull();
      const t = W481_2569_TABLES[i];
      expect(t.workType).toBe(m![1] as WorkTypeCode);
      expect(t.advancePct).toBe(Number(m![2]));
      expect(t.retentionPct).toBe(Number(m![3]));
      expect(t.interestPct).toBe(6); // ดอกเบี้ย 6% ทั้งเอกสาร
      expect(t.vatPct).toBe(7); // VAT 7% ทั้งเอกสาร
    }
  });

  it("โครงตารางต่อประเภทงาน: จำนวนแถว · แถวแรกค่าคงที่ · แถวสุดท้ายปลายเปิดที่จุดตัดถูกต้อง · คอลัมน์เสริมครบ", () => {
    for (const wt of WORK_TYPES) {
      for (let a = 0; a <= 15; a += 5) {
        for (let r = 0; r <= 10; r += 5) {
          const t = pickTable(wt, a, r);
          expect(validateFactorFTable(t), `${wt} a${a} r${r}`).toBeNull();
          expect(t.rows).toHaveLength(ROW_COUNTS[wt]);
          // แถวแรก [0, N] ค่าคงที่ (D=E, F=G)
          expect(t.rows[0].B).toBe(0);
          expect(t.rows[0].D).toBe(t.rows[0].E);
          if (t.rows[0].F !== undefined) expect(t.rows[0].F).toBe(t.rows[0].G);
          // แถวสุดท้ายปลายเปิด ณ จุดตัดของประเภทงาน
          const last = t.rows[t.rows.length - 1];
          expect(last.open).toBe(true);
          expect(last.B).toBe(OPEN_AT[wt]);
          // คอลัมน์เสริม: งานทาง/ชลประทาน = 4 คอลัมน์ (ฝนชุก 1–2), อาคาร/สะพาน = 2 คอลัมน์
          for (const row of t.rows) {
            if (wt === "road" || wt === "irrigation") {
              expect(row.D2, `${wt} a${a} r${r} B=${row.B}`).toBeDefined();
              expect(row.E2).toBeDefined();
              expect(row.D3).toBeDefined();
              expect(row.E3).toBeDefined();
            } else {
              expect(row.D2).toBeUndefined();
              expect(row.D3).toBeUndefined();
            }
          }
        }
      }
    }
  });

  it("ความสัมพันธ์ VAT 7%: |D − F×1.07| ≤ 5e-4 และ |E − G×1.07| ≤ 5e-4 ทุกแถวทุกตาราง", () => {
    for (const t of W481_2569_TABLES) {
      for (const row of t.rows) {
        if (row.F !== undefined) expect(Math.abs(row.D - row.F * 1.07), `D/F ${t.workType} B=${row.B}`).toBeLessThanOrEqual(5e-4);
        if (row.G !== undefined) expect(Math.abs(row.E - row.G * 1.07), `E/G ${t.workType} B=${row.B}`).toBeLessThanOrEqual(5e-4);
      }
    }
  });

  it("checksum ชุดรวม + sha256 ของ PDF ต้นฉบับ มีรูปแบบถูกต้อง", () => {
    expect(W481_2569_SET_CHECKSUM).toMatch(/^[0-9a-f]{16}$/);
    expect(W481_2569_PDF_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("ว 481 — selectFactorFTable ครบ 48 คู่เงื่อนไข", () => {
  it("ครบทุกคู่ (ประเภทงาน × ทดรองจ่าย 0/5/10/15 × ประกันผลงาน 0/5/10)", () => {
    for (const wt of WORK_TYPES) {
      for (let a = 0; a <= 15; a += 5) {
        for (let r = 0; r <= 10; r += 5) {
          const t = selectFactorFTable(W481_2569_TABLES, { workType: wt, advancePct: a, retentionPct: r });
          expect(t, `${wt} a${a} r${r}`).not.toBeNull();
          expect(t!.workType).toBe(wt);
          expect(t!.advancePct).toBe(a);
          expect(t!.retentionPct).toBe(r);
        }
      }
    }
  });

  it("คู่เงื่อนไขที่ไม่มีในประกาศ → null (ไม่เดาค่า)", () => {
    expect(selectFactorFTable(W481_2569_TABLES, { workType: "building", advancePct: 20, retentionPct: 0 })).toBeNull();
    expect(selectFactorFTable(W481_2569_TABLES, { workType: "road", advancePct: 0, retentionPct: 7 })).toBeNull();
  });
});

describe("ว 481 — golden lookup ตามตัวประกาศ", () => {
  it("อาคาร a0 r0: x=0.25 ล้าน → 1.3073 (ช่วงค่าคงที่แรก)", () => {
    const t = pickTable("building", 0, 0);
    const at = factorFAt(t, 0.25);
    expect(at!.factorF).toBeCloseTo(1.3073, 10);
    const lk = lookupFactorFByMillion(0.25, t);
    expect(lk.factor).toBeCloseTo(1.3073, 10);
    expect(lk.interpolated).toBe(false);
  });

  it("อาคาร a0 r0: x=0.75 ล้าน → interpolate 1.3061 / รวมในรูป Factor 1.2207", () => {
    const t = pickTable("building", 0, 0);
    const at = factorFAt(t, 0.75);
    expect(at!.factorF).toBeCloseTo(1.3061, 10);
    expect(at!.noVat).toBeCloseTo(1.2207, 10);
  });

  it("อาคาร a0 r0: x=600 ล้าน (เกิน 500) → แถวปลายเปิดค่าคงที่ 1.1787 / noVAT 1.1016", () => {
    const t = pickTable("building", 0, 0);
    const lk = lookupFactorFByMillion(600, t);
    expect(lk.row.open).toBe(true);
    expect(lk.interpolated).toBe(false);
    expect(lk.factor).toBeCloseTo(1.1787, 10);
    expect(lk.noVat).toBeCloseTo(1.1016, 10);
  });

  it("งานทาง a0 r5: x=185 ล้าน (ช่วง 180–190 แถวเบี่ยงเบน) → 1.16715 / noVAT 1.0908 / ฝนชุก 1.18455, 1.20195 + anomalyNote", () => {
    const t = pickTable("road", 0, 5);
    const lk = lookupFactorFByMillion(185, t);
    expect(lk.interpolated).toBe(true);
    expect(lk.factor).toBeCloseTo(1.16715, 10);
    expect(lk.noVat).toBeCloseTo(1.0908, 10);
    expect(lk.rain1).toBeCloseTo(1.18455, 10);
    expect(lk.rain2).toBeCloseTo(1.20195, 10);
    expect(lk.anomalyNote).toContain("180");
    const at = factorFAt(t, 185);
    expect(at!.factorF).toBeCloseTo(1.16715, 10);
    expect(at!.rain1).toBeCloseTo(1.18455, 10);
  });

  it("งานทาง a0 r5: x=190 ล้าน → ค่าขอบ 1.168 ต่อเนื่องข้ามแถวเบี่ยงเบน", () => {
    const t = pickTable("road", 0, 5);
    const lk = lookupFactorFByMillion(190, t);
    expect(lk.factor).toBeCloseTo(1.168, 10);
  });

  it("ชลประทาน a15 r10: x=1,200 ล้าน (เกิน 1,000) → ปลายเปิด 1.1443 / noVAT 1.0695 / ฝนชุก 1.1636, 1.1829", () => {
    const t = pickTable("irrigation", 15, 10);
    const at = factorFAt(t, 1200);
    expect(at!.factorF).toBeCloseTo(1.1443, 10);
    expect(at!.noVat).toBeCloseTo(1.0695, 10);
    expect(at!.rain1).toBeCloseTo(1.1636, 10);
    expect(at!.rain2).toBeCloseTo(1.1829, 10);
    const lk = lookupFactorFByMillion(1200, t);
    expect(lk.row.open).toBe(true);
    expect(lk.factor).toBeCloseTo(1.1443, 10);
  });
});

describe("ว 481 — computeGovBOQ เชื่อมชุดตารางจริง (รายการเป็นข้อมูลสมมุติเพื่อทดสอบ)", () => {
  const RULESET = getW481Ruleset();
  // โครงการทดสอบ — ต้นทุนโดยตรง 250,000 บาท = 0.25 ล้านบาท (ยอดสมมุติ ไม่ใช่โครงการจริง)
  const BASE_PROJECT: BoqProject = {
    id: "p-test-w481",
    name: "โครงการทดสอบเครื่องยนต์ (ข้อมูลสมมุติเพื่อทดสอบ)",
    address: "—",
    boqType: "ปร.1",
    createdAt: "2026-01-01T00:00:00.000Z",
    items: [
      {
        id: "it-1",
        section: "งานทดสอบ",
        name: "รายการทดสอบ (ข้อมูลสมมุติเพื่อทดสอบ)",
        unit: "ลบ.ม.",
        qty: 1,
        price: 250000,
      },
    ],
  };

  it("building a0r0 + ต้นทุน 0.25 ล้านบาท → F = 1.3073, หลังปรับ = 32,682,500 สตางค์ + trace ระบุตารางที่ใช้", () => {
    const res = computeGovBOQ(
      { ...BASE_PROJECT, factorFCond: { workType: "building", advancePct: 0, retentionPct: 0 } },
      RULESET,
    );
    expect(res.directCost).toBe(25_000_000);
    expect(res.factorF).toBeCloseTo(1.3073, 10);
    expect(res.afterFactor).toBe(32_682_500);
    const factorStep = res.steps.find((s) => s.kind === "factor");
    expect(factorStep?.notes?.some((n) => n.includes("ประเภทงาน building"))).toBe(true);
  });

  it("building a0r0 + noVat → ใช้คอลัมน์รวมในรูป Factor 1.2218, หลังปรับ = 30,545,000 สตางค์", () => {
    const res = computeGovBOQ(
      { ...BASE_PROJECT, factorFCond: { workType: "building", advancePct: 0, retentionPct: 0, noVat: true } },
      RULESET,
    );
    expect(res.factorF).toBeCloseTo(1.2218, 10);
    expect(res.afterFactor).toBe(30_545_000);
    const factorStep = res.steps.find((s) => s.kind === "factor");
    expect(factorStep?.label).toContain("รวมในรูป Factor");
  });

  it("ไม่ระบุ factorFCond → ไม่ปรับ Factor F (null) + เตือนให้ระบุเงื่อนไข", () => {
    const res = computeGovBOQ(BASE_PROJECT, RULESET);
    expect(res.factorF).toBeNull();
    expect(res.afterFactor).toBe(res.directCost);
    expect(res.warnings.some((w) => w.includes("เงื่อนไข"))).toBe(true);
  });

  it("factorFCond ที่ไม่มีตารางในประกาศ (ทดรองจ่าย 20%) → ไม่ปรับ + เตือนชื่อเงื่อนไข", () => {
    const res = computeGovBOQ(
      { ...BASE_PROJECT, factorFCond: { workType: "building", advancePct: 20, retentionPct: 0 } },
      RULESET,
    );
    expect(res.factorF).toBeNull();
    expect(res.afterFactor).toBe(res.directCost);
    expect(res.warnings.some((w) => w.includes("ไม่พบตาราง Factor F") && w.includes("20%"))).toBe(true);
  });

  it("ชุดกฎ ว 481 ไม่มีตารางเดี่ยว — ตรวจว่าผู้เรียกที่ยังพยายามอ่าน ruleset.factorF ไม่หลงทาง", () => {
    expect(RULESET.factorF).toBeUndefined();
    expect(RULESET.factorFTables).toHaveLength(48);
  });
});
