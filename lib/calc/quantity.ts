// ตัวช่วยคูณปริมาณงานแบบ "เลขเต็ม" — ใช้ร่วมกันระหว่างสูตรค่าเครื่องจักร (ว 475) และค่าขนส่ง (ว 477)
//
// กฎเหล็ก: เงินเป็นสตางค์ integer — ปริมาณเป็นเศษส่วนได้ (ทศนิยม ≤4 ตำแหน่ง)
// จึงคูณปริมาณด้วย 10,000 ให้เป็นจำนวนเต็ม แล้วคูณกับราคา/หน่วย (สตางค์)
// จากนั้นหาร 10,000 ปัด half-up ครั้งเดียว — ไม่ปล่อยให้ float คูณเงินตรง ๆ
// และปฏิเสธเมื่อผลลัพธ์เกิน Number.MAX_SAFE_INTEGER (ไม่คืนยอดที่เพี้ยน)

export const QTY_SCALE = 10_000;
const QTY_EPS = 1e-6;

export type ScaledQuantityResult =
  | { ok: true; scaled: number | null }
  | { ok: false; error: string };

// แปลงปริมาณ (ไม่ระบุ = null) → จำนวนเต็มหน่วย 1/10,000
export function scaledQuantity(qty: number | undefined): ScaledQuantityResult {
  if (qty === undefined) return { ok: true, scaled: null };
  if (!Number.isFinite(qty)) return { ok: false, error: `ปริมาณต้องเป็นตัวเลข (ได้ ${String(qty)})` };
  if (qty <= 0) return { ok: false, error: `ปริมาณต้องมากกว่า 0 (ได้ ${qty})` };
  const raw = qty * QTY_SCALE;
  const scaled = Math.round(raw);
  // tolerance ตาม ulp ของ double (ขั้นต่ำ 1e-6) — ค่าสัมบูรณ์ 1e-6 ไม่พอเมื่อ raw ใหญ่มาก
  const tol = Math.max(QTY_EPS, Number.EPSILON * Math.max(1, Math.abs(raw)) * 8);
  if (Math.abs(raw - scaled) > tol) {
    return { ok: false, error: `ปริมาณรองรับทศนิยมไม่เกิน 4 ตำแหน่ง (ได้ ${qty}) — แปลงหน่วยให้เล็กลงก่อน` };
  }
  if (!Number.isSafeInteger(scaled)) {
    return {
      ok: false,
      error: `ปริมาณมากเกินขอบเขตที่คำนวณได้อย่างแม่นยำ (ได้ ${qty}) — เกิน Number.MAX_SAFE_INTEGER`,
    };
  }
  return { ok: true, scaled };
}

// คูณราคา/หน่วย (สตางค์) × ปริมาณที่ scale แล้ว → ยอดรวมสตางค์ (ปัด half-up ครั้งเดียว)
export function amountFromScaled(
  perUnitSatang: number,
  scaled: number | null,
  qty: number | undefined,
): { ok: true; amountSatang: number | null } | { ok: false; error: string } {
  if (scaled === null) return { ok: true, amountSatang: null };
  const numerator = perUnitSatang * scaled; // สตางค์ × 10000
  // ตรวจทั้งก่อนและหลังบวกครึ่งสเกล (กันการปัดที่ขอบ safe integer)
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(numerator + QTY_SCALE / 2)) {
    return {
      ok: false,
      error: `ปริมาณ ${qty} มากเกินขอบเขตที่คำนวณได้อย่างแม่นยำ (สตางค์เกิน Number.MAX_SAFE_INTEGER) — ลดปริมาณหรือแยกเป็นหลายรายการ`,
    };
  }
  return { ok: true, amountSatang: Math.floor((numerator + QTY_SCALE / 2) / QTY_SCALE) };
}
