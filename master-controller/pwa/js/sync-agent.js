// AP3X Device Sync Agent — RUN 9
// Manages bidirectional sync between driver device and control plane.
// Offline queue: operations persisted to IndexedDB, replayed on reconnect.
// Sync scope: route state, hazard reports, tacho activity, device heartbeat.
// NO fleet admin data. NO route creation. NO AI decisions.

const SYNC_DB_NAME    = "ap3x_sync_queue";
const SYNC_DB_VERSION = 1;
const SYNC_STORE      = "queue";
const SYNC_INTERVAL   = 30_000;    // 30s polling when online
const HEARTBEAT_MS    = 60_000;    // 1min heartbeat to control plane

let _db          = null;
let _online      = navigator.onLine;
let _syncTimer   = null;
let _heartTimer  = null;
let _deviceId    = null;
let _driverId    = null;
let _fleetId     = null;
let _onSyncCb    = null;           // callback(type, data) for received data

// ─── INIT ─────────────────────────────────────────────────────────────────────

/**
 * Initialise the sync agent.
 * @param {object} config - { deviceId, driverId, fleetId, onSync(type, data) }
 */
export async function initSyncAgent(config) {
  _deviceId  = config.deviceId;
  _driverId  = config.driverId;
  _fleetId   = config.fleetId;
  _onSyncCb  = config.onSync || (() => {});

  await _openDB();
  _bindNetworkEvents();
  _startSyncLoop();
  _startHeartbeat();

  // Initial sync on load
  if (_online) await _drainQueue();

  _emit("sync.init", { deviceId: _deviceId, online: _online });
}

// ─── QUEUE SYNC (offline-safe write) ─────────────────────────────────────────

/**
 * Queue an operation for sync. Returns immediately.
 * If online, attempts immediate send. Persists to IndexedDB regardless.
 * @param {string} url    - API endpoint
 * @param {string} method - HTTP method
 * @param {object} body   - Payload
 */
export async function queueSync(url, method = "POST", body = {}) {
  const item = {
    id:          crypto.randomUUID(),
    url,
    method,
    body,
    queuedAt:    Date.now(),
    attempts:    0,
    maxAttempts: 5
  };

  await _put(item);
  _emit("sync.queued", { id: item.id, url, queuedAt: item.queuedAt });

  if (_online) {
    _drainQueue().catch(err => console.warn("[Sync] Drain error:", err.message));
  } else {
    _scheduleBackgroundSync();
  }

  return item;
}

// ─── PULL (receive from control plane) ───────────────────────────────────────

/**
 * Pull latest data from control plane.
 * Called on reconnect and on schedule.
 */
export async function pullFromServer() {
  if (!_online) return null;

  try {
    const resp = await fetch(`/api/driver/sync?driverId=${_driverId}&fleetId=${_fleetId}&deviceId=${_deviceId}`, {
      headers: { "Content-Type": "application/json" }
    });

    if (!resp.ok) throw new Error(`Pull failed: ${resp.status}`);

    const data = await resp.json();
    _handlePullData(data);
    return data;

  } catch (err) {
    console.warn("[Sync] Pull failed:", err.message);
    return null;
  }
}

// ─── HEARTBEAT ────────────────────────────────────────────────────────────────

async function _sendHeartbeat() {
  if (!_online) return;
  await queueSync("/api/device/heartbeat", "POST", {
    deviceId:  _deviceId,
    driverId:  _driverId,
    fleetId:   _fleetId,
    timestamp: Date.now(),
    online:    true,
    userAgent: navigator.userAgent
  });
}

// ─── DRAIN QUEUE ─────────────────────────────────────────────────────────────

async function _drainQueue() {
  const items = await _getAll();
  if (items.length === 0) return;

  _emit("sync.draining", { count: items.length });

  for (const item of items) {
    if (item.attempts >= item.maxAttempts) {
      await _delete(item.id);
      _emit("sync.dropped", { id: item.id, url: item.url, reason: "max_attempts" });
      continue;
    }

    try {
      const resp = await fetch(item.url, {
        method:  item.method || "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(item.body)
      });

      if (resp.ok) {
        await _delete(item.id);
        _emit("sync.sent", { id: item.id, url: item.url });
      } else {
        item.attempts++;
        item.lastError = `HTTP ${resp.status}`;
        await _put(item);
      }
    } catch (err) {
      item.attempts++;
      item.lastError = err.message;
      await _put(item);
    }
  }

  _emit("sync.complete", { drained: items.length });
}

