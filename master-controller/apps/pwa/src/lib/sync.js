// AP3X PWA v2 — Sync Agent
// Queues outbound operations offline. Drains via Background Sync API or manual trigger.
// NO fleet admin. NO routing creation.

import { queuePush, queueGetAll, queueDelete, idbGet, idbSet } from "./idb.js";

const MAX_RETRIES = 5;
const DRAIN_INTERVAL_MS = 15_000;

let _drainTimer  = null;
let _listeners   = [];

export function onSyncEvent(fn) { _listeners.push(fn); }
function _emit(type, data) { _listeners.forEach(fn => fn(type, data)); }

export function isOnline() { return navigator.onLine; }

// ── Queue an outbound API call ─────────────────────────────────────────────

export async function queueSync(url, method = "POST", body = {}, priority = 1) {
  await queuePush({ url, method, body, priority });
  _emit("queued", { url, method });
  // Register background sync if supported
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    const reg = await navigator.serviceWorker.ready;
    reg.sync.register("ap3x-sync-queue").catch(() => {});
  }
}

// ── Drain queue manually (called on reconnect + timer) ──────────────────────

export async function drainQueue() {
  if (!isOnline()) return { drained: 0, failed: 0, remaining: 0 };
  const items = await queueGetAll();
  if (items.length === 0) return { drained: 0, failed: 0, remaining: 0 };

  _emit("draining", { count: items.length });

  let drained = 0, failed = 0;
  const sorted = [...items].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const item of sorted) {
    try {
      const resp = await fetch(item.url, {
        method:  item.method || "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(item.body),
      });
      if (resp.ok) {
        await queueDelete(item.id);
        drained++;
      } else {
        await _incrementRetry(item);
        failed++;
      }
    } catch {
      await _incrementRetry(item);
      failed++;
    }
  }

  const remaining = (await queueGetAll()).length;
  _emit("drained", { drained, failed, remaining });
  return { drained, failed, remaining };
}

async function _incrementRetry(item) {
  if (item.retries >= MAX_RETRIES) {
    await queueDelete(item.id);   // discard after max retries
    _emit("discarded", { id: item.id, url: item.url });
  }
  // item stays in queue — next drain will retry
}

// ── Pull server state for this device ──────────────────────────────────────

export async function pullServerState(identity) {
  if (!isOnline() || !identity?.deviceId) return null;
  try {
    const params = new URLSearchParams({
      driverId: identity.driverId,
      fleetId:  identity.fleetId,
      deviceId: identity.deviceId,
    });
    const resp = await fetch(`/api/driver/sync?${params}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.route)      await idbSet("ap3x_route",      data.route);
    if (data.compliance) await idbSet("ap3x_compliance", data.compliance);
    if (data.hazards)    await idbSet("ap3x_hazards",    data.hazards);
    _emit("pulled", data);
    return data;
  } catch {
    return null;
  }
}

// ── Start periodic drain ──────────────────────────────────────────────────

export function startSyncAgent(identity) {
  _drainTimer = setInterval(async () => {
    await drainQueue();
    await pullServerState(identity);
  }, DRAIN_INTERVAL_MS);

  window.addEventListener("online", () => {
    _emit("online", {});
    drainQueue();
    pullServerState(identity);
  });

  // Initial pull
  pullServerState(identity);
}

export function stopSyncAgent() {
  if (_drainTimer) clearInterval(_drainTimer);
}

export async function getSyncStatus() {
  const queue = await queueGetAll();
  return { pending: queue.length, online: isOnline() };
}
