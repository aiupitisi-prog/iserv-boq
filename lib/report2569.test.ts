// เวกเตอร์ทดสอบตัวสร้างรายงาน 9 ชิ้น (report2569) — ตาราง/อัตราเป็น "ข้อมูลทดสอบสมมุติ" ไม่ใช่ตัวเลขกฎหมาย
// ตรวจ: Σรายกลุ่ม (ก่อน F) == directCost · ค่าก่อสร้างรวม == afterFactor เครื่องยนต์ · ปรับปัดเศษ ·
// VAT ครุภัณฑ์จากตาราง · ค่าติดตั้งที่สืบราคา · ปร.3 รวม VAT · F = 1 เมื่อไม่มีตาราง
import { describe, expect, it } from "vitest";
import type { BoqItem, BoqProject } from "./boq";
import type { Ruleset } from "./ruleset";
import { computeGovBOQ, type CalcResult } from "./calc/compute";
import { buildReg2569Report } from "./report2569";

// วันที่พิมพ์คงที่ — ใช้คิดอายุราคา (stale) ให้เทสต์ deterministic
const NOW = new Date(2026, 10, 12); // 12 พ.ย. 2569 (local)

// ข้อมูลทดสอบสมมุติ — ห้ามใช้อ้างอิงจริง
const TEST_RULESET: Ruleset = {
  id: "test-ruleset-2569",
  name: "ชุดกฎทดสอบ (ข้อมูลสมมุติ)",
  sourceDoc: "ไม่ใช่เอกสารจริง — ใช้ทดสอบเครื่องยนต์เท่านั้น",
  effectiveFrom: "2000-01-01",
  createdAt: "2000-01-01T00:00:00.000Z",
  checksum: "test-checksum",
  factorF: {
    advancePct: 0,
    retentionPct: 0,
    interestPct: 0,
    vatPct: 7,
    rows: [{ B: 0, C: 100, D: 1.25, E: 1.2 }], // ข้อมูลสมมุติ — ครอบช่วง 0–100 ล้านบาท
  },
  contingencyPct: 5,
  swcPct: 3,
  durableHandlingPct: 2,
};

const EMPTY_RULESET: Ruleset = {
  id: "empty-ruleset",
  name: "ชุดกฎว่าง (ทดสอบ F = 1)",
  sourceDoc: "ไม่ใช่เอกสารจริง",
  effectiveFrom: "2000-01-01",
  createdAt: "2000-01-01T00:00:00.000Z",
  checksum: "empty",
};

// ชุดกฎสมมุติแบบ 48 ตาราง (factorFTables) คอลัมน์ F/G "รวมในรูป Factor" (ไม่รวม VAT) — ทดสอบ B2
const NOVAT_RULESET: Ruleset = {
  id: "test-ruleset-novat",
  name: "ชุดกฎทดสอบ (ตารางเดี่ยว + คอลัมน์ F/G)",
  sourceDoc: "ไม่ใช่เอกสารจริง — ใช้ทดสอบเครื่องยนต์เท่านั้น",
  effectiveFrom: "2000-01-01",
  createdAt: "2000-01-01T00:00:00.000Z",
  checksum: "test-checksum-novat",
  factorFTables: [
    {
      workType: "building",
      advancePct: 0,
      retentionPct: 0,
      interestPct: 0,
      vatPct: 7,
      rows: [{ B: 0, C: 100, D: 1.25, E: 1.2, F: 1.15, G: 1.1 }], // ข้อมูลสมมุติ
    },
  ],
  contingencyPct: 5,
  swcPct: 3,
  durableHandlingPct: 2,
};

// ชุดกฎสมมุติคอลัมน์ฝนชุก 1 (D2/E2) — ทดสอบ B2 (ฝนชุก override คอลัมน์ไม่รวม VAT เมื่อระบุทั้งคู่)
const RAIN_RULESET: Ruleset = {
  id: "test-ruleset-rain",
  name: "ชุดกฎทดสอบ (คอลัมน์ฝนชุก 1)",
  sourceDoc: "ไม่ใช่เอกสารจริง — ใช้ทดสอบเครื่องยนต์เท่านั้น",
  effectiveFrom: "2000-01-01",
  createdAt: "2000-01-01T00:00:00.000Z",
  checksum: "test-checksum-rain",
  factorFTables: [
    {
      workType: "road",
      advancePct: 0,
      retentionPct: 0,
      interestPct: 0,
      vatPct: 7,
      rows: [{ B: 0, C: 100, D: 1.25, E: 1.2, D2: 1.35, E2: 1.3 }], // ข้อมูลสมมุติ
    },
  ],
  contingencyPct: 5,
  swcPct: 3,
  durableHandlingPct: 2,
};

// ชุดกฎสมุติมีแถวปลายเปิด (ตั้งแต่ 5 ล้านบาทขึ้นไป) — ทดสอบ N7/ขอบตาราง
const OPEN_RULESET: Ruleset = {
  id: "test-ruleset-open",
  name: "ชุดกฎทดสอบ (แถวปลายเปิด)",
  sourceDoc: "ไม่ใช่เอกสารจริง — ใช้ทดสอบเครื่องยนต์เท่านั้น",
  effectiveFrom: "2000-01-01",
  createdAt: "2000-01-01T00:00:00.000Z",
  checksum: "test-checksum-open",
  factorF: {
    advancePct: 0,
    retentionPct: 0,
    interestPct: 0,
    vatPct: 7,
    rows: [
      { B: 0, C: 5, D: 1.3, E: 1.2 }, // ข้อมูลสมมุติ
      { B: 5, C: 5, D: 1.1, E: 1.1, open: true }, // ข้อมูลสมมุติ — ปลายเปิดค่าคงที่
    ],
  },
  contingencyPct: 5,
  swcPct: 3,
  durableHandlingPct: 2,
};

