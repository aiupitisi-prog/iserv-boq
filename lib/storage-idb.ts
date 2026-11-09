// ที่เก็บโปรเจกต์บน IndexedDB (F4.4) — กันโควตา localStorage (~5MB) +
// เก็บได้ต่อเนื่องแม้แท็บปิด (ใช้ร่วมกับ PWA/service worker สำหรับ offline)
// API เดียวกับ lib/storage.ts แต่เป็น async — เปลี่ยนผู้เรียกให้ await ได้ทีหลัง
import type { BoqProject } from "./boq";
import { newId } from "./boq";

const DB_NAME = "iserv-boq-db";
const DB_VERSION = 1;
const STORE_NAME = "projects";

type Db = IDBDatabase;

let dbPromise: Promise<Db> | null = null;

function openDb(): Promise<Db> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      // กรณีแท็บอื่นเปิด DB ค้างอยู่ — เตือนให้ปิดแท็บอื่นก่อนใช้งาน
    };
  });
  return dbPromise;
}

function withStore<T>(mode: "readonly" | "readwrite", work: (store: IDBObjectStore) => T | Promise<T>): Promise<T> {
  return openDb().then((db) => {
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      Promise.resolve(work(store)).then((result) => {
        tx.oncomplete = () => resolve(result);
      }, (e) => {
        tx.abort();
        reject(e);
      });
      tx.onerror = () => reject(tx.error);
    });
  });
}

export async function loadProjectsIdb(): Promise<BoqProject[]> {
  return withStore("readonly", (store) => {
    return new Promise<BoqProject[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as BoqProject[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function saveProjectsIdb(list: BoqProject[]): Promise<void> {
  return withStore("readwrite", (store) => {
    // เคลียร์แล้วเขียนใหม่ (ง่ายและถูกต้องสำหรับขนาดโปรเจกต์ปกติ)
    const clearReq = store.clear();
    clearReq.onsuccess = () => {
      for (const p of list) store.put(p);
    };
    clearReq.onerror = () => {
      throw clearReq.error;
    };
    return undefined;
  });
}

export function emptyProjectIdb(): BoqProject {
  return {
    id: newId(),
    name: "โครงการใหม่",
    address: "",
    boqType: "ปร.1",
    createdAt: new Date().toISOString(),
    items: [],
  };
}

// ตรวจว่า IndexedDB ใช้งานได้บนเบราว์เซอร์นี้หรือไม่
export function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}
