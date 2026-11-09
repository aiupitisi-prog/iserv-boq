// ที่เก็บโปรเจกต์ (F4.4) — ที่เก็บหลักคือ IndexedDB กันโควตา localStorage (~5MB) + R5
// การ migrate: โหลดครั้งแรกถ้า IDB ว่างแต่ localStorage มีข้อมูลเดิม → ยกขึ้น IDB แล้วเคลียร์ LS
// ถ้า IndexedDB ใช้ไม่ได้ (เบราว์เซอร์ปิด / เป็น private mode) → fallback localStorage เหมือนต้น
import type { BoqProject } from "./boq";
import { newId } from "./boq";
import { STORE_PROJECTS, idbGetAll, idbPutAll, idbPutOne } from "./storage-idb";

const LS_KEY = "iserv-boq-projects-v1"; // key เดิมใช้ตอน migrate/fallback

function lsRead(): BoqProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    const list = raw ? (JSON.parse(raw) as BoqProject[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function lsWrite(list: BoqProject[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export async function loadProjects(): Promise<BoqProject[]> {
  const idbRows = await idbGetAll<BoqProject>(STORE_PROJECTS);
  if (idbRows && idbRows.length > 0) return idbRows;

  const ls = lsRead();
  if (ls.length > 0 && idbRows !== null) {
    // migrate ขึ้น IDB ก่อน แล้วค่อยเคลียร์ LS (คงข้อมูลถ้า IDB เขียนได้)
    const ok = await idbPutAll(STORE_PROJECTS, ls);
    if (ok) {
      try {
        localStorage.removeItem(LS_KEY);
      } catch {
        // เคลียร์ไม่ได้ไม่เป็นไร — IDB ยังเป็นที่เก็บหลักอยู่
      }
    }
    return ls;
  }
  if (idbRows !== null) return []; // IDB ใช้ได้และว่างจริง
  return ls; // ตกไม่มี IDB — ใช้ LS
}

// เขียนทั้งรายการ (ทางหน้ารายการโปรเจกต์ import/delete เป็นรายการเดียวแน่ ๆ)
export async function saveProjects(list: BoqProject[]): Promise<void> {
  const ok = await idbPutAll(STORE_PROJECTS, list);
  if (!ok) lsWrite(list);
}

// upsert โปรเจกต์เดียว — เบากว่า re-write ทั้งรายการ (ใช้ใน editor ที่แก้ถี่)
export async function saveProject(p: BoqProject): Promise<void> {
  const ok = await idbPutOne(STORE_PROJECTS, p);
  if (ok) return;
  const list = lsRead().filter((x) => x.id !== p.id).concat(p);
  lsWrite(list);
}

export function emptyProject(): BoqProject {
  return {
    id: newId(),
    name: "โครงการใหม่",
    address: "",
    boqType: "ปร.1",
    createdAt: new Date().toISOString(),
    items: [],
  };
}

// เปอร์เซ็นต์การใช้พื้นที่ทั้งหมดของไซต์ต่อโควตา (R5 — เตือนเมื่อใกล้เต็ม)
export async function storageUsagePercent(): Promise<number | null> {
  if (typeof navigator === "undefined") return null;
  const st = navigator.storage as StorageManager | undefined;
  if (!st?.estimate) return null;
  try {
    const { usage, quota } = await st.estimate();
    if (!usage || !quota) return null;
    return Math.round((usage / quota) * 100);
  } catch {
    return null;
  }
}