function item(over: Partial<BoqItem>): BoqItem {
  return {
    id: over.id ?? "it_" + Math.random().toString(36).slice(2),
    section: "งานทดสอบ",
    name: "รายการทดสอบ",
    unit: "หน่วย",
    qty: 1,
    price: 0,
    ...over,
  } as BoqItem;
}

function project(over: Partial<BoqProject>): BoqProject {
  return {
    id: "p_test",
    name: "โปรเจกต์ทดสอบ",
    address: "ที่ทดสอบ",
    boqType: "ปร.1",
    createdAt: new Date().toISOString(),
    items: [],
    ...over,
  };
}

// โปรเจกต์ทอง: 2 หมวดงาน (แยก ก./ข. + แถวไม่แยก) + ครุภัณฑ์มีค่าติดตั้ง + ค่าใช้จ่ายพิเศษ 2 รายการ
function goldenProject(): BoqProject {
  return project({
    items: [
      item({
        section: "งานเตรียมงาน",
        name: "ค่าบริหารงาน",
        unit: "งาน",
        qty: 10,
        price: 100.25,
        matPrice: 70.25,
        laborPrice: 30,
        source: {
          kind: "tpso",
          code: "C1",
          prov: "10",
          provName: "ส่วนกลาง",
          year: 2569,
          month: 9,
          priceAtPick: 70.25,
          pickedAt: "2026-11-01T00:00:00.000Z",
        },
      }),
      item({ section: "งานโครงสร้าง", name: "งานคอนกรีต", unit: "ลบ.ม.", qty: 2, price: 500, matPrice: 400, laborPrice: 100 }),
      item({ section: "งานโครงสร้าง", name: "งานเหล็กเส้น", unit: "ตัน", qty: 3.5, price: 99.99 }), // ไม่แยก ก./ข.
      item({ section: "งานระบบไฟฟ้า", name: "ตู้พาเนลหลัก", unit: "ตู้", qty: 2, price: 14500, part: "equipment", installPrice: 1200 }),
    ],
    specialExpenses: [
      { id: "se1", name: "ค่าเช่าเครนยกของหน้างาน", qty: 1, unit: "งาน", amount: 1000, vatIncluded: true, reason: "จำเป็น", calcDetail: "เช่า 1 วัน" },
      { id: "se2", name: "ค่าประสานงานพื้นที่", qty: 2, unit: "ครั้ง", amount: 500, vatIncluded: false },
    ],
  });
}

