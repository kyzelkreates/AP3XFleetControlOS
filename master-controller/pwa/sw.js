// AP3X Driver PWA — Service Worker (RUN 9)
// Offline-first strategy:
//   - App shell (HTML/CSS/JS): Cache-first, network fallback
//   - Tile requests: Cache-first via IndexedDB tile store
//   - API sync: Network-first, background queue if offline
//   - Route/hazard data: Cache-first from ap3x-runtime store
// ═══════════════════════════════════════════════════════════════════════════════

const SW_VERSION      = "ap3x-sw-v1";
const SHELL_CACHE     = "ap3x-shell-v1";
const RUNTIME_CACHE   = "ap3x-runtime-v1";

// App shell assets — cached on install
const SHELL_ASSETS = [
  "/pwa/index.html",
  "/pwa/css/driver.css",
  "/pwa/js/app.js",
  "/pwa/js/route-viewer.js",
  "/pwa/js/hazard-reporter.js",
  "/pwa/js/tacho-logger.js",
  "/pwa/js/sync-agent.js",
  "/pwa/js/offline-nav.js",
  "/pwa/manifest.json"
];

// ─── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log(`[SW] Installing ${SW_VERSION}`);
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn("[SW] Shell pre-cache partial failure:", err))
  );
});

// ─── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log(`[SW] Activating ${SW_VERSION}`);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map(k => { console.log(`[SW] Deleting old cache: ${k}`); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ── 1. Tile requests → IndexedDB (handled by tile-manager.js in page context)
  //    SW just passes these through — tile-manager owns the IndexedDB cache
  if (url.pathname.includes("/tile/") || url.hostname.includes("openstreetmap.org") ||
      url.hostname.includes("maptiler.com") || url.hostname.includes("graphhopper.com")) {
    event.respondWith(networkFirst(event.request, RUNTIME_CACHE));
    return;
  }

  // ── 2. API sync requests → network first, queue on failure
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/sync/")) {
    event.respondWith(networkFirst(event.request, RUNTIME_CACHE));
    return;
  }

  // ── 3. App shell → cache first
  event.respondWith(cacheFirst(event.request, SHELL_CACHE));
});

// ─── BACKGROUND SYNC ─────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "ap3x-sync-queue") {
    console.log("[SW] Background sync triggered: ap3x-sync-queue");
    event.waitUntil(drainSyncQueue());
  }
});

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
// Receives hazard broadcasts and critical compliance alerts from control plane.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }

  const { title = "AP3X Alert", body = "", type = "info", data = {} } = payload;

  const options = {
    body,
    icon:  "/pwa/icons/icon-192.png",
    badge: "/pwa/icons/icon-192.png",
    tag:   type,
    data,
    requireInteraction: type === "hazard.critical.alert" || type === "tacho.violation",
    actions: type.startsWith("hazard") ? [
      { action: "view",    title: "View Hazard" },
      { action: "confirm", title: "Confirm"     },
      { action: "dispute", title: "Dispute"     }
    ] : []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { action } = event;
  const data       = event.notification.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then(clients => {
      const client = clients[0];
      if (client) {
        client.postMessage({ type: "NOTIFICATION_ACTION", action, data });
        return client.focus();
      }
      return self.clients.openWindow(`/pwa/index.html?action=${action}&hazardId=${data.hazardId || ""}`);
    })
  );
});

// ─── STRATEGIES ───────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline — resource not cached", { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ offline: true, error: "Network unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// ─── SYNC QUEUE DRAIN ─────────────────────────────────────────────────────────
async function drainSyncQueue() {
  // Open IndexedDB sync queue and replay pending operations
  return new Promise((resolve) => {
    const req = indexedDB.open("ap3x_sync_queue", 1);
    req.onsuccess = async (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("queue")) return resolve();

      const tx      = db.transaction("queue", "readwrite");
      const store   = tx.objectStore("queue");
      const getAllReq = store.getAll();

      getAllReq.onsuccess = async (ev) => {
        const items = ev.target.result || [];
        console.log(`[SW] Draining ${items.length} sync items`);

        for (const item of items) {
          try {
            const resp = await fetch(item.url, {
              method:  item.method || "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify(item.body)
            });
            if (resp.ok) store.delete(item.id);
          } catch (err) {
            console.warn(`[SW] Sync item ${item.id} failed:`, err.message);
          }
        }
        resolve();
      };
      getAllReq.onerror = () => resolve();
    };
    req.onerror = () => resolve();
  });
}
