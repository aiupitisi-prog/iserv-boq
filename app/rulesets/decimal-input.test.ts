import { describe, expect, it } from "vitest";
import { decimalPlaces, parseDecimal, parseInteger } from "./decimal-input";

describe("parseDecimal — รับเฉพาะทศนิยมฐาน 10 ที่ใช้จุด", () => {
  it("รับค่าปกติ", () => {
    expect(parseDecimal("30.50")).toBe(30.5);
    expect(parseDecimal("12.375")).toBe(12.375);
    expect(parseDecimal("25")).toBe(25);
    expect(parseDecimal(" 0.0001 ")).toBe(0.0001);
  });

  it("ปฏิเสธเครื่องหมายจุลภาค (กัน \"2,5\" กลายเป็น 25)", () => {
    expect(parseDecimal("2,5")).toBeNull();
    expect(parseDecimal("1,000")).toBeNull();
  });

  it("ปฏิเสธรูปแบบอื่น", () => {
    for (const t of ["", " ", ".5", "5.", "-1", "+1", "1e3", "abc", "๑๒"]) {
      expect(parseDecimal(t)).toBeNull();
    }
  });
});

describe("decimalPlaces — ใช้บังคับจำนวนตำแหน่งทศนิยม", () => {
  it("นับตำแหน่งทศนิยมของรูปแบบที่รับ", () => {
    expect(decimalPlaces("25")).toBe(0);
    expect(decimalPlaces("30.50")).toBe(2);
    expect(decimalPlaces("30.5")).toBe(1);
    expect(decimalPlaces(" 12.375 ")).toBe(3);
  });

  it("รูปแบบที่ไม่รับ → null", () => {
    for (const t of ["", " ", "2,5", ".5", "5.", "-1", "1e3"]) {
      expect(decimalPlaces(t)).toBeNull();
    }
  });
});

describe("parseInteger — จำนวนเต็มเท่านั้น", () => {
  it("รับจำนวนเต็ม", () => {
    expect(parseInteger("1")).toBe(1);
    expect(parseInteger("200")).toBe(200);
    expect(parseInteger(" 1000 ")).toBe(1000);
  });

  it("ปฏิเสธเศษส่วน/เครื่องหมาย/รูปแบบอื่น", () => {
    for (const t of ["2.5", "2,5", "-1", "+1", "1e3", "", "abc"]) {
      expect(parseInteger(t)).toBeNull();
    }
  });

  it("ปฏิเสธค่าที่เกิน MAX_SAFE_INTEGER", () => {
    expect(parseInteger("9007199254740993")).toBeNull();
  });
});
