// AP3X Driver PWA — App Shell (RUN 9)
// ═══════════════════════════════════════════════════════════════════════════════
// Entry point. Bootstraps the PWA:
//   1. Registers service worker
//   2. Loads driver identity from local store
//   3. Initialises sync agent
//   4. Mounts view modules into nav shell
//   5. Handles geolocation, push notifications, SW messages
//
// NO fleet admin. NO route creation. NO AI decisions.
// ═══════════════════════════════════════════════════════════════════════════════

import { initSyncAgent, queueSync, loadLocal, saveLocal, getSyncStatus, isOnline }
  from "./sync-agent.js";
import { initRouteViewer, loadRoute } from "./route-viewer.js";
import { initHazardReporter, ingestHazardBroadcast } from "./hazard-reporter.js";
import { initTachoLogger, updateSnapshot } from "./tacho-logger.js";
import { updatePosition, startNavigation } from "./offline-nav.js";

// ─── BOOT ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Show splash
  const splash = document.getElementById("splash");

  // 2. Register service worker
  await _registerSW();

  // 3. Load driver session from local store
  const identity = await _loadIdentity();

  // 4. Init modules
  const views = {
    route:  document.getElementById("view-route"),
    hazard: document.getElementById("view-hazard"),
    tacho:  document.getElementById("view-tacho"),
    status: document.getElementById("view-status")
  };

  // 5. Init sync agent
  await initSyncAgent({
    deviceId:  identity.deviceId,
    driverId:  identity.driverId,
    fleetId:   identity.fleetId,
    onSync:    _handleSyncData
  });

  // 6. Mount views
  if (views.route)  initRouteViewer(views.route);
  if (views.hazard) initHazardReporter(views.hazard, identity);
  if (views.tacho)  initTachoLogger(views.tacho, {
    ...identity,
    snapshot: await loadLocal("ap3x_compliance")
  });

  // 7. Load cached route if available
  const cachedRoute = await loadLocal("ap3x_route");
  if (cachedRoute && views.route) loadRoute(cachedRoute, views.route);

  // 8. Nav bar
  _initNavBar();

  // 9. Network indicator
  _initNetworkIndicator();

  // 10. Geolocation
  _startGeolocation();

  // 11. Push notification permission
  _requestPushPermission();

  // 12. SW message handler
  _bindSWMessages();

  // 13. Status view
  if (views.status) _renderStatusView(views.status, identity);

  // 14. Hide splash
  setTimeout(() => {
    if (splash) { splash.classList.add("hidden"); }
  }, 1200);
});

// ─── SERVICE WORKER ───────────────────────────────────────────────────────────

async function _registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("/pwa/sw.js", { scope: "/pwa/" });
    console.log("[App] SW registered:", reg.scope);
  } catch (err) {
    console.warn("[App] SW registration failed:", err.message);
  }
}

// ─── IDENTITY ────────────────────────────────────────────────────────────────

async function _loadIdentity() {
  const stored = await loadLocal("ap3x_identity");
  if (stored) return stored;

  // Fallback: read from URL params (deep link from fleet provisioning)
  const params   = new URLSearchParams(window.location.search);
  const identity = {
    driverId:  params.get("driverId")  || "UNBOUND",
    fleetId:   params.get("fleetId")   || "UNKNOWN",
    deviceId:  params.get("deviceId")  || _getOrCreateDeviceId(),
    driverName:params.get("name")      || "Driver"
  };

  await saveLocal("ap3x_identity", identity);
  return identity;
}

