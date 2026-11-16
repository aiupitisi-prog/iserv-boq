import { describe, expect, it } from "vitest";
import { amountFromScaled, QTY_SCALE, scaledQuantity } from "./quantity";

describe("scaledQuantity — ปริมาณเป็นจำนวนเต็ม ×10,000", () => {
  it("ไม่ระบุปริมาณ = null (คิดเฉพาะอัตราต่อหน่วย)", () => {
    expect(scaledQuantity(undefined)).toEqual({ ok: true, scaled: null });
  });

  it("ทศนิยม ≤4 ตำแหน่งแปลงตรง", () => {
    expect(scaledQuantity(1)).toEqual({ ok: true, scaled: 10_000 });
    expect(scaledQuantity(12.5)).toEqual({ ok: true, scaled: 125_000 });
    expect(scaledQuantity(12.375)).toEqual({ ok: true, scaled: 123_750 });
    expect(scaledQuantity(0.0001)).toEqual({ ok: true, scaled: 1 });
    expect(scaledQuantity(12345.6789)).toEqual({ ok: true, scaled: 123_456_789 });
  });

  it("ปฏิเสธค่าที่ไม่ใช่ตัวเลข/≤0/ทศนิยมเกิน 4 ตำแหน่ง", () => {
    for (const qty of [NaN, Infinity, -Infinity, 0, -1]) {
      const r = scaledQuantity(qty);
      expect(r.ok).toBe(false);
    }
    const tooPrecise = scaledQuantity(1.23456);
    expect(tooPrecise.ok).toBe(false);
    if (!tooPrecise.ok) expect(tooPrecise.error).toContain("ทศนิยมไม่เกิน 4 ตำแหน่ง");
  });

  it("ปฏิเสธเมื่อ scale แล้วเกิน Number.MAX_SAFE_INTEGER", () => {
    const r = scaledQuantity(Number.MAX_SAFE_INTEGER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("MAX_SAFE_INTEGER");
  });
});

describe("amountFromScaled — คูณแล้วปัด half-up ครั้งเดียว", () => {
  it("12.5 × 13.50 = 168.75", () => {
    const s = scaledQuantity(12.5);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(amountFromScaled(1350, s.scaled, 12.5)).toEqual({ ok: true, amountSatang: 16_875 });
  });

  it("2.5 × 18.89 = 47.225 → 47.23 (half-up)", () => {
    const s = scaledQuantity(2.5);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(amountFromScaled(1889, s.scaled, 2.5)).toEqual({ ok: true, amountSatang: 4723 });
  });

  it("ราคาต่อหน่วย × ปริมาณที่มี 4 ตำแหน่ง", () => {
    const s = scaledQuantity(12.375);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    // 1350 × 12.375 = 16,706.25 สตางค์ → 16,706
    expect(amountFromScaled(1350, s.scaled, 12.375)).toEqual({ ok: true, amountSatang: 16_706 });
  });

  it("ไม่ระบุปริมาณ = null", () => {
    expect(amountFromScaled(1350, null, undefined)).toEqual({ ok: true, amountSatang: null });
  });

  it("ขอบ safe integer: numerator safe แต่ numerator + ครึ่งสเกลไม่ safe → ปฏิเสธ", () => {
    // scaled = 1, perUnit = 9,007,199,254,740,000 → numerator safe แต่ +5,000 เกิน MAX_SAFE_INTEGER
    const r = amountFromScaled(9_007_199_254_740_000, 1, 0.0001);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("MAX_SAFE_INTEGER");
  });

  it("ขอบ safe integer: numerator + ครึ่งสเกล = MAX_SAFE_INTEGER → ผ่าน", () => {
    const perUnit = Number.MAX_SAFE_INTEGER - QTY_SCALE / 2;
    const r = amountFromScaled(perUnit, 1, 0.0001);
    expect(r).toEqual({ ok: true, amountSatang: Math.floor(Number.MAX_SAFE_INTEGER / QTY_SCALE) });
  });

  it("ราคาต่อหน่วย × ปริมาณเกินขอบ safe integer → ปฏิเสธ", () => {
    const r = amountFromScaled(Number.MAX_SAFE_INTEGER, 10_000, 1);
    expect(r.ok).toBe(false);
  });
});
