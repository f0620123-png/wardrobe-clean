// PWA Service Worker (確保 App 具有安裝與基礎快取能力)
const CACHE_NAME = "wardrobe-genie-v15.2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 快取首頁，達到最低限度的離線支援
      return cache.addAll(["/", "/index.html"]);
    })
  );
  self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  // 攔截網頁請求，若無網路則盡量嘗試從快取讀取
  if (event.request.method === "GET") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
