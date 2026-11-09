// เวกเตอร์ทดสอบเครื่องยนต์คำนวณ (compute) — ตาราง/อัตราเป็น "ข้อมูลทดสอบสมมุติ" ไม่ใช่ตัวเลขกฎหมาย
import { describe, expect, it } from "vitest";
import type { BoqItem, BoqProject } from "../boq";
import type { Ruleset } from "../ruleset";
import { CalcError } from "./factorf";
import { computeGovBOQ } from "./compute";

// ข้อมูลทดสอบสมมุติ — ห้ามใช้อ้างอิงจริง
const TEST_RULESET: Ruleset = {
  id: "test-ruleset",
  name: "ชุดกฎทดสอบ (ข้อมูลสมมุติ)",
  sourceDoc: "ไม่ใช่เอกสารจริง — ใช้ทดสอบเครื่องยนต์เท่านั้น",
  effectiveFrom: "2000-01-01",
  createdAt: "2000-01-01T00:00:00.000Z",
  checksum: "test-checksum",
  factorF: {
    advancePct: 0,
    retentionPct: 0,
    interestPct: 0,
    vatPct: 0,
    rows: [{ B: 0, C: 100, D: 1.25, E: 1.2 }], // ข้อมูลสมมุติเพื่อทดสอบ — ครอบช่วง 0–100 ล้านบาท ให้ยอดทดสอบเล็กอยู่ในตาราง
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

function project(items: BoqItem[]): BoqProject {
  return {
    id: "p_test",
    name: "โปรเจกต์ทดสอบ",
    address: "",
    boqType: "ปร.1",
    createdAt: new Date().toISOString(),
    items,
  };
}

describe("computeGovBOQ", () => {
  it("แยก ก./ข. จาก matPrice/laborPrice และรวมต้นทุนโดยตรง (A) เป็นสตางค์", () => {
    const r = computeGovBOQ(
      project([
        item({ qty: 10, price: 100.25, matPrice: 70.25, laborPrice: 30 }), // รวม 1002.50
        item({ qty: 2, price: 500, matPrice: 400, laborPrice: 100 }), // รวม 1000.00
      ]),
      TEST_RULESET,
    );
    expect(r.material).toBe(70_250 + 80_000); // 1,502.50 บาท
    expect(r.labor).toBe(30_000 + 20_000); // 500.00 บาท
    expect(r.directCost).toBe(200_250); // 2,002.50 บาท
  });

  it("ราคาแบบไม่แยก (โปรเจกต์เก่า) ตกทั้งหมดใน ก. + มีคำเตือน", () => {
    const r = computeGovBOQ(project([item({ qty: 3, price: 99.99 })]), TEST_RULESET);
    expect(r.material).toBe(29_997); // 299.97 บาท
    expect(r.labor).toBe(0);
    expect(r.warnings.some((w) => w.includes("ยังไม่แยกค่าวัสดุ/ค่าแรง"))).toBe(true);
  });

  it("ราคาจากคลังส่วนตัวหมวด ค่าแรง → ตกใน ข.", () => {
    const r = computeGovBOQ(
      project([
        item({
          qty: 5,
          price: 700,
          source: {
            kind: "private",
            entryId: "e1",
            category: "ค่าแรง",
            priceAgeRef: new Date().toISOString(),
            priceAtPick: 700,
            pickedAt: new Date().toISOString(),
          },
        }),
      ]),
      TEST_RULESET,
    );
    expect(r.material).toBe(0);
    expect(r.labor).toBe(350_000); // 3,500.00 บาท
  });

  it("Factor F interpolate: A = 15 ล้าน → F = 1.225", () => {
    const table = { ...TEST_RULESET.factorF!, rows: [{ B: 10, C: 20, D: 1.25, E: 1.2 }] }; // ข้อมูลสมมุติเพื่อทดสอบ
    const r = computeGovBOQ(
      project([item({ qty: 1, price: 15_000_000, matPrice: 15_000_000, laborPrice: 0 })]),
      { ...TEST_RULESET, factorF: table },
    );
    expect(r.directCost).toBe(1_500_000_000);
    expect(r.factorF).toBeCloseTo(1.225, 10);
    expect(r.afterFactor).toBe(Math.round(1_500_000_000 * 1.225));
  });

  it("A นอกตาราง → throw OUT_OF_TABLE (ห้าม extrapolate)", () => {
    const table = { ...TEST_RULESET.factorF!, rows: [{ B: 10, C: 20, D: 1.25, E: 1.2 }] }; // ข้อมูลสมมุติเพื่อทดสอบ
    expect(() =>
      computeGovBOQ(
        project([item({ qty: 1, price: 5_000_000, matPrice: 5_000_000, laborPrice: 0 })]),
        { ...TEST_RULESET, factorF: table },
      ),
    ).toThrow(CalcError);
  });

  it("ครุภัณฑ์แยกจากฐาน Factor F — เพิ่มครุภัณฑ์แล้ว F/A คงเดิม แต่รวมท้าย", () => {
    const base = [item({ qty: 1, price: 15_000_000, matPrice: 15_000_000, laborPrice: 0 })];
    const withEquip = [
      ...base,
      item({ qty: 2, price: 50_000, part: "equipment", name: "ครุภัณฑ์ทดสอบ" }),
    ];
    const table = { ...TEST_RULESET.factorF!, rows: [{ B: 10, C: 20, D: 1.25, E: 1.2 }] }; // ข้อมูลสมมุติเพื่อทดสอบ
    const r1 = computeGovBOQ(project(base), { ...TEST_RULESET, factorF: table });
    const r2 = computeGovBOQ(project(withEquip), { ...TEST_RULESET, factorF: table });
    expect(r1.factorF).toBe(r2.factorF); // F คงเดิม
    expect(r1.afterFactor).toBe(r2.afterFactor); // A คงเดิม
    expect(r2.equipmentAmount).toBe(10_000_000); // 100,000.00 บาท (2 × 50,000 บาท) — หน่วยสตางค์
    expect(r2.installAmount).toBe(200_000); // 2% ค่าดำเนินงานครุภัณฑ์ = 2,000.00 บาท (ข้อมูลสมมุติ)
    expect(r2.total).toBe(r2.afterFactor! + (r2.contingency ?? 0) + (r2.swc ?? 0) + 10_000_000 + 200_000);
  });

  it("สลับลำดับรายการ → ราคารวมไม่เปลี่ยน", () => {
    const items = [
      item({ qty: 3, price: 120.5, matPrice: 100, laborPrice: 20.5 }),
      item({ qty: 1, price: 999.99, matPrice: 999.99, laborPrice: 0 }),
      item({ qty: 7, price: 45.25, matPrice: 10, laborPrice: 35.25 }),
    ];
    const r1 = computeGovBOQ(project(items), TEST_RULESET);
    const r2 = computeGovBOQ(project([...items].reverse()), TEST_RULESET);
    expect(r2.total).toBe(r1.total);
    expect(r2.directCost).toBe(r1.directCost);
  });

  it("ไม่มี ruleset → ไม่ throw (คำนวณเฉพาะต้นทุน) + เตือนว่าไม่มีตาราง", () => {
    const r = computeGovBOQ(project([item({ qty: 1, price: 1000 })]), null);
    expect(r.afterFactor).toBe(100_000);
    expect(r.factorF).toBeNull();
    expect(r.warnings.some((w) => w.includes("Factor F"))).toBe(true);
  });

  it("มีขั้นตอน trace ครบทุก kind หลัก", () => {
    const r = computeGovBOQ(
      project([item({ qty: 1, price: 1000, matPrice: 800, laborPrice: 200 })]),
      TEST_RULESET,
    );
    const kinds = r.steps.map((s) => s.kind);
    expect(kinds).toContain("material");
    expect(kinds).toContain("labor");
    expect(kinds).toContain("direct");
    expect(kinds).toContain("factor");
    expect(kinds).toContain("contingency");
    expect(kinds).toContain("swc");
    expect(kinds).toContain("total");
    // ทุกบรรทัด % มีหมายเหตุที่มาอัตรา
    for (const s of r.steps) {
      if (s.kind === "contingency" || s.kind === "swc") {
        expect(s.notes?.some((n) => n.includes("อัตราจาก"))).toBe(true);
      }
    }
  });
});
