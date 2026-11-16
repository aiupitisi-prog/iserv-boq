// เทสต์สูตรค่าขนส่ง (ว 477) — golden จากตารางจริง + กฎการปฏิเสธ (ผิดเงื่อนไข = error ไม่เดาค่า)
import { describe, expect, it } from "vitest";
import { W477_2569_SCHEDULE as S } from "../ruleset-w477-2569";
import { transportCost, type TransportCostQuery } from "./transport";

const q = (over: Partial<TransportCostQuery> = {}): TransportCostQuery => ({
  lorryCount: 6,
  hasTrailer: false,
  fuelPriceSatang: 2500,
  distanceKm: 1,
  cargo: "ton",
  conditionsAccepted: true,
  ...over,
});

describe("transportCost — ค่าที่พิมพ์ในตาราง (golden)", () => {
  it("6 ล้อ · 25.00 · ระยะ 1 กม. = 13.50 บาท/ตัน × 12.5 ตัน = 168.75", () => {
    const r = transportCost(S, q({ quantity: 12.5 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.basis).toBe("table");
    expect(r.perUnitSatang).toBe(1350);
    expect(r.amountSatang).toBe(16_875);
    expect(r.notes.join(" ")).toContain("13.50");
    expect(r.notes.join(" ")).toContain("ยังไม่รวม Factor F");
  });

  it("6 ล้อ · ระยะ 41 กม. = 127.32 บาท/ตัน × 3 = 381.96", () => {
    const r = transportCost(S, q({ distanceKm: 41, quantity: 3 }));
    expect(r.ok && r.perUnitSatang).toBe(12_732);
    expect(r.ok && r.amountSatang).toBe(38_196);
  });

  it("6 ล้อ · ระยะ 200 กม. = 611.85 บาท/ตัน (ขอบตาราง)", () => {
    const r = transportCost(S, q({ distanceKm: 200 }));
    expect(r.ok && r.perUnitSatang).toBe(61_185);
    if (!r.ok) return;
    expect(r.basis).toBe("table");
  });

  it("6 ล้อ · ระยะ 201 กม. เริ่มคิด กม.ละ 3.06 บาท/ตัน → 615.06", () => {
    const r = transportCost(S, q({ distanceKm: 201 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.basis).toBe("per-km");
    expect(r.perUnitSatang).toBe(61_506);
    expect(r.notes.join(" ")).toContain("กม.ละ 3.06");
  });

  it("6 ล้อ · ระยะ 1000 กม. (ขอบบน) = 3,060.00 บาท/ตัน", () => {
    const r = transportCost(S, q({ distanceKm: 1000 }));
    expect(r.ok && r.perUnitSatang).toBe(306_000);
  });

  it("6 ล้อ · คิดต่อลบ.ม. ระยะ 1 กม. = 18.89 × 2.5 = 47.225 → 47.23 (ปัด half-up)", () => {
    const r = transportCost(S, q({ cargo: "m3", quantity: 2.5 }));
    expect(r.ok && r.perUnitSatang).toBe(1889);
    expect(r.ok && r.amountSatang).toBe(4723);
  });

  it("6 ล้อ · 69.00 = 15.16/ตัน · 21.22/ลบ.ม. · กม.ละ 4.72/6.61 · หน้า 97–98", () => {
    const t = transportCost(S, q({ fuelPriceSatang: 6900 }));
    expect(t.ok && t.perUnitSatang).toBe(1516);
    if (!t.ok) return;
    expect(t.band.farPerTonSatang).toBe(472);
    expect(t.notes.join(" ")).toContain("หน้าต้นฉบับ 97–98");
    const tM3 = transportCost(S, q({ fuelPriceSatang: 6900, cargo: "m3" }));
    expect(tM3.ok && tM3.perUnitSatang).toBe(2122);
    expect(tM3.ok && tM3.band.farPerM3Satang).toBe(661);
  });

  it("10 ล้อ = 7.96/ตัน (ลบ.ม. 11.14) · 10 ล้อ + พ่วง = 4.37/ตัน (ลบ.ม. 6.12) ที่ 25.00", () => {
    const s2 = transportCost(S, q({ lorryCount: 10 }));
    expect(s2.ok && s2.perUnitSatang).toBe(796);
    const s2m3 = transportCost(S, q({ lorryCount: 10, cargo: "m3" }));
    expect(s2m3.ok && s2m3.perUnitSatang).toBe(1114);
    const s3 = transportCost(S, q({ lorryCount: 10, hasTrailer: true }));
    expect(s3.ok && s3.perUnitSatang).toBe(437);
    const s3m3 = transportCost(S, q({ lorryCount: 10, hasTrailer: true, cargo: "m3" }));
    expect(s3m3.ok && s3m3.perUnitSatang).toBe(612);
  });

  it("ไม่ระบุปริมาณ = คิดเฉพาะอัตราต่อหน่วย (amount = null)", () => {
    const r = transportCost(S, q());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.perUnitSatang).toBe(1350);
    expect(r.amountSatang).toBeNull();
  });

  it("ผลลัพธ์ระบุเงื่อนไข + ที่มา + provenance", () => {
    const r = transportCost(S, {
      ...q(),
      provenance: { rulesetId: "rs-transport", rulesetChecksum: "abc999" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = r.notes.join(" ");
    expect(text).toContain(S.conditions[0]);
    expect(text).toContain("ผู้ใช้ยืนยันแล้ว");
    expect(text).toContain(r.section.titlePrinted);
    expect(text).toContain(`หน้าต้นฉบับ ${r.band.sourcePages[0]}–${r.band.sourcePages[1]}`);
    expect(text).toContain("rs-transport");
    expect(text).toContain("abc999");
  });
});

describe("transportCost — ปฏิเสธเมื่อผิดเงื่อนไข (ห้ามเดา)", () => {
  it("ไม่ยืนยันเงื่อนไขสภาพงาน → CONDITIONS_NOT_CONFIRMED", () => {
    const r = transportCost(S, q({ conditionsAccepted: false }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("CONDITIONS_NOT_CONFIRMED");
    expect(r.error).toContain(S.conditions[0]);
  });

  it("ราคาน้ำมันนอกช่วง 2499/7000 → FUEL_OUT_OF_RANGE", () => {
    for (const fuelPriceSatang of [2499, 7000]) {
      const r = transportCost(S, q({ fuelPriceSatang }));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.code).toBe("FUEL_OUT_OF_RANGE");
    }
    // ขอบที่ครอบ → ผ่าน
    expect(transportCost(S, q({ fuelPriceSatang: 2500 })).ok).toBe(true);
    expect(transportCost(S, q({ fuelPriceSatang: 6999 })).ok).toBe(true);
  });

  it("ราคาน้ำมัน NaN/Infinity → FUEL_OUT_OF_RANGE พร้อมข้อความบอกว่าไม่ใช่ตัวเลข", () => {
    for (const fuelPriceSatang of [NaN, Infinity, -Infinity]) {
      const r = transportCost(S, q({ fuelPriceSatang }));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.code).toBe("FUEL_OUT_OF_RANGE");
      expect(r.error).toContain("ต้องเป็นตัวเลข");
    }
  });

  it("ระยะทางเกิน 1000 กม. / 0 กม. → DISTANCE_OUT_OF_RANGE", () => {
    for (const distanceKm of [0, 1001]) {
      const r = transportCost(S, q({ distanceKm }));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.code).toBe("DISTANCE_OUT_OF_RANGE");
    }
  });

  it("ระยะทางเป็นเศษส่วน/ไม่ใช่ตัวเลข → BAD_DISTANCE (ไม่ปัดระยะเงียบ ๆ)", () => {
    for (const distanceKm of [2.5, NaN, Infinity]) {
      const r = transportCost(S, q({ distanceKm }));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.code).toBe("BAD_DISTANCE");
    }
  });

  it("น้ำหนักรวมเกินเพดานรถ → GROSS_OVER_LIMIT (6 ล้อ 15 ตัน · 10 ล้อ 25 ตัน)", () => {
    const over6 = transportCost(S, q({ grossTons: 16 }));
    expect(over6.ok).toBe(false);
    if (!over6.ok) expect(over6.code).toBe("GROSS_OVER_LIMIT");
    const ok6 = transportCost(S, q({ grossTons: 15 }));
    expect(ok6.ok).toBe(true);
    const over10 = transportCost(S, q({ lorryCount: 10, grossTons: 26 }));
    expect(over10.ok).toBe(false);
    if (!over10.ok) expect(over10.code).toBe("GROSS_OVER_LIMIT");
  });

  it("ไม่พบประเภทรถ → SECTION_NOT_FOUND", () => {
    const r = transportCost(S, q({ lorryCount: 8 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("SECTION_NOT_FOUND");
  });

  it("ปริมาณ 0 / ติดลบ / ไม่ใช่ตัวเลข / เกิน 4 ตำแหน่ง → BAD_QUANTITY", () => {
    for (const quantity of [0, -1, NaN, 1.23456]) {
      const r = transportCost(S, q({ quantity }));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.code).toBe("BAD_QUANTITY");
    }
    // 3 ตำแหน่งคำนวณตรง: 1350 × 12.375 = 16,706.25 → 16,706
    const three = transportCost(S, q({ quantity: 12.375 }));
    expect(three.ok && three.amountSatang).toBe(16_706);
  });

  it("ปริมาณ 1e12 → BAD_QUANTITY (สตางค์เกิน MAX_SAFE_INTEGER)", () => {
    const r = transportCost(S, q({ quantity: 1e12 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("BAD_QUANTITY");
    expect(r.error).toContain("MAX_SAFE_INTEGER");
  });

  it("ข้อมูลตารางเพี้ยน (ราคาต่อหน่วย 0) → DATA_INCONSISTENT", () => {
    const clone = JSON.parse(JSON.stringify(S)) as typeof S;
    clone.sections[0].bands[0].perTonSatang[0] = 0;
    const r = transportCost(clone, q());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("DATA_INCONSISTENT");
  });
});

describe("transportCost — ภาพรวมชุดข้อมูล", () => {
  it("ทุกประเภทารถ × ทุกช่วงน้ำมัน × ระยะขอบ คำนวณได้ (ไม่ error)", () => {
    const failures: string[] = [];
    for (const sec of S.sections) {
      for (const band of sec.bands) {
        for (const distanceKm of [S.distanceStartKm, 200, 201, band.farMaxKm]) {
          const r = transportCost(S, {
            lorryCount: sec.lorryCount,
            hasTrailer: sec.hasTrailer,
            grossTons: sec.maxGrossTons,
            fuelPriceSatang: band.fuelMinSatang,
            distanceKm,
            cargo: "ton",
            conditionsAccepted: true,
          });
          if (!r.ok) failures.push(`${sec.truckType} @${band.fuelMinSatang} km${distanceKm}: ${r.error}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
