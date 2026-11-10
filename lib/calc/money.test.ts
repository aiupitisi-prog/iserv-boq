// เวกเตอร์ทดสอบเงินสตางค์ + บาทถ้วน — ตัวเลขเป็นข้อมูลทดสอบ ไม่ใช่ตัวเลขกฎหมาย
import { describe, expect, it } from "vitest";
import { bahtText } from "../bahttext";
import { formatSatang, mulQty, pctOf, sumSatang, toSatang } from "./money";

describe("money (สตางค์ integer)", () => {
  it("toSatang — ปัด half-up ที่จุดเดียวของระบบ", () => {
    expect(toSatang(1250.5)).toBe(125050);
    expect(toSatang(0.005)).toBe(1); // 0.005 บาท → 0.5 สตางค์ → 1
    expect(toSatang(1.005)).toBe(101); // float จากจุดทศนิยม 3 ตำแหน่งตกล่าง 100.5 → epsilon ช่วยให้ half-up ถูก (F16)
    expect(toSatang(-3.25)).toBe(-325);
    expect(toSatang(NaN)).toBe(0);
    expect(toSatang(Infinity)).toBe(0);
  });

  it("pctOf — % ของจำนวน ปัด half-up", () => {
    expect(pctOf(9999, 5)).toBe(500); // 499.95 → 500
    expect(pctOf(100, 7)).toBe(7);
    expect(pctOf(101, 7)).toBe(7); // 7.07 → 7
    expect(pctOf(1_000_000_000, 5)).toBe(50_000_000);
    expect(pctOf(1000, 0)).toBe(0);
    expect(pctOf(1000, -1)).toBe(0);
  });

  it("mulQty — ปริมาณเศษส่วน × ราคา/หน่วย", () => {
    expect(mulQty(3.5, 32000)).toBe(11_200_000); // 112,000.00 บาท
    expect(mulQty(0, 500)).toBe(0);
    expect(mulQty(2, 0.005)).toBe(2); // ปัดราคา/หน่วยเป็นสตางค์ก่อน (0.005 → 1 สตางค์) แล้วคูณ 2 = 2 สตางค์ — design ตั้งใจ
    expect(mulQty(NaN, 500)).toBe(0);
  });

  it("sumSatang + formatSatang", () => {
    expect(sumSatang([100, 250, 3])).toBe(353);
    expect(formatSatang(1234500)).toBe("12,345.00");
  });
});

describe("bahtText (ตัวเลขเป็นตัวหนังสือ — เวกเตอร์มาตรฐานภาษาไทย)", () => {
  it("เลขพื้นฐาน", () => {
    expect(bahtText(100)).toBe("หนึ่งบาทถ้วน"); // 1.00 บาท
    expect(bahtText(0)).toBe("ศูนย์บาทถ้วน");
    expect(bahtText(1000)).toBe("สิบบาทถ้วน"); // 10.00
    expect(bahtText(1100)).toBe("สิบเอ็ดบาทถ้วน"); // 11.00
    expect(bahtText(2100)).toBe("ยี่สิบเอ็ดบาทถ้วน"); // 21.00
    expect(bahtText(10100)).toBe("หนึ่งร้อยเอ็ดบาทถ้วน"); // 101.00 — "เอ็ด" เพราะมี "หนึ่งร้อย" อ่านก่อนหน้า
    expect(bahtText(11000)).toBe("หนึ่งร้อยสิบบาทถ้วน"); // 110.00 — หลักหน่วยเป็นศูนย์ ไม่มี "เอ็ด"
    expect(bahtText(1010000)).toBe("หนึ่งหมื่นหนึ่งร้อยบาทถ้วน"); // 10,100.00
  });

  it("หลักล้าน", () => {
    expect(bahtText(100_000_000)).toBe("หนึ่งล้านบาทถ้วน"); // 1,000,000.00
    expect(bahtText(100_000_100)).toBe("หนึ่งล้านเอ็ดบาทถ้วน"); // 1,000,001.00
    expect(bahtText(1_100_000_000)).toBe("สิบเอ็ดล้านบาทถ้วน"); // 11,000,000.00
    // ล้านล้าน — กลุ่มศูนย์ตรงกลางยังคง "ล้าน" ครบ + กลุ่มท้าย "เอ็ด"
    expect(bahtText(100_000_000_000_100)).toBe("หนึ่งล้านล้านเอ็ดบาทถ้วน"); // 1,000,000,000,001.00
  });

  it("สตางค์", () => {
    expect(bahtText(25)).toBe("ยี่สิบห้าสตางค์"); // 0.25 บาท
    expect(bahtText(125)).toBe("หนึ่งบาทยี่สิบห้าสตางค์"); // 1.25
    expect(bahtText(1101)).toBe("สิบเอ็ดบาทหนึ่งสตางค์"); // 11.01
  });

  it("ติดลบ", () => {
    expect(bahtText(-100)).toBe("ลบหนึ่งบาทถ้วน");
  });
});
