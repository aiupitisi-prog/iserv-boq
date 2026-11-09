// Service Worker สำหรับ PWA (F4.4) — แคชเผื่อให้ใช้งานออฟไลน์ได้เบื้องต้น
const CACHE_NAME = "iserv-boq-v1";
const ASSETS = [
  "/",
  "/projects",
  "/prices",
  "/my-prices",
  "/cm",
  "/manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {}),
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached)),
  );
});
