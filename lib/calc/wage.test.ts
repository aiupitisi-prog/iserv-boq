// เทสต์สูตรค่าแรงงาน/ค่าดำเนินการตามบัญชี ว 480 — golden จากแถวราคาจริง + กฎการปฏิเสธ (ไม่เดา)
import { describe, expect, it } from "vitest";
import { W480_2569_SCHEDULE, W480_2569_STATS } from "../ruleset-w480-2569";
import type { WageSchedule } from "../ruleset";
import { countWageRates, listWageRates, wageCost } from "./wage";

const entry = (no: string) => {
  const e = W480_2569_SCHEDULE.entries.find((x) => x.no === no);
  if (!e) throw new Error(`ไม่พบรายการ ${no}`);
  return e;
};

describe("listWageRates — แปลงรายการเป็นแถวราคาที่เลือกได้", () => {
  it("1.1 มี 9 แถวราคา: 3 ขนาดเสาเข็ม × 3 ช่วงจำนวน และกลุ่มชื่อติดไปยังแถวถัดไป", () => {
    const rates = listWageRates(entry("1.1"));
    expect(rates).toHaveLength(9);
    expect(rates.map((r) => r.priceBaht)).toEqual([95, 97, 133, 112, 114, 159, 132, 135, 183]);
    expect(rates[0].groupName).toBe('เสาเข็ม ขนาด ศก. 4" x 4.00 ม.');
    expect(rates[1].groupName).toBe('เสาเข็ม ขนาด ศก. 4" x 4.00 ม.');
    expect(rates[2].groupName).toBe('เสาเข็ม ขนาด ศก. 4" x 4.00 ม.');
    expect(rates[3].groupName).toBe('เสาเข็ม ขนาด ศก. 5" x 5.00 ม.');
    expect(rates[0].note).toBe("จำนวน 200 ต้นขึ้นไป");
    expect(rates[0].label).toContain('เสาเข็ม ขนาด ศก. 4" x 4.00 ม.');
    expect(rates[0].label).toContain("95 บาท/ต้น");
    expect(rates.every((r) => r.ambiguous === false)).toBe(true);
  });

  it("3.12 variant ซ้อน 2 ชั้น: path [0,0] = Dia 1/2\" 103 บาท/ชุด", () => {
    const rates = listWageRates(entry("3.12"));
    expect(rates).toHaveLength(10);
    const r = rates.find((x) => x.key === "3.12|0.0|0");
    expect(r).toBeDefined();
    expect(r?.priceBaht).toBe(103);
    expect(r?.unit).toBe("ชุด");
    expect(r?.variantNames).toEqual(["วายสเตนเนอร์, ข้อต่ออ่อนชนิดรับแรงดัน", 'Dia 1/2"']);
    expect(r?.label).toContain("Dia 1/2");
  });

  it("รายการที่มีทั้ง prices และ variants (2.9.48): แถว base ที่ note ซ้ำถูก mark ambiguous", () => {
    const rates = listWageRates(entry("2.9.48"));
    expect(rates).toHaveLength(4);
    expect(rates[0].priceBaht).toBe(308);
    expect(rates[1].priceBaht).toBe(226);
    expect(rates[0].ambiguous).toBe(true);
    expect(rates[1].ambiguous).toBe(true);
    expect(rates[2].priceBaht).toBe(256);
    expect(rates[2].ambiguous).toBe(false);
    expect(rates[3].priceBaht).toBe(185);
  });

  it("หัวข้อที่ไม่มีราคา (เช่น 1) → 0 แถวราคา", () => {
    expect(listWageRates(entry("1"))).toHaveLength(0);
    expect(listWageRates(entry("2"))).toHaveLength(0);
  });

  it("ทุกแถวราคาในชุดจริง: 1,471 แถว = tier 515 + bullet 956 และ key ไม่ซ้ำ", () => {
    const total = W480_2569_STATS.tierRows + W480_2569_STATS.bulletRows;
    expect(countWageRates(W480_2569_SCHEDULE)).toBe(total);
    expect(total).toBe(1471);
    const keys: string[] = [];
    for (const e of W480_2569_SCHEDULE.entries) {
      for (const r of listWageRates(e)) {
        keys.push(r.key);
        expect(Number.isSafeInteger(r.priceBaht) && r.priceBaht > 0, `${e.no} ${r.key}`).toBe(true);
        expect(r.unit.trim().length > 0, `${e.no} ${r.key}`).toBe(true);
      }
    }
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(total);
  });

  it("ไม่ mutate ข้อมูล frozen ของชุดจริง", () => {
    const before = JSON.stringify(entry("1.1"));
    listWageRates(entry("1.1"));
    expect(JSON.stringify(entry("1.1"))).toBe(before);
  });
});

