// IndexedDB helpers สามัญ (F4.4) — ทุกส่วนของแอปใช้ DB เดียวกัน
// DB: iserv-boq-db (version 2) · stores: "projects", "pricelist"
// หลักการ: ทุกฟังก์ชัน **ไม่ throw** — ล้มเหลวคืน null/false เพื่อให้ผู้เรียก fallback ไป localStorage ได้เลย

export const IDB_NAME = "iserv-boq-db";
export const IDB_VERSION = 2;
export const STORE_PROJECTS = "projects";
export const STORE_PRICELIST = "pricelist";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined" || indexedDB === null) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of [STORE_PROJECTS, STORE_PRICELIST]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => {
        // แท็บอื่นเปิด DB เดิมอยู่ (เวอร์ชันเก่า) — จะกลายเป็น fallback ตามผู้เรียก
        reject(req.error ?? new Error("IndexedDB blocked by another tab"));
      };
    });
  }
  return dbPromise;
}

function withStore<T>(
  storeName: string,
  mode: "readonly" | "readwrite",
  work: (store: IDBObjectStore) => IDBRequest,
  fallback: T,
): Promise<T> {
  return openDb()
    .then((db) => {
      if (!db) return fallback;
      return new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const req = work(tx.objectStore(storeName));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      });
    })
    .catch(() => fallback);
}

// อ่านทุกระเบียบ; คืน **null** เมื่อ IDB ใช้ไม่ได้ (แยกจาก "อ่านได้แต่ว่าง" = [])
export function idbGetAll<T>(storeName: string): Promise<T[] | null> {
  return withStore<unknown[]>(storeName, "readonly", (store) => store.getAll(), null as unknown as unknown[]).then(
    (rows) => (rows === null ? null : ((rows as T[]) ?? [])),
  );
}

// เคลียร์แล้วเขียนทับทั้ง store — true เมื่อสำเร็จ
export function idbPutAll<T extends { id: string }>(storeName: string, rows: T[]): Promise<boolean> {
  return openDb()
    .then((db) => {
      if (!db) return false;
      return new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        store.clear();
        for (const r of rows) store.put(r);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    })
    .catch(() => false);
}

// upsert ระเบียบเดียว — true เมื่อสำเร็จ (ใช้บ่อยที่ cadence สูง เช่น editor แก้แถว)
export function idbPutOne<T extends { id: string }>(storeName: string, row: T): Promise<boolean> {
  return openDb()
    .then((db) => {
      if (!db) return false;
      return new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(row);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    })
    .catch(() => false);
}