function _getOrCreateDeviceId() {
  let id = localStorage.getItem("ap3x_device_id");
  if (!id) {
    id = `DEV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    localStorage.setItem("ap3x_device_id", id);
  }
  return id;
}

// ─── SYNC DATA HANDLER ────────────────────────────────────────────────────────

function _handleSyncData(type, data) {
  switch (type) {
    case "route": {
      const routeView = document.getElementById("view-route");
      if (routeView) loadRoute(data, routeView);
      break;
    }
    case "hazard_broadcast": {
      ingestHazardBroadcast(data);
      _bumpNavBadge("nav-hazard", 1);
      break;
    }
    case "compliance": {
      const tachoView = document.getElementById("view-tacho");
      if (tachoView) updateSnapshot(tachoView, data);
      break;
    }
    case "safety": {
      if (!data.approved) {
        _showBanner(`Safety block: ${data.blockers?.[0] || "Route rejected"}`, "red");
      }
      break;
    }
  }
}

// ─── NAV BAR ─────────────────────────────────────────────────────────────────

function _initNavBar() {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      const target = item.dataset.view;

      document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));

      item.classList.add("active");
      item.querySelector(".nav-badge")?.remove();

      const view = document.getElementById(`view-${target}`);
      if (view) view.classList.add("active");
    });
  });

  // Default to route view
  document.querySelector('[data-view="route"]')?.click();
}

function _bumpNavBadge(navId, count) {
  const item = document.getElementById(navId);
  if (!item) return;
  let badge = item.querySelector(".nav-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "nav-badge";
    item.appendChild(badge);
  }
  const cur = parseInt(badge.textContent || "0");
  badge.textContent = cur + count;
}

// ─── NETWORK INDICATOR ────────────────────────────────────────────────────────

function _initNetworkIndicator() {
  const dot    = document.getElementById("header-status-dot");
  const label  = document.getElementById("header-status-label");
  const banner = document.getElementById("offline-banner");

  const update = () => {
    const online = navigator.onLine;
    if (dot)   { dot.className   = `status-dot ${online ? "online" : "offline"}`; }
    if (label) { label.textContent = online ? "Online" : "Offline"; }
    if (banner){ banner.classList.toggle("visible", !online); }
  };

  window.addEventListener("online",  update);
  window.addEventListener("offline", update);

  // Sync events
  window.addEventListener("ap3x:sync.draining", () => {
    if (dot) dot.className = "status-dot syncing";
  });
  window.addEventListener("ap3x:sync.complete", () => {
    if (dot) dot.className = `status-dot ${navigator.onLine ? "online" : "offline"}`;
  });

  update();
}

// ─── GEOLOCATION ─────────────────────────────────────────────────────────────

function _startGeolocation() {
  if (!("geolocation" in navigator)) return;
  navigator.geolocation.watchPosition(
    (pos) => updatePosition({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, heading: pos.coords.heading, speed: pos.coords.speed }),
    (err) => console.warn("[App] Geolocation error:", err.message),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );
}

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────

async function _requestPushPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") return;
  if (Notification.permission === "denied")  return;
  try {
    await Notification.requestPermission();
  } catch { /* silently ignore */ }
}

// ─── SW MESSAGES ─────────────────────────────────────────────────────────────

function _bindSWMessages() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const { type, action, data } = event.data || {};
    if (type === "NOTIFICATION_ACTION") {
      if (action === "confirm" || action === "dispute") {
        queueSync(`/api/hazard/${action}`, "POST", data);
      }
    }
  });
}

// ─── STATUS VIEW ─────────────────────────────────────────────────────────────

function _renderStatusView(container, identity) {
  container.innerHTML = `
    <div class="card highlight">
      <div class="card-title">Driver Identity</div>
      <div class="text-sm" style="display:flex;flex-direction:column;gap:6px">
        <div class="flex-between"><span class="text-muted">Driver ID</span><span class="font-mono text-cyan">${identity.driverId}</span></div>
        <div class="flex-between"><span class="text-muted">Fleet</span><span class="font-mono">${identity.fleetId}</span></div>
        <div class="flex-between"><span class="text-muted">Device</span><span class="font-mono text-sm">${identity.deviceId}</span></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Device Status</div>
      <div id="status-details" style="display:flex;flex-direction:column;gap:8px;font-size:0.8rem">
        <div class="flex-between"><span class="text-muted">Network</span><span id="st-online" class="text-green">Online</span></div>
        <div class="flex-between"><span class="text-muted">SW</span><span id="st-sw" class="text-muted">Checking…</span></div>
        <div class="flex-between"><span class="text-muted">Geolocation</span><span id="st-geo" class="text-muted">—</span></div>
        <div class="flex-between"><span class="text-muted">Notifications</span><span id="st-push">${Notification?.permission || "N/A"}</span></div>
        <div class="flex-between"><span class="text-muted">Tile Cache</span><span id="st-tiles" class="text-muted">—</span></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Sync Queue</div>
      <div id="status-sync-info" class="text-sm text-muted">Loading…</div>
      <button class="btn btn-secondary btn-full mt-8" id="st-btn-sync">↻ Force Sync Now</button>
    </div>

    <div class="card">
      <div class="card-title">AP3X Driver</div>
      <div class="text-sm text-muted">Version: RUN 9 · Service Worker: ap3x-sw-v1</div>
      <div class="text-sm text-muted mt-4">Offline-first. Data lives locally until sync.</div>
    </div>
  `;

  // SW status
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      const swEl = document.getElementById("st-sw");
      if (swEl) swEl.textContent = reg ? "Active" : "Not registered";
      if (swEl && reg) swEl.className = "text-green";
    });
  }

  // Geo status
  const geoEl = document.getElementById("st-geo");
  if (geoEl) {
    if ("geolocation" in navigator) {
      geoEl.textContent  = "Available";
      geoEl.className    = "text-green";
    } else {
      geoEl.textContent  = "Unavailable";
      geoEl.className    = "text-red";
    }
  }

  // Network
  const onlineEl = document.getElementById("st-online");
  window.addEventListener("online",  () => { if (onlineEl) { onlineEl.textContent = "Online";  onlineEl.className = "text-green"; } });
  window.addEventListener("offline", () => { if (onlineEl) { onlineEl.textContent = "Offline"; onlineEl.className = "text-amber"; } });
  if (onlineEl && !navigator.onLine) { onlineEl.textContent = "Offline"; onlineEl.className = "text-amber"; }

  // Force sync
  document.getElementById("st-btn-sync")?.addEventListener("click", async () => {
    if (!isOnline()) { _showBanner("Cannot sync — device is offline", "amber"); return; }
    const { pullFromServer } = await import("./sync-agent.js");
    await pullFromServer();
    _showBanner("Sync complete", "green");
  });
}

// ─── BANNER ───────────────────────────────────────────────────────────────────

function _showBanner(msg, color = "amber") {
  const banner = document.getElementById("offline-banner");
  if (!banner) return;
  banner.textContent = msg;
  banner.className   = `offline-banner visible text-${color}`;
  setTimeout(() => { banner.classList.remove("visible"); }, 4000);
}
