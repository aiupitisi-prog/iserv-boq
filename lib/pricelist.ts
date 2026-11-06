// คลังราคาส่วนตัวของผู้ใช้ (F2.1) — ค่าแรง อุปกรณ์ วัสดุท้องถิ่น ที่ไม่มีใน สนค.
// เก็บใน localStorage ของเครื่องผู้ใช้เท่านั้น (ห้ามส่งขึ้นเซิร์ฟเวอร์ — ข้อตกลงเหล็ก #2)
import { newId } from "./boq";

export type PrivatePriceCategory = "วัสดุ" | "ค่าแรง" | "อื่น ๆ";

export const PRICE_CATEGORIES: PrivatePriceCategory[] = ["วัสดุ", "ค่าแรง", "อื่น ๆ"];

export type PrivatePrice = {
  id: string;
  name: string;
  unit: string;
  price: number;
  category: PrivatePriceCategory;
  note?: string; // ที่มาของราคา เช่น "ค่าแรงเหมา จ.ขอนแก่น ต.ค. 69" — แนะนำใส่ทุกครั้ง
  updatedAt: string; // ISO — ใช้คิดอายุราคา
};

const KEY = "iserv-boq-pricelist-v1";

export function loadPricelist(): PrivatePrice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as PrivatePrice[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function savePricelist(list: PrivatePrice[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

// นำเข้า JSON — รวมกับของเดิม (รายการ id ซ้ำอัปเดตราคา/ข้อมูล, ไม่มี id ให้สร้างใหม่)
export function importPricelist(text: string): { ok: boolean; added: number; updated: number; error?: string } {
  let incoming: unknown;
  try {
    incoming = JSON.parse(text);
  } catch {
    return { ok: false, added: 0, updated: 0, error: "ไฟล์ JSON ไม่ถูกต้อง" };
  }
  const arr = Array.isArray(incoming) ? incoming : (incoming as { entries?: unknown })?.entries;
  if (!Array.isArray(arr)) return { ok: false, added: 0, updated: 0, error: "โครงสร้างไฟล์ไม่ใช่รายการคลังราคา" };
  const list = loadPricelist();
  let added = 0;
  let updated = 0;
  for (const raw of arr) {
    const e = raw as Partial<PrivatePrice>;
    if (typeof e?.name !== "string" || !e.name.trim()) continue;
    const price = typeof e.price === "number" && isFinite(e.price) ? e.price : 0;
    const category: PrivatePriceCategory =
      e.category === "ค่าแรง" || e.category === "วัสดุ" || e.category === "อื่น ๆ" ? e.category : "อื่น ๆ";
    const idx = typeof e.id === "string" ? list.findIndex((x) => x.id === e.id) : -1;
    if (idx >= 0) {
      list[idx] = { ...list[idx], name: e.name.trim(), unit: e.unit ?? list[idx].unit, price, category, note: e.note, updatedAt: new Date().toISOString() };
      updated++;
    } else {
      list.push({
        id: typeof e.id === "string" && e.id ? e.id : newId(),
        name: e.name.trim(),
        unit: e.unit ?? "หน่วย",
        price,
        category,
        note: e.note,
        updatedAt: new Date().toISOString(),
      });
      added++;
    }
  }
  savePricelist(list);
  return { ok: true, added, updated };
}

export function downloadPricelistJson(): void {
  const list = loadPricelist();
  const blob = new Blob([JSON.stringify({ kind: "iserv-boq-pricelist", entries: list }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `iserv-my-prices-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
