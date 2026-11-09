// Service Worker สำหรับ PWA (F4.4) — ใช้งาน offline ได้เบื้องต้น
// หน้า HTML: network-first (กันแอปค้างเวอร์ชันเก่าหลัง deploy แล้วแคชยังโชว์อันเก่า)
// ไฟล์ static: cache-first (/_next/static มี hash ในชื่อไฟล์ ปลอดภัยที่จะแคช
const CACHE_NAME = "iserv-boq-v2";
const PRECACHE = ["/", "/manifest.json", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // POST อื่น ๆ ผ่านเครือข่ายตรง

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation =
    req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  // หน้า HTML — ลองเครือข่ายก่อนเสมอ ใช้แคชเมื่อออฟไลน์
  if (isNavigation) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c ?? caches.match("/"))),
    );
    return;
  }

  // ไฟล์ static — cache-first (ชื่อไฟล์มี hash เปลี่ยนทุก build)
  const isStatic =
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icon") ||
    url.pathname === "/manifest.json";
  if (isStatic) {
    e.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        });
      }),
    );
    return;
  }
  // ส่วนที่เหลือ (API dynamic) — ผ่านเครือข่ายตามปกติ
});
