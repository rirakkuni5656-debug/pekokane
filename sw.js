// ペコカネ Service Worker
// HTML本体は「ネットワーク優先（オフライン時のみキャッシュにフォールバック）」、
// アイコンなど変わらないファイルは「キャッシュ優先」。
// これにより index.html だけを更新した通常のデプロイでは、CACHE_NAME を上げなくても
// 次にアプリを開いたタイミングで自動的に最新版が届く（sw.js自体を書き換えた時だけ
// ブラウザがService Worker本体の更新を検知する一方、HTMLはfetchのたびに毎回ネットワークを
// 見に行くため、キャッシュの世代管理に依存しない）。
const CACHE_NAME = "pekokane-cache-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => console.warn("[sw] app shell cache failed", err))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // avoid interfering with the OCR worker's own internal blob:/data: requests
  if (event.request.url.startsWith("blob:") || event.request.url.startsWith("data:")) return;

  const isHtmlPage = event.request.mode === "navigate" || event.request.destination === "document";
  if (isHtmlPage) {
    // ネットワーク優先：オンラインなら常に最新のindex.htmlを取りに行き、取れたものをキャッシュに保存しておく。
    // オフライン時だけ、直前まで使えていたキャッシュ版にフォールバックする。
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});

// タップしたら既存のタブがあればそこにフォーカス、無ければ開く（記録リマインダー用）
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