describe("buildReg2569Report (ชุด 9 ชิ้น)", () => {
  const proj = goldenProject();
  const calc = computeGovBOQ(proj, TEST_RULESET);
  const rep = buildReg2569Report(proj, TEST_RULESET, calc, NOW);

  it("ชิ้น 2 — ปร.1 ต่อหมวดงาน: รวมชุดเท่ากับค่างานต้นทุนของกลุ่ม และแยก ก./ข. ตรงกับเครื่องยนต์", () => {
    expect(rep.p1Sheets).toHaveLength(2); // หมวดงานก่อสร้าง 2 หมวด (ครุภัณฑ์ไม่เข้า)
    const prep = rep.p1Sheets.find((s) => s.section === "งานเตรียมงาน")!;
    const struct = rep.p1Sheets.find((s) => s.section === "งานโครงสร้าง")!;
    expect(prep.sumSat).toBe(100_250); // 1,002.50 บาท (mat 702.50 + lab 300.00)
    expect(struct.sumSat).toBe(80_000 + 20_000 + 34_997); // 1,349.97 บาท (แถวไม่แยกตกทั้งหมดใน ก.)
    expect(struct.rows[1].unsplit).toBe(true);
    expect(struct.rows[1].note).toContain("ยังไม่แยกค่าวัสดุ/ค่าแรง");
    expect(prep.rows[0].matSat).toBe(70_250);
    expect(prep.rows[0].labSat).toBe(30_000);
  });

  it("ชิ้น 1 — ปร.1(ก): Σค่างานต้นทุนรายกลุ่ม == directCost และ Σค่าก่อสร้าง + ปรับปัดเศษ == afterFactor เครื่องยนต์", () => {
    expect(rep.groups.map((g) => g.costSat)).toEqual([100_250, 134_997]);
    expect(rep.groups.reduce((a, g) => a + g.costSat, 0)).toBe(calc.directCost); // 235,247
    expect(rep.constructionTotalSat).toBe(calc.afterFactor);
    expect(rep.groupsSumSat + rep.roundingAdjSat).toBe(rep.constructionTotalSat);
    // ค่าก่อสร้างรวม (ตัวเลขทอง — เครื่องยนต์ปัด half-up): A = 2,352.47 บาท × F ≈ 1.2499988 → 2,940.58 บาท
    expect(rep.constructionTotalSat).toBe(294_058);
    expect(rep.groups.every((g) => g.factor === calc.factorF)).toBe(true);
  });

  it("ชิ้น 3–4 — ปร.2(ก)/ปร.2: VAT จากตาราง + ค่าติดตั้งที่สืบราคา (ไม่ใช้ durableHandlingPct)", () => {
    expect(rep.p2).not.toBeNull();
    const p2 = rep.p2!;
    expect(p2.vatPct).toBe(7); // จาก FactorFTable.vatPct ของชุดกฎ
    const row = p2.rows[0];
    expect(row.equipSat).toBe(2_900_000); // 29,000.00
    expect(row.equipVatSat).toBe(203_000); // VAT 7% = 2,030.00
    expect(row.installSat).toBe(240_000); // 2 ตู้ × 1,200 = 2,400.00 (สืบราคาแยก)
    expect(row.installVatSat).toBe(16_800); // VAT ของค่าติดตั้ง = 168.00
    expect(row.totalSat).toBe(3_359_800); // 33,598.00
    expect(p2.sumSat).toBe(3_359_800);
    // ปร.2(ก) รวมต่อกลุ่มเท่ากับผลรวมรายการ
    expect(p2.groups.reduce((a, g) => a + g.totalSat, 0)).toBe(p2.sumSat);
    // ห้ามใช้ durableHandlingPct (2% = 580.00) เป็นค่าติดตั้ง — ค่าติดตั้งต้องมาจาก installPrice เท่านั้น
    expect(row.installSat).not.toBe(58_000);
    // เตือนเรื่องค่าดำเนินงานครุภัณฑ์ของโครงเดิม
    expect(rep.warnings.some((w) => w.includes("durableHandlingPct") || w.includes("ค่าดำเนินงานครุภัณฑ์"))).toBe(true);
  });

  it("ชิ้น 5–6 — ปร.3 + แบบเหตุผล: รายการที่มี VAT รวม VAT แล้ว (ข้อ 9) และแบบเหตุผลแยกบรรทัด VAT", () => {
    expect(rep.p3).not.toBeNull();
    const p3 = rep.p3!;
    expect(p3.rows[0].amountSat).toBe(107_000); // 1,000 + VAT 7% = 1,070.00
    expect(p3.rows[0].note).toContain("รวม VAT 7%");
    expect(p3.rows[1].amountSat).toBe(50_000); // ไม่รวม VAT
    expect(p3.rows[1].note).toContain("ไม่รวม VAT");
    expect(p3.sumSat).toBe(157_000); // 1,570.00
    expect(p3.reasons[0].sumSat).toBe(100_000);
    expect(p3.reasons[0].vatSat).toBe(7_000);
    expect(p3.reasons[0].totalSat).toBe(107_000);
    expect(p3.reasons[0].reason).toBe("จำเป็น");
    expect(p3.reasons[1].vatSat).toBe(0);
  });

  it("ชิ้น 7 — ปร.4: ราคากลาง = ค่าก่อสร้าง + ค่าครุภัณฑ์จัดซื้อ + ค่าใช้จ่ายพิเศษ (ไม่รวมเงินเผื่อ/ค่าดำเนินงานโครงเดิม)", () => {
    expect(rep.summary.constructionSat).toBe(294_058);
    expect(rep.summary.equipmentSat).toBe(3_359_800);
    expect(rep.summary.expenseSat).toBe(157_000);
    expect(rep.summary.totalSat).toBe(294_058 + 3_359_800 + 157_000); // 3,810,858 = 38,108.58 บาท
    // เครื่องยนต์เดิมรวม contingency (14,703) + swc (9,263) + install (58,000) → 347,6024
    expect(rep.engineTotalSat).toBe(calc.total);
    expect(calc.total).toBe(294_058 + 14_703 + 9_263 + 2_900_000 + 58_000);
    // ต้องแจ้งเตือนเทียบเคียงเมื่อยอดต่าง
    expect(rep.warnings.some((w) => w.includes("ต่างจากยอดรวมเครื่องยนต์เดิม"))).toBe(true);
  });

  it("ชิ้น 8 — รายละเอียดการหาค่า Factor F: ตาราง/แถว/คอลัมน์/A/ค่าที่ใช้", () => {
    expect(rep.factorFDetail.haveTable).toBe(true);
    expect(rep.factorFDetail.A).toBe(235_247);
    expect(rep.factorFDetail.factor).toBeCloseTo(1.2499988237, 6);
    expect(rep.factorFDetail.afterFactor).toBe(294_058);
    expect(rep.factorFDetail.table?.vatPct).toBe(7);
    expect(rep.factorFDetail.row?.B).toBe(0);
    expect(rep.factorFDetail.row?.C).toBe(100);
    expect(rep.factorFDetail.row?.D).toBe(1.25);
    expect(rep.factorFDetail.row?.E).toBe(1.2);
    expect(rep.factorFDetail.row?.interpolated).toBe(true);
    expect(rep.factorFDetail.row?.rangeLabel).toContain("0–100 ล้านบาท");
    expect(rep.factorFDetail.columnLabel).toContain("รวม VAT");
    expect(rep.factorFDetail.notes.some((n) => n.includes("ตารางที่ใช้"))).toBe(true); // trace จากเครื่องยนต์
  });

  it("ชิ้น 9 — บันทึกเหตุผลสืบราคาวัสดุ: ที่มา สนค. + เตือนรายการที่ไม่ระบุแหล่งที่มา", () => {
    expect(rep.priceEvidence).toHaveLength(3); // เฉพาะรายการงานก่อสร้าง
    expect(rep.priceEvidence[0].origin).toContain("สนค. (TPSO)");
    expect(rep.priceEvidence[0].origin).toContain("พ.ศ. 2569");
    expect(rep.priceEvidence[2].unstated).toBe(true); // งานเหล็กเส้นไม่มี source
    expect(rep.warnings.some((w) => w.includes("ยังไม่ระบุแหล่งที่มาราคา"))).toBe(true);
  });

  it("กรณีไม่มีตาราง Factor F → F = 1 + VAT ครุภัณฑ์ unverified", () => {
    const proj2 = goldenProject();
    const calc2 = computeGovBOQ(proj2, EMPTY_RULESET);
    const rep2 = buildReg2569Report(proj2, EMPTY_RULESET, calc2, NOW);
    expect(calc2.factorF).toBeNull();
    expect(rep2.groups.every((g) => g.factor === 1)).toBe(true);
    expect(rep2.constructionTotalSat).toBe(calc2.directCost);
    expect(rep2.roundingAdjSat).toBe(0);
    expect(rep2.factorFDetail.haveTable).toBe(false);
    expect(rep2.factorFDetail.factor).toBeNull();
    expect(rep2.p2?.vatPct).toBeNull();
    expect(rep2.p2?.rows[0].equipVatSat).toBeNull();
    expect(rep2.warnings.some((w) => w.includes("unverified"))).toBe(true);
  });

  it("กรณีไม่มีครุภัณฑ์/ค่าใช้จ่ายพิเศษ → ไม่ออก ปร.2/ปร.3 และยอดรวม = ค่าก่อสร้าง", () => {
    const proj3 = project({ items: [item({ section: "งานเตรียมงาน", qty: 1, price: 1000, matPrice: 700, laborPrice: 300 })] });
    const calc3 = computeGovBOQ(proj3, TEST_RULESET);
    const rep3 = buildReg2569Report(proj3, TEST_RULESET, calc3, NOW);
    expect(rep3.p2).toBeNull();
    expect(rep3.p3).toBeNull();
    expect(rep3.summary.equipmentSat).toBe(0);
    expect(rep3.summary.expenseSat).toBe(0);
    expect(rep3.summary.totalSat).toBe(rep3.summary.constructionSat);
    expect(rep3.p1Sheets).toHaveLength(1);
  });

  it("กรณีครุภัณฑ์ไม่ระบุค่าติดตั้ง → ช่องค่าติดตั้งเป็น null + เตือน", () => {
    const proj4 = project({
      items: [
        item({ section: "งานโครงสร้าง", qty: 1, price: 1000, matPrice: 700, laborPrice: 300 }),
        item({ section: "งานระบบไฟฟ้า", name: "ปั๊มน้ำ", unit: "ชุด", qty: 1, price: 8000, part: "equipment" }),
      ],
    });
    const calc4 = computeGovBOQ(proj4, TEST_RULESET);
    const rep4 = buildReg2569Report(proj4, TEST_RULESET, calc4, NOW);
    expect(rep4.p2?.rows[0].installUnit).toBeNull();
    expect(rep4.p2?.rows[0].installSat).toBe(0);
    expect(rep4.warnings.some((w) => w.includes("ค่าติดตั้ง"))).toBe(true);
  });

  // ————— เคสเพิ่มเติมจาก compliance review (B1–B4, F1–F6, N7) —————

  it("F1 — ปรับปัดเศษ ≠ 0 เมื่อ Σค่าก่อสร้างรายกลุ่ม (ปัดทีละกลุ่ม) ต่างจากยอดทั้งโครงการ", () => {
    const proj5 = project({
      items: [
        item({ section: "งานเตรียมงาน", qty: 1, price: 0.07, matPrice: 0.07, laborPrice: 0 }),
        item({ section: "งานโครงสร้าง", qty: 1, price: 0.03, matPrice: 0.03, laborPrice: 0 }),
      ],
    });
    // CalcResult สมมุติ (ตัวเลขทอง — ไม่ใช่ค่ากฎหมาย): F = 1.2345 — ปัดทีละกลุ่มเพี้ยนจากปัดรวม 1 สตางค์
    const fakeCalc: CalcResult = {
      rulesetId: "test-ruleset-2569",
      material: 10, // 0.07 + 0.03 = 0.10 บาท
      labor: 0,
      directCost: 10,
      factorF: 1.2345,
      afterFactor: 12, // round(10 × 1.2345) = round(12.345)
      contingency: null,
      swc: null,
      equipmentAmount: null,
      installAmount: null,
      total: 12,
      steps: [],
      warnings: [],
    };
    const rep5 = buildReg2569Report(proj5, TEST_RULESET, fakeCalc, NOW);
    expect(rep5.groups.map((g) => g.constructionSat)).toEqual([9, 4]); // round(7×1.2345)=9, round(3×1.2345)=4
    expect(rep5.groupsSumSat).toBe(13);
    expect(rep5.roundingAdjSat).toBe(-1); // 12 − 13
    expect(rep5.constructionTotalSat).toBe(12);
    expect(rep5.groupsSumSat + rep5.roundingAdjSat).toBe(rep5.constructionTotalSat);
    // ยอดชุด = calc.total พอดี → ไม่มีเตือนเทียบเคียงยอดรวม
    expect(rep5.warnings.some((w) => w.includes("ต่างจากยอดรวมเครื่องยนต์เดิม"))).toBe(false);
  });

  it("ชิ้น 8 — ขอบตารางพอดี (A = 0) → ใช้ค่าตรง ไม่ interpolate", () => {
    const proj6 = project({ items: [item({ section: "งานเตรียมงาน", qty: 1, price: 0 })] });
    const calc6 = computeGovBOQ(proj6, TEST_RULESET);
    const rep6 = buildReg2569Report(proj6, TEST_RULESET, calc6, NOW);
    expect(calc6.directCost).toBe(0);
    expect(calc6.factorF).toBe(1.25); // ตรงขอบล่าง → ค่า D ตรง
    expect(rep6.factorFDetail.row?.interpolated).toBe(false);
    expect(rep6.factorFDetail.row?.D).toBe(1.25);
    expect(rep6.factorFDetail.row?.colLo).toBe("D");
  });

  it("ชิ้น 8 — แถวปลายเปิด → rangeLabel 'ตั้งแต่ N ล้านบาทขึ้นไป' + ค่าคงที่ (N7)", () => {
    const proj7 = project({
      items: [item({ section: "งานโครงสร้าง", qty: 1, price: 6_000_000, matPrice: 6_000_000, laborPrice: 0 })],
    });
    const calc7 = computeGovBOQ(proj7, OPEN_RULESET);
    const rep7 = buildReg2569Report(proj7, OPEN_RULESET, calc7, NOW);
    expect(calc7.factorF).toBe(1.1); // ค่าคงที่ของแถวปลายเปิด — ไม่ interpolate
    expect(calc7.afterFactor).toBe(660_000_000);
    const row = rep7.factorFDetail.row!;
    expect(row.open).toBe(true);
    expect(row.interpolated).toBe(false);
    expect(row.rangeLabel).toContain("ตั้งแต่ 5 ล้านบาทขึ้นไป");
    expect(row.D).toBe(1.1);
    expect(rep7.constructionTotalSat).toBe(660_000_000);
  });

  it("B2 — เงื่อนไข noVat → ชิ้น 8 แสดงขอบคอลัมน์ F/G (ไม่รวม VAT) ไม่ใช่ D/E ของคอลัมน์ปกติ", () => {
    const proj8 = project({
      items: [item({ section: "งานโครงสร้าง", qty: 1, price: 2352.47, matPrice: 2352.47, laborPrice: 0 })],
      factorFCond: { workType: "building", advancePct: 0, retentionPct: 0, noVat: true },
    });
    const calc8 = computeGovBOQ(proj8, NOVAT_RULESET);
    const rep8 = buildReg2569Report(proj8, NOVAT_RULESET, calc8, NOW);
    expect(calc8.factorF).toBeCloseTo(1.1499988238, 6); // interpolate F→G: 1.15 − 0.05×(0.00235247/100) — ไม่ใช่ 1.24999… ของคอลัมน์ D/E
    const row = rep8.factorFDetail.row!;
    expect(row.colLo).toBe("F");
    expect(row.colHi).toBe("G");
    expect(row.D).toBe(1.15); // ขอบล่างของคอลัมน์ F
    expect(row.E).toBe(1.1); // ขอบบนของคอลัมน์ G
    expect(row.interpolated).toBe(true);
    expect(rep8.factorFDetail.columnLabel).toContain("ไม่รวม VAT");
    expect(rep8.groups.every((g) => g.factor === calc8.factorF)).toBe(true);
  });

  it("B2 — เงื่อนไขฝนชุก 1 (พร้อม noVat) → ใช้คอลัมน์ D2/E2 (ฝนชุก override ตามเครื่องยนต์)", () => {
    const proj9 = project({
      items: [item({ section: "งานโครงสร้าง", qty: 1, price: 2352.47, matPrice: 2352.47, laborPrice: 0 })],
      factorFCond: { workType: "road", advancePct: 0, retentionPct: 0, noVat: true, rain: 1 },
    });
    const calc9 = computeGovBOQ(proj9, RAIN_RULESET);
    const rep9 = buildReg2569Report(proj9, RAIN_RULESET, calc9, NOW);
    expect(calc9.factorF).toBeCloseTo(1.3499988238, 6); // interpolate D2→E2 — ฝนชุก override คอลัมน์ไม่รวม VAT
    const row = rep9.factorFDetail.row!;
    expect(row.colLo).toBe("D2");
    expect(row.colHi).toBe("E2");
    expect(row.D).toBe(1.35);
    expect(row.E).toBe(1.3);
    expect(rep9.factorFDetail.columnLabel).toBe("Factor F ฝนชุก 1");
  });

  it("B1 — ครุภัณฑ์หลายหมวด: ปร.2(ก) รวมต่อหมวด + flag ค่าติดตั้ง/เหตุผลที่ขาด + ภาคท้ายชิ้น 9", () => {
    const proj10 = project({
      items: [
        item({ section: "งานโครงสร้าง", qty: 1, price: 1000, matPrice: 700, laborPrice: 300 }),
        item({ section: "งานระบบไฟฟ้า", name: "ตู้พาเนล A", unit: "ตู้", qty: 1, price: 8000, part: "equipment", installPrice: 500 }), // มีราคา ไม่มีเหตุผล
        item({ section: "งานระบบสุขาภิบาล", name: "ปั๊มน้ำ", unit: "ชุด", qty: 2, price: 4000, part: "equipment" }), // ไม่มีค่าติดตั้ง
      ],
    });
    const calc10 = computeGovBOQ(proj10, TEST_RULESET);
    const rep10 = buildReg2569Report(proj10, TEST_RULESET, calc10, NOW);
    expect(rep10.p2).not.toBeNull();
    expect(rep10.p2!.groups).toHaveLength(2);
    const g1 = rep10.p2!.groups.find((g) => g.section === "งานระบบไฟฟ้า")!;
    const g2 = rep10.p2!.groups.find((g) => g.section === "งานระบบสุขาภิบาล")!;
    expect(g1.installMissing).toBe(false);
    expect(g1.installReasonMissing).toBe(true);
    expect(g2.installMissing).toBe(true);
    expect(g2.installReasonMissing).toBe(false);
    // ชิ้น 9 — ภาคท้าย "การสืบราคาค่าติดตั้งครุภัณฑ์"
    expect(rep10.installEvidence).toHaveLength(2);
    expect(rep10.installEvidence[0].installUnit).toBe(500);
    expect(rep10.installEvidence[0].reasonMissing).toBe(true);
    expect(rep10.installEvidence[1].missingPrice).toBe(true);
    expect(rep10.warnings.some((w) => w.includes("เหตุผลความจำเป็น") && w.includes("ค่าติดตั้ง"))).toBe(true);
  });

  it("ปร.3 — vatIncluded = true แต่ไม่มีตาราง Factor F → ยังไม่รวม VAT + ป้าย unverified", () => {
    const proj11 = project({
      items: [item({ section: "งานโครงสร้าง", qty: 1, price: 1000, matPrice: 700, laborPrice: 300 })],
      specialExpenses: [{ id: "se9", name: "ค่าขนส่งยกนอกพื้นที่", qty: 1, unit: "งาน", amount: 2000, vatIncluded: true }],
    });
    const calc11 = computeGovBOQ(proj11, EMPTY_RULESET);
    const rep11 = buildReg2569Report(proj11, EMPTY_RULESET, calc11, NOW);
    expect(rep11.p3?.rows[0].amountSat).toBe(200_000); // 2,000.00 บาท — ยังไม่รวม VAT (ไม่ทราบอัตรา)
    expect(rep11.p3?.rows[0].note).toContain("อัตรายังไม่ทราบ");
    expect(rep11.p3?.reasons[0].vatSat).toBeNull();
    expect(rep11.warnings.some((w) => w.includes("unverified"))).toBe(true);
  });

  it("โปรเจกต์รูปแบบเก่าล้วน (ไม่มีฟิลด์ใหม่/แหล่งราคา/ครุภัณฑ์) → ยังพิมพ์ได้ครบ", () => {
    const proj12 = project({
      items: [item({ section: "งานโครงสร้าง", name: "งานคอนกรีต", unit: "ลบ.ม.", qty: 2, price: 500 })],
    });
    const calc12 = computeGovBOQ(proj12, TEST_RULESET);
    const rep12 = buildReg2569Report(proj12, TEST_RULESET, calc12, NOW);
    expect(rep12.p1Sheets).toHaveLength(1);
    expect(rep12.p2).toBeNull();
    expect(rep12.p3).toBeNull();
    expect(rep12.installEvidence).toHaveLength(0);
    expect(rep12.priceEvidence).toHaveLength(1);
    expect(rep12.priceEvidence[0].origin).toContain("ไม่ระบุแหล่งที่มาราคา");
    expect(rep12.summary.totalSat).toBe(rep12.constructionTotalSat);
  });

  it("B3 — ราคา สนค. เก่ากว่า 12 เดือน → ป้าย stale + เตือนก่อนพิมพ์", () => {
    const proj13 = project({
      items: [
        item({
          section: "งานโครงสร้าง", qty: 1, price: 100, matPrice: 100,
          source: { kind: "tpso", code: "C1", prov: "40", provName: "อยุธยา", year: 2568, month: 6, priceAtPick: 100, pickedAt: "2025-07-01T00:00:00.000Z" },
        }),
      ],
    });
    const calc13 = computeGovBOQ(proj13, TEST_RULESET);
    const rep13 = buildReg2569Report(proj13, TEST_RULESET, calc13, NOW);
    const row = rep13.priceEvidence[0];
    expect(row.stale).toBe(true); // มิ.ย. 2568 → พ.ย. 2569 = 17 เดือน
    expect(row.staleDetail).toContain("17 เดือน");
    expect(row.publicationCancelled).toBe(false);
    expect(rep13.warnings.some((w) => w.includes("เก่ากว่า 12 เดือน"))).toBe(true);
  });

  it("B3 — ราคา สนค. เขตส่วนกลาง เดือนที่ยกเลิกเผยแพร่ (เม.ย. 2569) → ป้าย unverified + เตือน", () => {
    const proj14 = project({
      items: [
        item({
          section: "งานโครงสร้าง", qty: 1, price: 100, matPrice: 100,
          source: { kind: "tpso", code: "C1", prov: "10", provName: "ส่วนกลาง", year: 2569, month: 4, priceAtPick: 100, pickedAt: "2026-06-01T00:00:00.000Z" },
        }),
      ],
    });
    const calc14 = computeGovBOQ(proj14, TEST_RULESET);
    const rep14 = buildReg2569Report(proj14, TEST_RULESET, calc14, NOW);
    expect(rep14.priceEvidence[0].publicationCancelled).toBe(true);
    expect(rep14.priceEvidence[0].origin).toContain("ยกเลิกเผยแพร่ราคาส่วนกลาง");
    expect(rep14.priceEvidence[0].stale).toBe(false); // เม.ย. 2569 → 7 เดือน ยังไม่เก่า
    expect(rep14.warnings.some((w) => w.includes("ยกเลิกเผยแพร่"))).toBe(true);
  });

  it("F6/B3 — คลังส่วนตัวหมวด 'ค่าแรง': แยก ข. ทั้งหมด + พิมพ์ note ที่มาราคา + ป้ายราคาเก่า", () => {
    const proj15 = project({
      items: [
        item({
          section: "งานโครงสร้าง", name: "ช่างปูน", unit: "วัน", qty: 3, price: 900,
          source: {
            kind: "private", entryId: "p1", category: "ค่าแรง",
            note: "ค่าแรงพื้นฐานเขตพื้นที่ — อ้างอิงราคาคลังภายใน",
            priceAgeRef: "2024-01-01T00:00:00.000Z", priceAtPick: 900, pickedAt: "2026-06-01T00:00:00.000Z",
          },
        }),
      ],
    });
    const calc15 = computeGovBOQ(proj15, TEST_RULESET);
    const rep15 = buildReg2569Report(proj15, TEST_RULESET, calc15, NOW);
    const r = rep15.p1Sheets[0].rows[0];
    expect(r.matUnit).toBeNull(); // หมวด "ค่าแรง" → ทั้งหมดใน ข. (เงื่อนไขเดียวกับเครื่องยนต์)
    expect(r.labUnit).toBe(900);
    expect(r.labSat).toBe(270_000);
    const ev = rep15.priceEvidence[0];
    expect(ev.origin).toContain("หมวด ค่าแรง");
    expect(ev.origin).toContain("หมายเหตุที่มาราคา: ค่าแรงพื้นฐานเขตพื้นที่"); // F6 — note ของคลังส่วนตัวต้องพิมพ์
    expect(ev.stale).toBe(true); // ม.ค. 2567 → 34 เดือน
    expect(rep15.warnings.some((w) => w.includes("เก่ากว่า 12 เดือน"))).toBe(true);
  });

  it("B4 — ชุดกฎถูก supersededBy → เตือนให้ย้ายชุดกฎก่อนพิมพ์ (พิมพ์ไปกับ ปร.4/ชิ้น 8)", () => {
    const SUPERSEDED_RULESET: Ruleset = { ...TEST_RULESET, supersededBy: "new-ruleset-id" };
    const proj16 = project({ items: [item({ section: "งานโครงสร้าง", qty: 1, price: 1000, matPrice: 700, laborPrice: 300 })] });
    const calc16 = computeGovBOQ(proj16, SUPERSEDED_RULESET);
    const rep16 = buildReg2569Report(proj16, SUPERSEDED_RULESET, calc16, NOW);
    expect(rep16.warnings.some((w) => w.includes("ถูกแทนที่ด้วยชุดกฎใหม่") && w.includes("new-ruleset-id"))).toBe(true);
  });

  it("F5 — โปรเจกต์ว่างรายการ → เตือนชัด ไม่ crash และยอดรวม 0", () => {
    const proj17 = project({ items: [] });
    const calc17 = computeGovBOQ(proj17, TEST_RULESET);
    const rep17 = buildReg2569Report(proj17, TEST_RULESET, calc17, NOW);
    expect(calc17.directCost).toBe(0);
    expect(rep17.warnings.some((w) => w.includes("ยังไม่มีรายการงานใด ๆ"))).toBe(true);
    expect(rep17.p1Sheets).toHaveLength(0);
    expect(rep17.summary.totalSat).toBe(0);
  });

  it("B1 (re-review รอบสอง) — เหตุผล/รายละเอียดสืบราคาค่าติดตั้งใช้เงื่อนไข OR: ขาดอย่างใดอย่างหนึ่งก็แฟล็ก + แยกข้อความว่าขาดอะไร", () => {
    const proj18 = project({
      items: [
        item({ section: "งานโครงสร้าง", qty: 1, price: 1000, matPrice: 700, laborPrice: 300 }),
        item({ section: "งานระบบไฟฟ้า", name: "A ใส่เหตุผลอย่างเดียว", unit: "ตู้", qty: 1, price: 8000, part: "equipment", installPrice: 500, installPriceReason: "ต้องติดตั้งระบบไฟฟ้าภายใน" }),
        item({ section: "งานระบบไฟฟ้า", name: "B ใส่รายละเอียดอย่างเดียว", unit: "ตู้", qty: 1, price: 8000, part: "equipment", installPrice: 500, installSourcingDetail: "ใบเสนอราคาบริษัท ก. 12/2569" }),
        item({ section: "งานระบบสุขาภิบาล", name: "C ใส่ครบทั้งสองส่วน", unit: "ชุด", qty: 1, price: 8000, part: "equipment", installPrice: 500, installPriceReason: "ต้องประกอบก่อนส่งมอบ", installSourcingDetail: "ใบเสนอราคาบริษัท ข." }),
      ],
    });
    const calc18 = computeGovBOQ(proj18, TEST_RULESET);
    const rep18 = buildReg2569Report(proj18, TEST_RULESET, calc18, NOW);
    expect(rep18.p2).not.toBeNull();
    const byName = (n: string) => rep18.p2!.rows.find((r) => r.name.includes(n))!;
    // ขาดอย่างใดอย่างหนึ่ง → แฟล็ก
    const a = byName("A ใส่เหตุผลอย่างเดียว");
    expect(a.installReasonMissing).toBe(true);
    expect(a.note).toContain("ยังไม่บันทึกรายละเอียดการสืบราคา");
    expect(a.note).not.toContain("เหตุผลความจำเป็นและรายละเอียด");
    const b = byName("B ใส่รายละเอียดอย่างเดียว");
    expect(b.installReasonMissing).toBe(true);
    expect(b.note).toContain("ยังไม่บันทึกเหตุผลความจำเป็น");
    // ครบทั้งสองส่วน → ไม่แฟล็ก
    const c = byName("C ใส่ครบทั้งสองส่วน");
    expect(c.installReasonMissing).toBe(false);
    expect(c.note).not.toContain("unverified: มีค่าติดตั้ง");
    // กลุ่ม: งานระบบไฟฟ้ามีรายการแฟล็ก · งานระบบสุขาภิบาลไม่มี
    const gElec = rep18.p2!.groups.find((g) => g.section === "งานระบบไฟฟ้า")!;
    const gSane = rep18.p2!.groups.find((g) => g.section === "งานระบบสุขาภิบาล")!;
    expect(gElec.installReasonMissing).toBe(true);
    expect(gSane.installReasonMissing).toBe(false);
    // ชิ้น 9 — ภาคท้ายตรวจต่อรายการ (OR เช่นกัน)
    const ev = rep18.installEvidence;
    expect(ev.find((r) => r.name.includes("A ใส่เหตุผลอย่างเดียว"))!.reasonMissing).toBe(true);
    expect(ev.find((r) => r.name.includes("B ใส่รายละเอียดอย่างเดียว"))!.reasonMissing).toBe(true);
    expect(ev.find((r) => r.name.includes("C ใส่ครบทั้งสองส่วน"))!.reasonMissing).toBe(false);
    // warning ระบุว่าขาดอะไร
    const warn = rep18.warnings.find((w) => w.includes("เอกสารประกอบไม่ครบ"));
    expect(warn).toBeDefined();
    expect(warn!).toContain("A ใส่เหตุผลอย่างเดียว (ขาดรายละเอียดการสืบราคา)");
    expect(warn!).toContain("B ใส่รายละเอียดอย่างเดียว (ขาดเหตุผลความจำเป็น)");
    expect(warn!).not.toContain("C ใส่ครบทั้งสองส่วน");
  });

  it("B3 (re-review รอบสอง) — ขอบอายุราคา: 12 เดือน = ไม่ stale · 13 เดือน = stale", () => {
    // NOW = 12 พ.ย. 2026 (ค.ศ.) — อ้างราคา สนค. พ.ย. 2568 = 12 เดือนพอดี · ต.ค. 2568 = 13 เดือน
    const proj19 = project({
      items: [
        item({
          section: "งานโครงสร้าง", name: "ขอบ 12 เดือน", qty: 1, price: 100, matPrice: 100,
          source: { kind: "tpso", code: "C1", prov: "40", provName: "อยุธยา", year: 2568, month: 11, priceAtPick: 100, pickedAt: "2026-06-01T00:00:00.000Z" },
        }),
        item({
          section: "งานโครงสร้าง", name: "ขอบ 13 เดือน", qty: 1, price: 100, matPrice: 100,
          source: { kind: "tpso", code: "C1", prov: "40", provName: "อยุธยา", year: 2568, month: 10, priceAtPick: 100, pickedAt: "2026-06-01T00:00:00.000Z" },
        }),
      ],
    });
    const calc19 = computeGovBOQ(proj19, TEST_RULESET);
    const rep19 = buildReg2569Report(proj19, TEST_RULESET, calc19, NOW);
    const m12 = rep19.priceEvidence.find((r) => r.name === "ขอบ 12 เดือน")!;
    const m13 = rep19.priceEvidence.find((r) => r.name === "ขอบ 13 เดือน")!;
    expect(m12.stale).toBe(false); // 12 เดือนพอดี — เกณฑ์คือ "เก่ากว่า 12 เดือน" จึงยังไม่ stale
    expect(m12.staleDetail).toBe("");
    expect(m13.stale).toBe(true);
    expect(m13.staleDetail).toContain("13 เดือน");
    // เตือนเฉพาะจำนวนรายการ stale = 1
    const staleWarn = rep19.warnings.find((w) => w.includes("เก่ากว่า 12 เดือน"));
    expect(staleWarn).toBeDefined();
    expect(staleWarn!).toMatch(/^1 รายการ/);
  });

  it("ชิ้น 8 (re-review รอบสอง) — fallback: แถวช่วงขอฝนชุกแต่ตารางมีแค่ D2 ไม่มี E2 → ใช้คอลัมน์ปกติ D/E + หมายเหตุจากเครื่องยนต์", () => {
    const PARTIAL_RAIN_RULESET: Ruleset = {
      id: "test-ruleset-partial-rain",
      name: "ชุดกฎทดสอบ (D2 อย่างเดียว — ไม่มี E2)",
      sourceDoc: "ไม่ใช่เอกสารจริง — ใช้ทดสอบเครื่องยนต์เท่านั้น",
      effectiveFrom: "2000-01-01",
      createdAt: "2000-01-01T00:00:00.000Z",
      checksum: "test-checksum-partial-rain",
      factorFTables: [
        {
          workType: "building",
          advancePct: 0,
          retentionPct: 0,
          interestPct: 0,
          vatPct: 7,
          rows: [{ B: 0, C: 100, D: 1.25, E: 1.2, D2: 1.35 }], // ข้อมูลสมมุติ — ขาด E2 คู่ขอบบน
        },
      ],
      contingencyPct: 5,
      swcPct: 3,
      durableHandlingPct: 2,
    };
    const proj20 = project({
      items: [item({ section: "งานโครงสร้าง", qty: 1, price: 2352.47, matPrice: 2352.47, laborPrice: 0 })],
      factorFCond: { workType: "building", advancePct: 0, retentionPct: 0, rain: 1 },
    });
    const calc20 = computeGovBOQ(proj20, PARTIAL_RAIN_RULESET);
    const rep20 = buildReg2569Report(proj20, PARTIAL_RAIN_RULESET, calc20, NOW);
    // เครื่องยนต์: คู่ขอบไม่ครบ → rain1 ไม่ถูกตั้ง → fallback คอลัมน์ปกติ D/E (interpolate)
    expect(calc20.factorF).toBeCloseTo(1.2499988238, 6); // 1.25 − 0.05×(0.00235247/100) — ไม่ใช่ 1.35 ของ D2
    expect(calc20.factorF).not.toBeCloseTo(1.35, 2);
    const row = rep20.factorFDetail.row!;
    expect(row.colLo).toBe("D");
    expect(row.colHi).toBe("E");
    expect(row.D).toBe(1.25);
    expect(row.E).toBe(1.2);
    expect(rep20.factorFDetail.columnLabel).toBe("Factor F (รวม VAT)");
    // หมายเหตุ fallback ของเครื่องยนต์ต้องพิมพ์ไปกับชิ้น 8
    expect(rep20.factorFDetail.notes.some((n) => n.includes("ฝนชุก") && n.includes("ใช้คอลัมน์ Factor F ปกติ"))).toBe(true);
  });
});
