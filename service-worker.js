const CACHE_VERSION = "ihp-pwa-2026-07-23-v5";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/premium.css",
  "/pwa.css",
  "/assets/pwa/icon-192.png",
  "/assets/pwa/icon-512.png"
];

function canCache(response) {
  if (!response || !response.ok || response.type !== "basic") return false;
  const cacheControl = response.headers.get("cache-control") || "";
  const contentType = response.headers.get("content-type") || "";
  return !cacheControl.includes("no-store") && !contentType.includes("application/json");
}

async function putSafe(cacheName, request, response) {
  if (!canCache(response)) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("ihp-pwa-") && !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    await putSafe(RUNTIME_CACHE, request, response);
    return response;
  } catch {
    return (await caches.match(request))
      || (await caches.match("/index.html"))
      || (await caches.match("/"))
      || new Response(
        "<!doctype html><html lang=\"tr\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>İHP Mobil</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07111f;color:#f7f9ff;font:16px system-ui}.offline{max-width:28rem;padding:2rem;text-align:center}button{border:0;border-radius:999px;padding:.8rem 1.2rem;font:inherit;font-weight:700}</style><main class=\"offline\"><h1>Bağlantı kurulamadı</h1><p>İnternet bağlantınızı kontrol edip yeniden deneyin.</p><button onclick=\"location.reload()\">Yeniden dene</button></main>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
  }
}

async function staticResponse(request) {
  try {
    const response = await fetch(request);
    await putSafe(RUNTIME_CACHE, request, response);
    return response;
  } catch {
    return (await caches.match(request)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.headers.has("authorization")) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (
    url.pathname.startsWith("/assets/")
    || url.pathname.startsWith("/src/")
    || /\.(?:css|js|svg|png|jpg|jpeg|webp|woff2?)$/i.test(url.pathname)
  ) {
    event.respondWith(staticResponse(request));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || "İHP Portalı'nda yeni bir bildiriminiz var." };
  }
  const title = payload.title || "İHP Mobil";
  const options = {
    body: payload.body || "Yeni bildiriminizi görüntülemek için uygulamayı açın.",
    icon: payload.icon || "/assets/pwa/icon-192.png",
    badge: payload.badge || "/assets/pwa/icon-192.png",
    tag: payload.tag || "ihp-notification",
    renotify: Boolean(payload.renotify),
    data: {
      url: payload.url || "/#/portal/overview",
      notificationId: payload.notificationId || ""
    },
    actions: [{ action: "open", title: "Görüntüle" }]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/#/portal/overview", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const sameOrigin = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (sameOrigin) {
        await sameOrigin.navigate(target).catch(() => undefined);
        return sameOrigin.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
