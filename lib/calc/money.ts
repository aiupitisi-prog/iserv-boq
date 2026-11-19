// เครื่องมือคำนวณเงินเป็น "สตางค์ integer" — กฎเหล็ก (skill thai-govt-base-price-rules):
// ห้ามใช้ float ในการคำนวณ — ราคาใน storage/UI เป็น float บาท (โครงสร้างเดิม)
// จึงแปลงเป็นสตางค์ครั้งเดียวที่ขอบเขต (toSatang) แล้วคำนวณทุกอย่างเป็นเลขเต็ม
// จนถึงจุดแสดงผลเท่านั้น (satangToBaht/formatSatang — ไว้แสดง ห้ามนำไปคำนวณต่อ)

export type Satang = number; // เลขเต็มเสมอ

// แปลงบาท (float จาก storage/UI) → สตางค์เลขเต็ม — จุดปัดเศษเดียวของระบบ (half-up)
export function toSatang(baht: number): Satang {
  if (!isFinite(baht)) return 0;
  // epsilon เล็ก ๆ กัน float ตกล่างกว่าหลักครึ่งจริง (เช่น 1.005*100 = 100.49999999999997 → ต้องได้ 101 ไม่ใช่ 100)
  const eps = baht < 0 ? -1e-6 : 1e-6;
  return Math.round(baht * 100 + eps);
}

// สตางค์ → บาท (สำหรับแสดงผลเท่านั้น)
export function satangToBaht(s: Satang): number {
  return s / 100;
}

export function sumSatang(list: Satang[]): Satang {
  return list.reduce((a, b) => a + b, 0);
}

// แจกสัดส่วน half-up: part × num ÷ denom (ค่าล้วนไม่เป็นลบ) — ใช้ BigInt กัน precision
// ปัด 0.5 ขึ้น: floor((2·part·num + denom) / (2·denom))
// ใช้ทั้งการปรับลดราคารายการและฐานราคากลางรายการของชุด 9 ชิ้น (ห้ามเขียนสูตรซ้ำ)
export function proportionSat(part: Satang, num: Satang, denom: Satang): Satang {
  if (denom <= 0 || part <= 0 || num <= 0) return 0;
  const m = BigInt(part) * BigInt(num);
  const d = BigInt(denom);
  const two = BigInt(2);
  return Number((two * m + d) / (two * d));
}

// % ของจำนวนเงิน — ปัดเศษ half-up (ผู้เรียกต้องบันทึกการปัดเศษนี้ใน trace)
export function pctOf(s: Satang, pct: number): Satang {
  if (!isFinite(pct) || pct <= 0) return 0;
  return Math.round((s * pct) / 100);
}

// ปริมาณ × ราคาต่อหน่วย — ปริมาณเป็นเศษส่วนได้ (เช่น 3.5 ตัน)
// ราคา/หน่วยปัดเป็นสตางค์ก่อน (ราคาต่อหน่วยในใบเสนอราคาเป็นทศนิยม 2 ตำแหน่ง) แล้วคูณปริมาณปัดครั้งเดียว
export function mulQty(qty: number, unitPriceBaht: number): Satang {
  if (!isFinite(qty) || !isFinite(unitPriceBaht)) return 0;
  return Math.round(toSatang(unitPriceBaht) * qty);
}

// แสดงสตางค์เป็นข้อความเงิน (เช่น 1234500 → "12,345.00")
export function formatSatang(s: Satang): string {
  return (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
