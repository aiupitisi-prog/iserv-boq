// ตัวช่วยแปลงข้อความจากช่องกรอกเป็นตัวเลข — ใช้ร่วมกันทุกเครื่องคิดในหน้า /rulesets
//
// กฎ: รับเฉพาะเลขฐาน 10 ที่ใช้ "." เป็นทศนิยม — ไม่รับ "," เพราะ "2,5" อาจถูกตีความเป็น 25
// แล้วคำนวณผิดเงียบ ๆ (ระบบเลือก "ปฏิเสธ + บอกวิธีแก้" แทนการเดาความหมาย)

const DECIMAL_ONLY = /^\d+(\.\d+)?$/;
const INTEGER_ONLY = /^\d+$/;

// ทศนิยม ≥ 0 (เช่น "30.50", "12.375") — คืน null เมื่อรูปแบบไม่ถูกต้อง
export function parseDecimal(text: string): number | null {
  const t = text.trim();
  if (t === "" || !DECIMAL_ONLY.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// จำนวนตำแหน่งทศนิยมของข้อความที่ parseDecimal รับแล้ว — ใช้บังคับ "ไม่ปัดเศษเงียบ"
export function decimalPlaces(text: string): number | null {
  const t = text.trim();
  const m = /^\d+(?:\.(\d+))?$/.exec(t);
  return m ? (m[1]?.length ?? 0) : null;
}

// จำนวนเต็ม ≥ 0 (เช่น "201") — คืน null เมื่อเป็นเศษส่วน/มีเครื่องหมาย/รูปแบบอื่น
export function parseInteger(text: string): number | null {
  const t = text.trim();
  if (t === "" || !INTEGER_ONLY.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}
