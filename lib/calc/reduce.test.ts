// เวกเตอร์ทดสอบการปรับลดราคาจากผู้เสนอราคา (แนบท้ายสัญญา)
// ตัวเลขทั้งหมดเป็นข้อมูลทดสอบที่คิดให้ลงตัวเอง — ไม่ใช่ตัวเลขกฎหมาย
// เกณฑ์เหล็กในเทสต์: ผลรวมทุกบรรทัดหลังปรับลด = วงเงินตามสัญญาพอดี (สตางค์แมน)
import { describe, expect, it } from "vitest";
import type { BoqItem, BoqProject } from "../boq";
import { newId } from "../boq";
import { computeGovBOQ } from "./compute";
import { computePriceReduction } from "./reduce";
import type { Ruleset } from "../ruleset";

function mkProject(items: Array<Partial<BoqItem> & { qty: number; price: number }>): BoqProject {
  return {
    id: "p1",
    name: "ทดสอบปรับลดราคา",
    address: "ทดสอบ",
    boqType: "ปร.1",
    createdAt: "2026-01-01T00:00:00.000Z",
    items: items.map((it) => ({
      id: newId(),
      section: it.section ?? "งานทดสอบ",
      name: it.name ?? "รายการทดสอบ",
      unit: it.unit ?? "หน่วย",
      part: it.part,
      qty: it.qty,
      price: it.price,
    })),
  };
}