// ─── INCOMING DATA HANDLER ────────────────────────────────────────────────────

function _handlePullData(data) {
  if (!data) return;

  // Route update
  if (data.route) {
    _saveLocal("ap3x_route", data.route);
    _onSyncCb("route", data.route);
    _emit("sync.received.route", { routeId: data.route.id });
  }

  // Hazard broadcasts
  if (data.hazardBroadcasts && data.hazardBroadcasts.length > 0) {
    data.hazardBroadcasts.forEach(b => {
      _onSyncCb("hazard_broadcast", b);
    });
    _emit("sync.received.hazards", { count: data.hazardBroadcasts.length });
  }

  // Compliance snapshot
  if (data.complianceSnapshot) {
    _saveLocal("ap3x_compliance", data.complianceSnapshot);
    _onSyncCb("compliance", data.complianceSnapshot);
    _emit("sync.received.compliance", {});
  }

  // Safety decision
  if (data.safetyDecision) {
    _onSyncCb("safety", data.safetyDecision);
  }
}

// ─── LOCAL STORE (IndexedDB simple k/v for received data) ────────────────────

export function saveLocal(key, value) { return _saveLocal(key, value); }
export function loadLocal(key)        { return _loadLocal(key); }

// ─── NETWORK EVENTS ───────────────────────────────────────────────────────────

function _bindNetworkEvents() {
  window.addEventListener("online",  () => {
    _online = true;
    _emit("sync.online", {});
    _drainQueue().then(() => pullFromServer());
  });
  window.addEventListener("offline", () => {
    _online = false;
    _emit("sync.offline", {});
  });
}

// ─── TIMERS ───────────────────────────────────────────────────────────────────

function _startSyncLoop() {
  _syncTimer = setInterval(async () => {
    if (_online) {
      await _drainQueue();
      await pullFromServer();
    }
  }, SYNC_INTERVAL);
}

function _startHeartbeat() {
  _heartTimer = setInterval(_sendHeartbeat, HEARTBEAT_MS);
}

function _scheduleBackgroundSync() {
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    navigator.serviceWorker.ready
      .then(sw => sw.sync.register("ap3x-sync-queue"))
      .catch(() => {});
  }
}

// ─── INDEXEDDB (sync queue store) ────────────────────────────────────────────

async function _openDB() {
  if (_db) return;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SYNC_DB_NAME, SYNC_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE, { keyPath: "id" });
      }
      // Local data store
      if (!db.objectStoreNames.contains("local")) {
        db.createObjectStore("local", { keyPath: "key" });
      }
    };
    req.onsuccess  = (e) => { _db = e.target.result; resolve(); };
    req.onerror    = (e) => reject(e.target.error);
  });
}

async function _put(item) {
  return new Promise((resolve, reject) => {
    const tx  = _db.transaction(SYNC_STORE, "readwrite");
    tx.objectStore(SYNC_STORE).put(item).onsuccess  = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function _delete(id) {
  return new Promise((resolve) => {
    const tx  = _db.transaction(SYNC_STORE, "readwrite");
    tx.objectStore(SYNC_STORE).delete(id).onsuccess = () => resolve();
  });
}

async function _getAll() {
  return new Promise((resolve, reject) => {
    const req = _db.transaction(SYNC_STORE, "readonly").objectStore(SYNC_STORE).getAll();
    req.onsuccess = (e) => resolve((e.target.result || []).sort((a, b) => a.queuedAt - b.queuedAt));
    req.onerror   = (e) => reject(e.target.error);
  });
}

function _saveLocal(key, value) {
  return new Promise((resolve) => {
    const tx = _db.transaction("local", "readwrite");
    tx.objectStore("local").put({ key, value, savedAt: Date.now() }).onsuccess = () => resolve();
  });
}

function _loadLocal(key) {
  return new Promise((resolve) => {
    const req = _db.transaction("local", "readonly").objectStore("local").get(key);
    req.onsuccess = (e) => resolve(e.target.result?.value ?? null);
    req.onerror   = () => resolve(null);
  });
}

// ─── STATUS ───────────────────────────────────────────────────────────────────

export function getSyncStatus() {
  return { online: _online, deviceId: _deviceId, driverId: _driverId };
}

export function isOnline() { return _online; }

// ─── EVENT BUS ────────────────────────────────────────────────────────────────

function _emit(type, detail) {
  window.dispatchEvent(new CustomEvent(`ap3x:${type}`, { detail }));
}
