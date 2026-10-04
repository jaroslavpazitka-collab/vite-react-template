const CACHE_NAME = "tatralandia-v1.5.0";
const META_CACHE = "tatralandia-meta-v1";
const TOKEN_KEY = "/__tatralandia_push_device_token";
const CORE_ASSETS = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

async function cacheResponse(cache, url, response) {
  if (response && response.ok) await cache.put(url, response.clone());
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(CORE_ASSETS.map(async (url) => {
    const response = await fetch(url, { cache: "reload" });
    await cacheResponse(cache, url, response);
  }));

  try {
    const shellResponse = await fetch("/", { cache: "reload" });
    if (!shellResponse.ok) return;
    const html = await shellResponse.clone().text();
    await cache.put("/", shellResponse.clone());

    const assetUrls = new Set();
    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
      try {
        const assetUrl = new URL(match[1], self.location.origin);
        if (assetUrl.origin === self.location.origin && !assetUrl.pathname.startsWith("/api/")) {
          assetUrls.add(assetUrl.pathname + assetUrl.search);
        }
      } catch {
        // Ignorujeme neplatný odkaz v HTML.
      }
    }

    await Promise.allSettled(Array.from(assetUrls).map(async (url) => {
      const response = await fetch(url, { cache: "reload" });
      await cacheResponse(cache, url, response);
      if (response.ok && String(url).split("?")[0].endsWith(".css")) {
        const css = await response.clone().text();
        const cssUrl = new URL(url, self.location.origin);
        const nested = new Set();
        for (const match of css.matchAll(/url\((?:["']?)([^)"']+)(?:["']?)\)/gi)) {
          const raw = match[1].trim();
          if (!raw || raw.startsWith("data:")) continue;
          try {
            const nestedUrl = new URL(raw, cssUrl);
            if (nestedUrl.origin === self.location.origin) nested.add(nestedUrl.pathname + nestedUrl.search);
          } catch {
            // Ignorujeme neplatný URL v CSS.
          }
        }
        await Promise.allSettled(Array.from(nested).map(async (nestedUrl) => {
          const nestedResponse = await fetch(nestedUrl, { cache: "reload" });
          await cacheResponse(cache, nestedUrl, nestedResponse);
        }));
      }
    }));
  } catch (error) {
    console.error("Prednačítanie offline aplikácie zlyhalo", error);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("tatralandia-v") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/", clone));
          }
          return response;
        })
        .catch(async () => (await caches.match("/")) || Response.error())
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});

async function saveDeviceToken(token) {
  const cache = await caches.open(META_CACHE);
  if (!token) {
    await cache.delete(TOKEN_KEY);
    return;
  }
  await cache.put(TOKEN_KEY, new Response(token, { headers: { "Content-Type": "text/plain" } }));
}

async function getDeviceToken() {
  const cache = await caches.open(META_CACHE);
  const response = await cache.match(TOKEN_KEY);
  return response ? response.text() : "";
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SET_DEVICE_TOKEN") {
    event.waitUntil(saveDeviceToken(String(data.token || "")));
  } else if (data.type === "CLEAR_DEVICE_TOKEN") {
    event.waitUntil(saveDeviceToken(""));
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let title = "Tatralandia Údržba";
    let body = "V aplikácii je nová udalosť.";
    let url = "/";

    try {
      const token = await getDeviceToken();
      if (token) {
        const response = await fetch(`/api/push/pending?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (response.ok && data.success && data.notification) {
          title = data.notification.title || title;
          body = data.notification.body || body;
          url = data.notification.url || url;
        }
      }
    } catch (error) {
      console.error("Push detail sa nepodarilo načítať", error);
    }

    await self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        try {
          if ("navigate" in client) await client.navigate(target);
        } catch {
          // Ak navigácia nie je dostupná, stačí existujúce okno aktivovať.
        }
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
