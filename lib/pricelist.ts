// คลังราคาส่วนตัวของผู้ใช้ (F2.1) — ค่าแรง อุปกรณ์ วัสดุท้องถิ่น ที่ไม่มีใน สนค.
// เก็บเฉพาะเครื่องผู้ใช้ (ห้ามส่งขึ้นเซิร์ฟเวอร์ — ข้อตกลงเหล็ก #2)
// ที่เก็บหลัก: IndexedDB (F4.4 กันโควตา) — ถ้าใช้ไม่ได้ fallback localStorage; migrate อัตโนมัติ
import { newId } from "./boq";
import { STORE_PRICELIST, idbGetAll, idbPutAll } from "./storage-idb";

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

const LS_KEY = "iserv-boq-pricelist-v1"; // key เดิม — ใช้ migrate/fallback

function lsRead(): PrivatePrice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    const list = raw ? (JSON.parse(raw) as PrivatePrice[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function loadPricelist(): Promise<PrivatePrice[]> {
  const idbRows = await idbGetAll<PrivatePrice>(STORE_PRICELIST);
  if (idbRows && idbRows.length > 0) return idbRows;

  const ls = lsRead();
  if (ls.length > 0 && idbRows !== null) {
    const ok = await idbPutAll(STORE_PRICELIST, ls);
    if (ok) {
      try {
        localStorage.removeItem(LS_KEY);
      } catch {
        // ชะตากรรม LS ไม่สำคัญแล้ว
      }
    }
    return ls;
  }
  if (idbRows !== null) return [];
  return ls;
}

export async function savePricelist(list: PrivatePrice[]): Promise<void> {
  const ok = await idbPutAll(STORE_PRICELIST, list);
  if (ok) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    // โควตา LS เต็มและ IDB ใช้ไม่ได้ — และผู้ใช้ควร export JSON เก็บสำรอง (หน้า /my-prices มีปุ่ม)
  }
}

// นำเข้า JSON — รวมกับของเดิม (รายการ id ซ้ำอัปเดตราคา/ข้อมูล, ไม่มี id ให้สร้างใหม่)
export async function importPricelist(text: string): Promise<{ ok: boolean; added: number; updated: number; error?: string }> {
  let incoming: unknown;
  try {
    incoming = JSON.parse(text);
  } catch {
    return { ok: false, added: 0, updated: 0, error: "ไฟล์ JSON ไม่ถูกต้อง" };
  }
  const arr = Array.isArray(incoming) ? incoming : (incoming as { entries?: unknown })?.entries;
  if (!Array.isArray(arr)) return { ok: false, added: 0, updated: 0, error: "โครงสร้างไฟล์ไม่ใช่รายการคลังราคา" };
  const list = await loadPricelist();
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
  await savePricelist(list);
  return { ok: true, added, updated };
}

export async function downloadPricelistJson(): Promise<void> {
  const list = await loadPricelist();
  if (typeof window === "undefined") return;
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
