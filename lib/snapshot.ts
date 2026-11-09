// Snapshot ราคา TPSO (F4.1/F4.2)
// เก็บผลลัพธ์ล่าสุดต่อ (จังหวัด, ปี) เป็นไฟล์ JSON ใน data/snapshots/ —
// อ่านได้บน Vercel serverless (filesystem อ่านอย่างเดียว) ทำให้ first load เร็ว
// เขียนได้เฉพาะสภาพแวดล้อม dev (และถ้า filesystem อ่านเขียนได้) —
// บน production snapshot ถูกเติมผ่านสคริปต์ / GitHub Actions แยกต่างหาก
//
// โครงสร้างไฟล์: data/snapshots/prov_<prov>_year_<year>.json
//   { prov, year, fetchedAt (ISO), rows: TpsoItem[], source: "tpsolive" }

import type { TpsoItem, TpsoProvince, TpsoHead } from "./tpso";
import { tpsoMaster, tpsoPrices } from "./tpso";

const SNAPSHOT_DIR = "data/snapshots";

export type SnapshotMeta = {
  prov: string;
  year: number;
  fetchedAt: string; // ISO
  rows: TpsoItem[];
  source: "tpsolive" | "fallback";
};

export function snapshotFileName(prov: string, year: number): string {
  return `prov_${prov}_year_${year}.json`;
}

export function snapshotPath(prov: string, year: number): string {
  return `${SNAPSHOT_DIR}/${snapshotFileName(prov, year)}`;
}

// อ่าน snapshot จากไฟล์ (บน server ใช้ Node fs; บน browser คืน null)
export function readSnapshot(prov: string, year: number): SnapshotMeta | null {
  if (typeof window !== "undefined") return null;
  try {
    const fs = require("node:fs");
    const raw = fs.readFileSync(snapshotPath(prov, year), "utf8");
    return JSON.parse(raw) as SnapshotMeta;
  } catch {
    return null;
  }
}

// อ่าน master snapshot (จังหวัด/หมวด) —ไฟล์ data/snapshots/master.json
export function readMasterSnapshot(): {
  provinces: TpsoProvince[];
  heads: TpsoHead[];
  fetchedAt: string;
} | null {
  if (typeof window !== "undefined") return null;
  try {
    const fs = require("node:fs");
    const raw = fs.readFileSync(`${SNAPSHOT_DIR}/master.json`, "utf8");
    return JSON.parse(raw) as { provinces: TpsoProvince[]; heads: TpsoHead[]; fetchedAt: string };
  } catch {
    return null;
  }
}

// ดึง master สดจาก TPSO แล้วบันทึก snapshot (เขียนไฟล์ — ใช้ได้เฉพาะ dev)
export async function fetchAndSaveMasterSnapshot(): Promise<{
  provinces: TpsoProvince[];
  heads: TpsoHead[];
  fetchedAt: string;
}> {
  const m = await tpsoMaster();
  const meta = {
    provinces: m.provinces,
    heads: m.heads,
    fetchedAt: new Date().toISOString(),
  };
  try {
    const fs = await import("node:fs/promises");
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
    await fs.writeFile(`${SNAPSHOT_DIR}/master.json`, JSON.stringify(meta, null, 2), "utf8");
  } catch {
    // อ่านอย่างเดียวบน production serverless — ข้ามการเขียน
  }
  return meta;
}

// อายุ snapshot เป็นชั่วโมง (คืน null ถ้าไม่มี)
export function snapshotAgeHours(prov: string, year: number): number | null {
  const s = readSnapshot(prov, year);
  if (!s) return null;
  return (Date.now() - new Date(s.fetchedAt).getTime()) / (1000 * 60 * 60);
}

// ดึงราคาสดจาก TPSO แล้วบันทึก snapshot (เขียนไฟล์ — ใช้ได้เฉพาะ dev/เครื่องที่ fs เขียนได้)
export async function fetchAndSaveSnapshot(
  prov: string,
  year: number,
): Promise<SnapshotMeta> {
  const rows = await tpsoPrices(prov, year);
  const meta: SnapshotMeta = {
    prov,
    year,
    fetchedAt: new Date().toISOString(),
    rows,
    source: "tpsolive",
  };
  try {
    const fs = await import("node:fs/promises");
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
    await fs.writeFile(
      snapshotPath(prov, year),
      JSON.stringify(meta, null, 2),
      "utf8",
    );
  } catch {
    // อ่านอย่างเดียวบน production serverless — ข้ามการเขียน (snapshot จะถูกเติมจากภายนอก)
  }
  return meta;
}

// ดึง snapshot ถ้ามี ถ้าไม่มีดึงสดจาก TPSO (สำหรับหน้า /prices — snapshot-first)
export async function getPricesWithSnapshot(
  prov: string,
  year: number,
): Promise<{ rows: TpsoItem[]; meta: SnapshotMeta | null; usedSnapshot: boolean }> {
  const snap = readSnapshot(prov, year);
  if (snap && snap.rows.length > 0) {
    return { rows: snap.rows, meta: snap, usedSnapshot: true };
  }
  const meta = await fetchAndSaveSnapshot(prov, year);
  return { rows: meta.rows, meta, usedSnapshot: false };
}