describe("wageCost — golden จากราคาที่พิมพ์ในบัญชี", () => {
  it("1.1 แถว 95 บาท/ต้น × 12.5 ต้น = 1,187.50", () => {
    const r = wageCost(W480_2569_SCHEDULE, { entryNo: "1.1", priceIndex: 0, quantity: 12.5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.perUnitSatang).toBe(9_500);
    expect(r.amountSatang).toBe(118_750);
    expect(r.unit).toBe("ต้น");
    expect(r.notes.join(" ")).toContain("1,187.50");
    expect(r.notes.join(" ")).toContain("ยังไม่รวมค่าวัสดุ Factor F");
    expect(r.notes.join(" ")).toContain("ไม่ตรวจว่าปริมาณที่กรอกตรงกับเงื่อนไขจำนวน");
  });

  it("1.1 แถว 133 บาท/ต้น × 75 ต้น = 9,975.00 (ช่วงจำนวน 50–100)", () => {
    const r = wageCost(W480_2569_SCHEDULE, { entryNo: "1.1", priceIndex: 2, quantity: 75 });
    expect(r.ok && r.perUnitSatang).toBe(13_300);
    expect(r.ok && r.amountSatang).toBe(997_500);
  });

  it("1.2.1.1 แถว 562 บาท/ต้น × 25 ต้น = 14,050.00", () => {
    const r = wageCost(W480_2569_SCHEDULE, { entryNo: "1.2.1.1", priceIndex: 2, quantity: 25 });
    expect(r.ok && r.perUnitSatang).toBe(56_200);
    expect(r.ok && r.amountSatang).toBe(1_405_000);
  });

  it("3.12 path [0,0] 103 บาท/ชุด × 10 ชุด = 1,030.00", () => {
    const r = wageCost(W480_2569_SCHEDULE, {
      entryNo: "3.12",
      variantPath: [0, 0],
      priceIndex: 0,
      quantity: 10,
    });
    expect(r.ok && r.perUnitSatang).toBe(10_300);
    expect(r.ok && r.amountSatang).toBe(103_000);
    if (!r.ok) return;
    expect(r.rate.variantNames.join(" ")).toContain("Dia 1/2");
  });

  it("4.1 path [0,0] 46 บาท/เมตร × 100 เมตร = 4,600.00", () => {
    const r = wageCost(W480_2569_SCHEDULE, {
      entryNo: "4.1",
      variantPath: [0, 0],
      priceIndex: 0,
      quantity: 100,
    });
    expect(r.ok && r.perUnitSatang).toBe(4_600);
    expect(r.ok && r.amountSatang).toBe(460_000);
  });

  it("2.9.48 แถว base 308 × 1 = 308.00 และ variant [0] 256 × 2 = 512.00 (พร้อมเตือนแถวซ้ำ)", () => {
    const base = wageCost(W480_2569_SCHEDULE, { entryNo: "2.9.48", priceIndex: 0, quantity: 1 });
    expect(base.ok && base.amountSatang).toBe(30_800);
    if (!base.ok) return;
    expect(base.rate.ambiguous).toBe(true);
    expect(base.notes.join(" ")).toContain("คำอธิบายซ้ำ");

    const variant = wageCost(W480_2569_SCHEDULE, {
      entryNo: "2.9.48",
      variantPath: [0],
      priceIndex: 0,
      quantity: 2,
    });
    expect(variant.ok && variant.amountSatang).toBe(51_200);
    if (!variant.ok) return;
    expect(variant.rate.ambiguous).toBe(false);
    expect(variant.rate.note).toBe("รื้อกอง");
  });

  it("ไม่ระบุปริมาณ = คิดเฉพาะราคา/หน่วย (amount = null)", () => {
    const r = wageCost(W480_2569_SCHEDULE, { entryNo: "1.1", priceIndex: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.perUnitSatang).toBe(9_500);
    expect(r.amountSatang).toBeNull();
    expect(r.notes.join(" ")).toContain("95.00 บาท/ต้น");
  });

  it("ปัด half-up ครั้งเดียว: 95 × 12.375 = 1,175.625 → 1,175.63", () => {
    const r = wageCost(W480_2569_SCHEDULE, { entryNo: "1.1", priceIndex: 0, quantity: 12.375 });
    expect(r.ok && r.amountSatang).toBe(117_563);
  });

  it("ยอดเล็กกว่า 0.01 บาท: 95 × 0.0001 = 0.0095 → 0.01 (1 สตางค์)", () => {
    const r = wageCost(W480_2569_SCHEDULE, { entryNo: "1.1", priceIndex: 0, quantity: 0.0001 });
    expect(r.ok && r.amountSatang).toBe(1);
    if (!r.ok) return;
    expect(r.notes.join(" ")).toContain("0.01");
  });

  it("provenance + คำเตือน mirror-unverified ถูกส่งต่อใน notes", () => {
    const r = wageCost(W480_2569_SCHEDULE, {
      entryNo: "1.1",
      priceIndex: 0,
      provenance: {
        rulesetId: "reg2569-wage-w480",
        rulesetChecksum: "f15226a818ecc23e",
        sourceDoc: "หนังสือกรมบัญชีกลาง ที่ กค 0433.2/ว 480",
        sourceKind: "mirror-unverified",
        verifiedAgainstGazette: false,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = r.notes.join(" ");
    expect(text).toContain("reg2569-wage-w480");
    expect(text).toContain("f15226a818ecc23e");
    expect(text).toContain("กค 0433.2/ว 480");
    expect(text).toContain("ยังไม่ยืนยันกับราชกิจจานุเบกษา");
  });

  it("หมายเหตุแถวราคา (เช่น 5.1 หมายเหตุแยกบรรทัด) ถูกเก็บตามที่พิมพ์ ไม่ตีความเป็นเงื่อนไข", () => {
    const r = wageCost(W480_2569_SCHEDULE, {
      entryNo: "5.1",
      variantPath: [0, 0],
      priceIndex: 0,
      quantity: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rate.note).toBe("ค่าแรง หมายถึง ค่าติดตั้งเครื่อง");
    expect(r.notes.join(" ")).toContain("หมายเหตุในแถวราคา (ตามที่พิมพ์)");
    // label ต้องไม่ทำให้ footnote ดูเหมือนเป็นคุณสมบัติของขนาดนั้น — ต้องมีคำว่า "หมายเหตุ:"
    expect(r.rate.label).toContain("หมายเหตุ:");
  });

  it("หมายเหตุของรายการ (entry.notes) ต้องติดไปกับผลลัพธ์ ไม่ซ่อนเฉพาะในหน้ารายละเอียด", () => {
    const r = wageCost(W480_2569_SCHEDULE, { entryNo: "1.1", priceIndex: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(entry("1.1").notes.length).toBeGreaterThan(0);
    const text = r.notes.join(" ");
    expect(text).toContain("หมายเหตุรายการ (ตามที่พิมพ์)");
    for (const n of entry("1.1").notes) expect(text).toContain(n);
  });

  it("หมายเหตุหัวกลุ่มย่อย/variant ต้องติดไปกับแถวราคาและ notes (เช่น 5.10 'ค่าแรง / 1 เมตร')", () => {
    const rates = listWageRates(entry("5.10"));
    const r = rates.find((x) => x.variantNote === "ค่าแรง / 1 เมตร");
    expect(r).toBeDefined();
    expect(r!.label).toContain("หมายเหตุหัวกลุ่ม");
    const cost = wageCost(W480_2569_SCHEDULE, {
      entryNo: "5.10",
      variantPath: r!.variantPath,
      priceIndex: r!.priceIndex,
    });
    expect(cost.ok).toBe(true);
    if (!cost.ok) return;
    expect(cost.rate.variantNote).toBe("ค่าแรง / 1 เมตร");
    expect(cost.notes.join(" ")).toContain("หมายเหตุหัวกลุ่ม (ตามที่พิมพ์): ค่าแรง / 1 เมตร");
  });
});

describe("wageCost — ปฏิเสธเมื่อเลือกผิด/ข้อมูลเพี้ยน (ไม่เดา)", () => {
  it("ไม่พบรายการ → ENTRY_NOT_FOUND", () => {
    const r = wageCost(W480_2569_SCHEDULE, { entryNo: "9.9.9", priceIndex: 0 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("ENTRY_NOT_FOUND");
  });

  it("รายการหัวข้อไม่มีราคา → RATE_NOT_FOUND", () => {
    const r = wageCost(W480_2569_SCHEDULE, { entryNo: "1", priceIndex: 0 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("RATE_NOT_FOUND");
  });

  it("variant path ผิด / priceIndex เกิน → RATE_NOT_FOUND", () => {
    const p = wageCost(W480_2569_SCHEDULE, { entryNo: "3.12", variantPath: [9], priceIndex: 0 });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.code).toBe("RATE_NOT_FOUND");

    const i = wageCost(W480_2569_SCHEDULE, { entryNo: "1.1", priceIndex: 9 });
    expect(i.ok).toBe(false);
    if (!i.ok) expect(i.code).toBe("RATE_NOT_FOUND");
  });

  it("variantPath/priceIndex ที่ไม่ใช่จำนวนเต็ม → RATE_NOT_FOUND (typed error ไม่ throw)", () => {
    for (const variantPath of [[0.5], [NaN], [-1], [0, 1.5]]) {
      const r = wageCost(W480_2569_SCHEDULE, { entryNo: "3.12", variantPath, priceIndex: 0 });
      expect(r.ok, JSON.stringify(variantPath)).toBe(false);
      if (!r.ok) expect(r.code).toBe("RATE_NOT_FOUND");
    }
    for (const priceIndex of [0.5, NaN, -1]) {
      const r = wageCost(W480_2569_SCHEDULE, { entryNo: "1.1", priceIndex });
      expect(r.ok, String(priceIndex)).toBe(false);
      if (!r.ok) expect(r.code).toBe("RATE_NOT_FOUND");
    }
  });

  it("ราคาไม่ใช่จำนวนเต็มบวก/ไม่มีหน่วย → DATA_INCONSISTENT (ใช้ schedule สังเคราะห์)", () => {
    const base = entry("1.1");
    const zero: WageSchedule = {
      entries: [{ ...base, prices: [{ price: 0, unit: "ต้น" }], variants: [] }],
      notices: [],
    };
    const rz = wageCost(zero, { entryNo: "1.1", priceIndex: 0 });
    expect(rz.ok).toBe(false);
    if (!rz.ok) expect(rz.code).toBe("DATA_INCONSISTENT");

    const noUnit: WageSchedule = {
      entries: [{ ...base, prices: [{ price: 95 }], variants: [] }],
      notices: [],
    };
    const ru = wageCost(noUnit, { entryNo: "1.1", priceIndex: 0 });
    expect(ru.ok).toBe(false);
    if (!ru.ok) expect(ru.code).toBe("DATA_INCONSISTENT");
  });

  it("ปริมาณ 0/ติดลบ/NaN/Infinity/ทศนิยม 5 ตำแหน่ง → BAD_QUANTITY", () => {
    for (const quantity of [0, -1, NaN, Infinity, 1.23456]) {
      const r = wageCost(W480_2569_SCHEDULE, { entryNo: "1.1", priceIndex: 0, quantity });
      expect(r.ok, String(quantity)).toBe(false);
      if (!r.ok) expect(r.code).toBe("BAD_QUANTITY");
    }
  });

  it("ปริมาณมากจนสตางค์เกิน safe integer → BAD_QUANTITY", () => {
    const r = wageCost(W480_2569_SCHEDULE, { entryNo: "1.1", priceIndex: 0, quantity: 1e15 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("BAD_QUANTITY");
  });
});
