// เทสต์สูตรคิดค่าเครื่องจักร (ว 475) — golden จากตารางจริง + กฎการปฏิเสธ (ผิดเงื่อนไข = error ไม่เดาค่า)
import { describe, expect, it } from "vitest";
import { W475_2569_SCHEDULE as S } from "../ruleset-w475-2569";
import { machineryCost } from "./machinery";

const FIVE = S.items.filter((i) => i.priced === "five");
const LUMP = S.items.filter((i) => i.priced === "lump");
const NONE = S.items.filter((i) => i.priced === "none");

const itemAt = (entryNo: number, label: string) => {
  const it = S.items.find((i) => i.entryNo === entryNo && i.label === label);
  if (!it) throw new Error(`ไม่พบรายการ ${entryNo} · ${label}`);
  return it;
};

const q = (
  it: { entryNo: number; label: string; occurrence: number },
  fuelPriceSatang: number,
  extra: { rainy?: boolean; quantity?: number } = {},
) => ({ entryNo: it.entryNo, label: it.label, occurrence: it.occurrence, fuelPriceSatang, ...extra });

describe("machineryCost — ค่าที่พิมพ์ในตาราง (golden)", () => {
  const small = itemAt(1, "ขนาดเบา");
  const haul = itemAt(2, "ขุด - ขน");

  it("สภาพปกติ 25.00: ขนาดเบา = 1.67 บาท/ตร.ม. (145 + 22)", () => {
    const r = machineryCost(S, q(small, 2500, { quantity: 100 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.isLump).toBe(false);
    expect(r.rainy).toBe(false);
    expect(r.perUnitSatang).toBe(167);
    expect(r.amountSatang).toBe(16_700);
    expect(r.unit).toBe("ตร.ม.");
    expect(r.notes.join(" ")).toContain("1.45");
    expect(r.notes.join(" ")).toContain("0.22");
    expect(r.notes.join(" ")).toContain("ยังไม่รวม Factor F");
  });

  it("สภาพฝนชุก 25.00: ขนาดเบา = 1.73 บาท/ตร.ม. (145 + 28)", () => {
    const r = machineryCost(S, q(small, 2500, { rainy: true, quantity: 100 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rainy).toBe(true);
    expect(r.perUnitSatang).toBe(173);
    expect(r.amountSatang).toBe(17_300);
  });

  it("ขุด - ขน 25.00: 20.69 บาท/ลบ.ม. หลวม × 3 = 62.07 บาท", () => {
    const r = machineryCost(S, q(haul, 2500, { quantity: 3 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.perUnitSatang).toBe(2069);
    expect(r.amountSatang).toBe(6207);
    expect(r.unit).toBe("ลบ.ม. หลวม");
  });

  it("69.00 (ปลายตาราง): ค่าดำเนินการขึ้น แต่ค่าเสื่อมราคาเดิม → 2.23 / 2.29 บาท", () => {
    const n = machineryCost(S, q(small, 6900));
    const r = machineryCost(S, q(small, 6900, { rainy: true }));
    expect(n.ok && n.perUnitSatang).toBe(223);
    expect(r.ok && r.perUnitSatang).toBe(229);
  });

  it("ปัดเศษ half-up เป็นสตางค์ครั้งเดียวตอนคูณปริมาณ (และระบุว่ายังไม่ยืนยันกับต้นฉบับ)", () => {
    const a = machineryCost(S, q(small, 2500, { quantity: 0.1 })); // 16.7 → 17
    const b = machineryCost(S, q(small, 2500, { rainy: true, quantity: 2.5 })); // 432.5 → 433
    expect(a.ok && a.amountSatang).toBe(17);
    expect(b.ok && b.amountSatang).toBe(433);
    if (!b.ok) return;
    expect(b.notes.join(" ")).toContain("ยังไม่ยืนยันกับต้นฉบับ");
  });

  it("ไม่ระบุปริมาณ = คิดเฉพาะราคา/หน่วย (amount = null)", () => {
    const r = machineryCost(S, q(small, 2500));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.perUnitSatang).toBe(167);
    expect(r.amountSatang).toBeNull();
  });

  it("ชื่อซ้ำในลำดับเดียว: occurrence ใช้แยกบรรทัด", () => {
    const dup = S.items.find((i) => i.occurrence === 2);
    expect(dup).toBeDefined();
    if (!dup) return;
    const r = machineryCost(S, { ...q(dup, 2500), occurrence: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // ต้องชี้บรรทัด occurrence 2 จริง ไม่ใช่ stop ที่ occurrence 1
    expect(r.item.occurrence).toBe(2);
    expect(r.item.entryNo).toBe(dup.entryNo);
    expect(r.item.label).toBe(dup.label);

    const first = machineryCost(S, { ...q(dup, 2500), occurrence: undefined });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.item.occurrence).toBe(1);
    expect(first.item.entryNo).toBe(dup.entryNo);
  });

  it("ขอบช่วงน้ำมัน: 2599 อยู่ช่วงก่อน · 2600 ขึ้นช่วงถัดไป (ช่วงปิดสองด้าน)", () => {
    const a = machineryCost(S, q(small, 2599));
    const b = machineryCost(S, q(small, 2600));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.band.fuelMinSatang).toBe(2500);
    expect(a.band.fuelMaxSatang).toBe(2599);
    expect(b.band.fuelMinSatang).toBe(2600);
    expect(b.band.fuelMinSatang).toBe(a.band.fuelMaxSatang + 1);
  });

  it("ผลลัพธ์ระบุแหล่งที่มา: หัวตาราง + หน้าต้นฉบับ (+ ชุดกฎเมื่อส่ง provenance)", () => {
    const r = machineryCost(S, { ...q(small, 2500), provenance: { rulesetId: "rs-test", rulesetChecksum: "abc123" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = r.notes.join(" ");
    expect(text).toContain(S.titlePrinted);
    expect(text).toContain(`หน้าต้นฉบับ ${r.band.sourcePages[0]}–${r.band.sourcePages[1]}`);
    expect(text).toContain("rs-test");
    expect(text).toContain("abc123");
  });
});

describe("machineryCost — ค่าก้อนเดียว (lump)", () => {
  it("ค่าติดตั้งเครื่องผสม 250,000 บาท/ครั้ง — ไม่คูณหน่วย implicitly", () => {
    const lump = LUMP[0];
    expect(lump).toBeDefined();
    const r = machineryCost(S, q(lump, 2500));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.isLump).toBe(true);
    expect(r.perUnitSatang).toBe(25_000_000);
    expect(r.amountSatang).toBeNull();
    expect(r.notes.join(" ")).toContain("คิดเป็นครั้ง");

    // ค่าก้อนเดียวไม่มีคอลัมน์ฝนชุก — ใช้ค่าเดียวกันและต้องบอกผู้ใช้
    const rain = machineryCost(S, q(lump, 2500, { rainy: true }));
    expect(rain.ok).toBe(true);
    if (!rain.ok) return;
    expect(rain.perUnitSatang).toBe(25_000_000);
    expect(rain.notes.join(" ")).toContain("ไม่มีคอลัมน์แยกสภาพฝนชุก");
  });

  it("จำนวนครั้งเป็นจำนวนเต็มเท่านั้น (2 ครั้ง = 500,000 บาท · 1.5 ครั้ง = error)", () => {
    const lump = LUMP[0];
    const two = machineryCost(S, q(lump, 2500, { quantity: 2 }));
    expect(two.ok && two.amountSatang).toBe(50_000_000);
    const bad = machineryCost(S, q(lump, 2500, { quantity: 1.5 }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.code).toBe("BAD_QUANTITY");
    const zero = machineryCost(S, q(lump, 2500, { quantity: 0 }));
    expect(zero.ok).toBe(false);
    // เกินขอบเขตสตางค์ที่แม่นยำ → ปฏิเสธ ไม่คืนยอดที่เพี้ยน
    const huge = machineryCost(S, q(lump, 2500, { quantity: 1e12 }));
    expect(huge.ok).toBe(false);
    if (huge.ok) return;
    expect(huge.code).toBe("BAD_QUANTITY");
  });

  it("ค่าก้อนเดียวตัวที่สอง 150,000 บาท/ครั้ง ตรงตามประกาศ", () => {
    const lump = LUMP[1];
    expect(lump).toBeDefined();
    const r = machineryCost(S, q(lump, 2500));
    expect(r.ok && r.perUnitSatang).toBe(15_000_000);
  });
});

describe("machineryCost — ปฏิเสธเมื่อผิดเงื่อนไข (ห้ามเดา)", () => {
  const small = itemAt(1, "ขนาดเบา");

  it("ราคาน้ำมันนอกช่วงตาราง → FUEL_OUT_OF_RANGE (2499 / 7000)", () => {
    for (const fuel of [2499, 7000]) {
      const r = machineryCost(S, q(small, fuel));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.code).toBe("FUEL_OUT_OF_RANGE");
    }
    // ขอบเขตที่ประกาศครอบ → ผ่าน
    expect(machineryCost(S, q(small, 2500)).ok).toBe(true);
    expect(machineryCost(S, q(small, 6999)).ok).toBe(true);
  });

  it("ราคาน้ำมันไม่ใช่ตัวเลข → FUEL_OUT_OF_RANGE", () => {
    for (const fuel of [NaN, Infinity]) {
      const r = machineryCost(S, q(small, fuel));
      expect(r.ok).toBe(false);
    }
  });

  it("บรรทัดหัวข้อที่ไม่มีราคา → ITEM_NO_PRICE", () => {
    const heading = NONE[0];
    expect(heading).toBeDefined();
    const r = machineryCost(S, q(heading, 2500));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("ITEM_NO_PRICE");
  });

  it("ไม่พบรายการ → ITEM_NOT_FOUND", () => {
    const r = machineryCost(S, { entryNo: 999, label: "ไม่มีในตาราง", fuelPriceSatang: 2500 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("ITEM_NOT_FOUND");
  });

  it("ปริมาณ 0 / ติดลบ / ไม่ใช่ตัวเลข → BAD_QUANTITY", () => {
    for (const quantity of [0, -1, NaN]) {
      const r = machineryCost(S, q(small, 2500, { quantity }));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.code).toBe("BAD_QUANTITY");
    }
  });

  it("เพดานความแม่นยำ: ปริมาณ 1e12 → BAD_QUANTITY (สตางค์เกิน MAX_SAFE_INTEGER)", () => {
    const r = machineryCost(S, q(small, 2500, { quantity: 1e12 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("BAD_QUANTITY");
    expect(r.error).toContain("MAX_SAFE_INTEGER");
  });

  it("ปริมาณทศนิยม ≤4 ตำแหน่งคำนวณตรง · เกิน 4 ตำแหน่ง → BAD_QUANTITY (ไม่ปัดเงียบ)", () => {
    for (const quantity of [0.12345, 12.37501]) {
      const r = machineryCost(S, q(small, 2500, { quantity }));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.code).toBe("BAD_QUANTITY");
    }
    // 3 ตำแหน่ง (ปริมาณงานจริง เช่น 12.375 ตร.ม.) → 167 × 12.375 = 2,066.625 → 2,067
    const three = machineryCost(S, q(small, 2500, { quantity: 12.375 }));
    expect(three.ok && three.amountSatang).toBe(2067);
    // 4 ตำแหน่งที่ค่ามาก (ทดสอบ tolerance ตาม ulp) → 167 × 12,345.6789 = 2,061,728.3763 → 2,061,728
    const four = machineryCost(S, q(small, 2500, { quantity: 12345.6789 }));
    expect(four.ok && four.amountSatang).toBe(2_061_728);
    // 2 ตำแหน่ง → 167 × 1.25 = 208.75 → 209
    const two = machineryCost(S, q(small, 2500, { quantity: 1.25 }));
    expect(two.ok && two.amountSatang).toBe(209);
  });

  it("ยอดเล็กมากที่ปัดเป็น 0.00 ต้องบอกผู้ใช้ว่าเป็นผลของการปัดเศษ", () => {
    const r = machineryCost(S, q(small, 2500, { quantity: 0.0001 })); // 167 × 0.0001 = 0.0167 สตางค์ → 0
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.amountSatang).toBe(0);
    expect(r.notes.join(" ")).toContain("ปัดลงต่ำกว่า 0.01 บาท");
  });

  it("ข้อมูลตารางเพี้ยน (รวม ≠ ค่าดำเนินการ + ค่าเสื่อมราคา) → DATA_INCONSISTENT และไม่แก้ข้อมูลต้นฉบับ", () => {
    const clone = JSON.parse(JSON.stringify(S)) as typeof S;
    const idx = clone.items.findIndex((i) => i.entryNo === 1 && i.label === "ขนาดเบา");
    clone.bands[0].totalNormalSatang[idx] = (clone.bands[0].totalNormalSatang[idx] as number) + 1;
    const r = machineryCost(clone, q(clone.items[idx], 2500));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("DATA_INCONSISTENT");
    // ต้นฉบับในหน่วยความจำไม่ถูกแก้
    const b0 = S.bands.find((b) => b.fuelMinSatang === 2500);
    expect(b0?.totalNormalSatang[idx]).toBe(167);
  });

  it("ช่องราคาว่างในบรรทัดที่มีสถานะมีราคา → DATA_INCONSISTENT", () => {
    const clone = JSON.parse(JSON.stringify(S)) as typeof S;
    const idx = clone.items.findIndex((i) => i.entryNo === 1 && i.label === "ขนาดเบา");
    clone.bands[0].depRainySatang[idx] = null;
    const r = machineryCost(clone, q(clone.items[idx], 2500, { rainy: true }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("DATA_INCONSISTENT");
  });
});

describe("machineryCost — ภาพรวมชุดข้อมูล", () => {
  it("บรรทัดที่มีราคาทั้งหมดคำนวณได้ทุกช่วงน้ำมัน (ไม่ throw / ไม่ error)", () => {
    const failures: string[] = [];
    for (const it of [...FIVE, ...LUMP]) {
      for (const band of S.bands) {
        const r = machineryCost(S, q(it, band.fuelMinSatang));
        if (!r.ok) failures.push(`${it.label} @${band.fuelMinSatang}: ${r.error}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
