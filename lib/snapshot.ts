// Snapshot ราคา TPSO (F4.1/F4.2)
// เก็บผลลัพธ์ล่าสุดต่อ (จังหวัด, ปี) เป็นไฟล์ JSON ใน data/snapshots/ —
// บน Vercel serverless (filesystem อ่านอย่างเดียว) อ่านไฟล์ที่ commit ใน repo ได้ → first load เร็ว (< 2 วิ)
// เขียนได้เฉพาะสภาพแวดล้อม dev — บน production ไฟล์ถูกเติมด้วย GitHub Actions รายวัน
// (.github/workflows/snapshot-refresh.yml → scripts/make-snapshots.mjs → commit → push ทำให้ Vercel build ใหม่)
//
// โครงสร้างไฟล์: data/snapshots/prov_<prov>_year_<year>.json และ master.json (จังหวัด/หมวด)
//
// โมดุลนี้ import node:fs ตรง ๆ — ใช้ได้เฉพาะฝั่ง server (ห้าม import ใน client component)

import fs from "node:fs";
import fsp from "node:fs/promises";

import type { TpsoHead, TpsoItem, TpsoProvince } from "./tpso";
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

// อ่าน snapshot จากไฟล์ — บน browser คืน null ทันที (ไฟล์ใน repo มองไม่เห็นจาก client)
export function readSnapshot(prov: string, year: number): SnapshotMeta | null {
  if (typeof window !== "undefined") return null;
  try {
    const raw = fs.readFileSync(snapshotPath(prov, year), "utf8");
    const parsed = JSON.parse(raw) as SnapshotMeta;
    if (!Array.isArray(parsed?.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// อ่าน master snapshot (จังหวัด/หมวด) — ไฟล์ data/snapshots/master.json
export function readMasterSnapshot(): {
  provinces: TpsoProvince[];
  heads: TpsoHead[];
  fetchedAt: string;
} | null {
  if (typeof window !== "undefined") return null;
  try {
    const raw = fs.readFileSync(`${SNAPSHOT_DIR}/master.json`, "utf8");
    const parsed = JSON.parse(raw) as { provinces: TpsoProvince[]; heads: TpsoHead[]; fetchedAt: string };
    if (!Array.isArray(parsed?.provinces) || !Array.isArray(parsed?.heads)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ดึงราคาสดจาก TPSO แล้วบันทึก snapshot — เขียนไฟล์ได้เฉพาะ dev/เครื่องที่ fs เขียนได้
// บน production สเต็ปเขียนจะถูกข้ามอย่างเงียบ ๆ (ข้อมูลยังถูกคืนแม้เขียนไม่ได้)
export async function fetchAndSaveSnapshot(prov: string, year: number): Promise<SnapshotMeta> {
  const rows = await tpsoPrices(prov, year);
  const meta: SnapshotMeta = {
    prov,
    year,
    fetchedAt: new Date().toISOString(),
    rows,
    source: "tpsolive",
  };
  try {
    await fsp.mkdir(SNAPSHOT_DIR, { recursive: true });
    await fsp.writeFile(snapshotPath(prov, year), JSON.stringify(meta, null, 2), "utf8");
  } catch {
    // read-only fs บน production — ข้ามการเขียน (snapshot จะได้รับจาก GitHub Actions แทน)
  }
  return meta;
}

// ดึง master (จังหวัด/หมวด) สดจาก TPSO แล้วบันทึก — เช่นเดียวกับด้านบน (dev only)
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
    await fsp.mkdir(SNAPSHOT_DIR, { recursive: true });
    await fsp.writeFile(`${SNAPSHOT_DIR}/master.json`, JSON.stringify(meta, null, 2), "utf8");
  } catch {
    // read-only — ข้าม
  }
  return meta;
}