describe("computePriceReduction (แนบท้ายสัญญา — ปรับลดราคาจากผู้เสนอราคา)", () => {
  it("กรณีทั่วไป ไม่มีตาราง F — ลดทุกรายการด้วยอัตราเดียวกัน ผลรวม = ราคาตามคำเสนอพอดี", () => {
    // ก. 3,000.00 + ข. 2,000.00 = ราคากลางส่วนรายการ 5,000.00 → ลดลง 15% เหลือ 4,250.00
    const p = mkProject([
      { name: "งานวัสดุ", qty: 10, price: 300 },
      { name: "งานแรงงาน", qty: 2, price: 1000 },
    ]);
    const calc = computeGovBOQ(p, null);
    const r = computePriceReduction(p, calc, 4250);

    expect(r.ok).toBe(true);
    expect(r.reducibleBaseSat).toBe(500_000); // สตางค์
    expect(r.winningSat).toBe(425_000);
    expect(r.winItemsSat).toBe(425_000);
    expect(r.diffSat).toBe(75_000);
    expect(Math.round(r.reducePct! * 100) / 100).toBe(15);
    expect(r.lines.map((l) => l.reducedSat)).toEqual([255_000, 170_000]);
    expect(r.lines[0].reducedUnitBaht).toBe(255); // 2,550.00 ÷ 10 หน่วย
    expect(r.lines[1].reducedUnitBaht).toBe(850); // 1,700.00 ÷ 2 หน่วย
    expect(r.remainderSat).toBe(0);
    expect(r.balanceItemId).toBeNull();
    // กฎเหล็ก: ผลรวมต้องพอดีวงเงินตามสัญญา
    expect(r.lines.reduce((a, b) => a + b.reducedSat, 0)).toBe(r.winningSat);
  });

  it("เศษการปัดเศษเหวี่ยงเข้ารายการเงินมากที่สุด — ผลรวมยังตรงเป้าหมายพอดี", () => {
    // ฐาน 1,000.01 + 1,000.01 = 2,000.02; เป้า 1,500.01 (ลด ~25%)
    // แจก per-row คนละแถวได้ 75,001 สตางค์ → รวม 150,002 → เกิน 1 สตางค์ → รายการเงินมากที่สุด (ตัวแรก) รับผลต่ำลง
    const p = mkProject([
      { name: "งาน ก.", qty: 1, price: 1000.01 },
      { name: "งาน ข.", qty: 1, price: 1000.01 },
    ]);
    const calc = computeGovBOQ(p, null);
    const r = computePriceReduction(p, calc, 1500.01);

    expect(r.ok).toBe(true);
    expect(r.winItemsSat).toBe(150_001);
    expect(r.lines.map((l) => l.reducedSat)).toEqual([75_000, 75_001]);
    expect(r.remainderSat).toBe(0); // เศษหมด — โยนเข้ารายการสุดท้ายแล้ว
    expect(r.balanceItemId).toBe(r.lines[0].itemId);
    expect(r.balanceAppliedSat).toBe(-1);
    expect(r.lines[0].reducedUnitBaht).toBe(750);
    expect(r.lines[1].reducedUnitBaht).toBe(750.01);
    expect(r.lines.reduce((a, b) => a + b.reducedSat, 0)).toBe(r.winningSat);
  });

  it("ครุภัณฑ์แยกฐาน Factor F — ต้นทุนครุภัณฑ์เข้าส่วนปรับลดตามราคาตัวเอง", () => {
    // ก่อสร้าง 2,000.00 + ครุภัณฑ์ (3×500) 1,500.00 = ฐาน 3,500.00; เป้า 2,800.05 (ลด ~20%)
    const p = mkProject([
      { name: "งานก่อสร้าง", qty: 1, price: 2000 },
      { name: "ครุภัณฑ์", part: "equipment", qty: 3, price: 500 },
    ]);
    const calc = computeGovBOQ(p, null); // factorF null → afterFactor = directCost
    expect(calc.equipmentAmount).toBe(150_000);
    const r = computePriceReduction(p, calc, 2800.05);

    expect(r.ok).toBe(true);
    expect(r.lines.find((l) => l.part === "equipment")!.reducedSat).toBe(120_002); // 150,000×280,005/350,000 → ปัด
    expect(r.lines.find((l) => l.part === "construction")!.reducedSat).toBe(160_003);
    expect(r.lines.reduce((a, b) => a + b.reducedSat, 0)).toBe(r.winningSat);
  });

  it("ส่วนคงเดิม (เงินเผื่อจำเป็น/ค่าดำเนินงานจากชุดกฎ) ไม่ถูกปรับลด — เป้าหมายหักส่วนคงเดิมก่อน", () => {
    // ฐานรายการ 1,000.00; ชุดกฎ เงินเผื่อ 5% = 50.00, ค่าดำเนินงาน 10% ของ 1,050 = 105.00
    // ส่วนคงเดิม 155.00 — ราคาตามคำเสนอ 909.00 → เป้าหมายรายการ = 754.00
    const rs: Ruleset = {
      id: "rs-test",
      name: "ชุดกฎทดสอบ",
      sourceDoc: "เอกสารทดสอบ — ตัวเลขตั้งเองเพื่อเทสต์",
      effectiveFrom: "1970-01-01",
      checksum: "0000",
      contingencyPct: 5,
      swcPct: 10,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const p = mkProject([{ name: "งานรวม", qty: 1, price: 1000 }]);
    const calc = computeGovBOQ(p, rs);
    expect(calc.contingency).toBe(5_000);
    expect(calc.swc).toBe(10_500);
    const r = computePriceReduction(p, calc, 909);

    expect(r.ok).toBe(true);
    expect(r.fixedTotalSat).toBe(15_500);
    expect(r.fixedLines.length).toBe(2);
    expect(r.winItemsSat).toBe(75_400);
    expect(r.lines[0].reducedSat).toBe(75_400);
    expect(r.winningSat).toBe(90_900);
    expect(r.lines.reduce((a, b) => a + b.reducedSat, 0) + r.fixedTotalSat).toBe(r.winningSat);
  });

  it("ข้อความแจ้งเตือน unverified ต้องมาครบเสมอ (ห้ามเดาข้อกฎหมาย)", () => {
    const p = mkProject([{ qty: 1, price: 1000 }]);
    const r = computePriceReduction(p, computeGovBOQ(p, null), 500);
    expect(r.warnings.length).toBeGreaterThanOrEqual(3);
    expect(r.warnings.some((w) => w.includes("unverified"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("ว 651"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("3 จังหวัดชายแดนภาคใต้"))).toBe(true);
  });

  it("กรณีไม่ถูกต้อง — ราคาเสนอสูงกว่าราคากลาง / ไม่ได้กรอก / BOQ ว่าง / ส่วนคงเดิมกินวงเงิน", () => {
    const p = mkProject([{ name: "งานรวม", qty: 1, price: 1000 }]); // ฐาน 1,000
    const calc = computeGovBOQ(p, null);

    const high = computePriceReduction(p, calc, 1200);
    expect(high.ok).toBe(false);
    expect(high.error).toContain("สูงกว่าราคากลาง");

    const equal = computePriceReduction(p, calc, 1000);
    expect(equal.ok).toBe(false);
    expect(equal.error).toContain("ไม่ต้องปรับลดราคา");

    const empty = computePriceReduction(p, calc, 0);
    expect(empty.ok).toBe(false);
    expect(empty.error).toContain("ราคาตามคำเสนอ");

    const noItems = computePriceReduction(mkProject([ { qty: 0, price: 0 } ]), computeGovBOQ(mkProject([{ qty: 0, price: 0 }]), null), 500);
    expect(noItems.ok).toBe(false);
    expect(noItems.error).toContain("ไม่มีรายการราคา");

    // ส่วนคงเดิมมากจนวงเงินตามสัญญาไม่พอ
    const rs: Ruleset = { ...({} as Ruleset), id: "rs2", name: "s", sourceDoc: "s", effectiveFrom: "1970-01-01", checksum: "0", contingencyPct: 260, createdAt: "" };
    const c2 = computeGovBOQ(p, rs); // เงินเผื่อ 260% = 2,600
    const thin = computePriceReduction(p, c2, 500);
    expect(thin.ok).toBe(false);
    expect(thin.error).toContain("ส่วนที่คงเดิม");
  });
});
